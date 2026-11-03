'use strict';

/**
 * Siber Live - SiberLiveConnection
 *
 * Implementasi mandiri koneksi TikTok LIVE (fase 1), terinspirasi arsitektur
 * tiktok-live-connector v2 tetapi ditulis ulang:
 *
 *   - Room lookup : langsung ke TikTok (HTML SIGI_STATE -> api-live fallback).
 *   - Signing     : lewat interface signingProvider (lihat signing.js).
 *                   Default: endpoint Euler /connect via fetch (tanpa SDK).
 *   - WebSocket   : ws + frame webcast (heartbeat, ack, im_enter_room).
 *   - Event       : EventEmitter; nama event sama dengan WebcastEvent/ControlEvent
 *                   ekosistem connector agar handler portabel.
 *   - Data event  : objek hasil decode tiktok-live-proto/v3 (camelCase, Long
 *                   sebagai string). Ditambah `extendedGiftInfo` bila opsi
 *                   enableExtendedGiftInfo aktif.
 *
 * Catatan: tidak ada auto-reconnect di fase 1 — dengarkan ControlEvent.DISCONNECTED.
 */

const { EventEmitter } = require('node:events');
const { getSchema, decodeFetchResult } = require('./protobuf');
const { WebClient } = require('./http');
const { WebcastSocket } = require('./socket');
const { resolveSigningProvider } = require('./signing');
const { normalizeEventData } = require('./util');
const { ControlEvent, WebcastEvent, WebcastEventMap, ConnectState } = require('./events');
const { wsParams, getPreset, WS_PARAMS_APPENDIX } = require('./config');
const {
    SiberLiveError,
    InvalidUniqueIdError,
    AlreadyConnectedError,
    AlreadyConnectingError,
    UserOfflineError,
    InvalidResponseError,
    ConnectTimeoutError,
} = require('./errors');

function validateAndNormalizeUniqueId(uniqueId) {
    if (typeof uniqueId !== 'string' || !uniqueId.trim()) {
        throw new InvalidUniqueIdError('uniqueId wajib berupa string username TikTok (boleh dengan @ atau URL penuh).');
    }
    return uniqueId
        .replace('https://www.tiktok.com/', '')
        .replace('http://www.tiktok.com/', '')
        .replace('/live', '')
        .replace(/@/g, '')
        .trim();
}

class SiberLiveConnection extends EventEmitter {
    /**
     * @param {string} uniqueId username streamer (@boleh, URL boleh)
     * @param {object} [options]
     * @param {Function|'euler'|object} [options.signingProvider='euler']
     * @param {string} [options.signApiKey] key Euler (dipakai provider default)
     * @param {string} [options.signApiUrl]  base url sign server
     * @param {boolean} [options.processInitialData=true]
     * @param {boolean} [options.fetchRoomInfoOnConnect=true]
     * @param {boolean} [options.enableExtendedGiftInfo=false]
     * @param {boolean} [options.useDefaultEulerKey=false] pakai apiKey bawaan
     *        dari presets web (hanya untuk uji coba; lihat signing.js)
     * @param {object} [options.clientPresets={device,location,screen}]
     * @param {number} [options.heartbeatIntervalMs=10000]
     * @param {number} [options.connectTimeoutMs=20000]
     */
    constructor(uniqueId, options = {}) {
        super();
        this.uniqueId = validateAndNormalizeUniqueId(uniqueId);
        this.options = options;

        this._presets = options.clientPresets || getPreset(options.randomizePresets === true);
        this._web = new WebClient(this._presets);
        this._fetchRoomInfoOnConnect = options.fetchRoomInfoOnConnect ?? true;
        this._processInitialData = options.processInitialData ?? true;
        this._enableExtendedGiftInfo = options.enableExtendedGiftInfo ?? false;

        this._sign = resolveSigningProvider(options.signingProvider ?? 'euler', {
            baseURL: options.signApiUrl,
            apiKey: options.signApiKey,
            timeoutMs: options.signTimeoutMs,
            platform: options.platform,
        });

        this._state = ConnectState.DISCONNECTED;
        this._socket = null;
        this._roomInfo = null;
        this._availableGifts = null;
        this._cursor = '';
        this._internalExt = '';
    }

    // ---- public getters (paritas dengan connector) ----
    get roomId() { return this._web.roomId; }
    get roomInfo() { return this._roomInfo; }
    get availableGifts() { return this._availableGifts; }
    get isConnected() { return this._state === ConnectState.CONNECTED; }
    get isConnecting() { return this._state === ConnectState.CONNECTING; }
    get webClient() { return this._web; }
    get state() {
        return {
            isConnected: this.isConnected,
            isConnecting: this.isConnecting,
            roomId: this.roomId,
            roomInfo: this._roomInfo,
            availableGifts: this._availableGifts,
        };
    }

    // ---- room helpers ----
    fetchRoomId(uniqueId = this.uniqueId) {
        return this._web.resolveRoomId(uniqueId);
    }

    fetchIsLive(uniqueId = this.uniqueId) {
        return this._web.fetchIsLive(uniqueId);
    }

    async fetchRoomInfo(roomId = this.roomId) {
        if (!roomId) roomId = await this.fetchRoomId();
        this._roomInfo = await this._web.fetchRoomInfo(roomId);
        return this._roomInfo;
    }

    /**
     * Daftar gift tersedia di room. Memerlukan request yang ditandatangani;
     * kalau TikTok menolak (butuh login), hasil fallback: null.
     */
    async fetchAvailableGifts() {
        try {
            this._availableGifts = await this._web.fetchRoomGifts();
        } catch {
            this._availableGifts = null;
        }
        return this._availableGifts;
    }

    /** Tunggu sampai streamer LIVE (polling). abortSignal opsional. */
    async waitUntilLive(seconds = 60, abortSignal) {
        seconds = Math.max(30, seconds);
        for (;;) {
            if (abortSignal?.aborted) throw abortSignal.reason;
            let live = false;
            try { live = await this.fetchIsLive(); }
            catch (err) {
                if (abortSignal?.aborted) throw abortSignal.reason;
                this.emit(ControlEvent.ERROR, { info: 'waitUntilLive check failed', exception: err });
            }
            if (live) return;
            await new Promise((r, j) => {
                const t = setTimeout(r, seconds * 1000);
                abortSignal?.addEventListener('abort', () => {
                    clearTimeout(t);
                    j(abortSignal.reason);
                }, { once: true });
            });
        }
    }

    // ---- connect / disconnect ----
    async connect(roomId) {
        if (this._state === ConnectState.CONNECTED) throw new AlreadyConnectedError('Sudah terhubung!');
        if (this._state === ConnectState.CONNECTING) throw new AlreadyConnectingError('Sudah sedang terhubung!');

        this._state = ConnectState.CONNECTING;
        try {
            await this._connect(roomId);
            this._state = ConnectState.CONNECTED;
            this.emit(ControlEvent.CONNECTED, this.state);
            return this.state;
        } catch (err) {
            this._setDisconnected();
            this._handleError(err, 'Error while connecting');
            throw err;
        }
    }

    async _connect(roomIdOverride) {
        const roomId = roomIdOverride || this.roomId || (await this.fetchRoomId());
        this._web.roomId = roomId;

        if (this._fetchRoomInfoOnConnect) {
            const info = await this.fetchRoomInfo(roomId);
            const status = info?.data?.status ?? info?.status;
            if (status === 4) throw new UserOfflineError('Streamer tidak sedang LIVE.');
        }

        if (this._enableExtendedGiftInfo) await this.fetchAvailableGifts();

        const signed = await this._sign({
            roomId,
            uniqueId: this.uniqueId,
            cursor: this._cursor,
            userAgent: this._presets.device.user_agent,
        });

        if (signed.cookieHeader) {
            this._web.cookieJar.ingest(String(signed.cookieHeader).split(/,(?=[^,;]+=)/));
        }

        const finalRoomId = signed.roomId || roomId;
        if (finalRoomId !== this._web.roomId) this._web.roomId = finalRoomId;

        const schema = await getSchema();
        let fetchResult;
        if (signed.fetchResultMessage && typeof signed.fetchResultMessage === 'object') {
            // Provider mengembalikan objek ProtoMessageFetchResult (sudah terurai)
            fetchResult = signed.fetchResultMessage;
            for (const m of fetchResult.messages || []) {
                if (!m.method || typeof schema[m.method]?.decode !== 'function') { m.decodedData = null; continue; }
                try { m.decodedData = { type: m.method, data: schema[m.method].decode(m.payload) }; }
                catch { m.decodedData = null; }
            }
        } else if (signed.fetchResult) {
            fetchResult = await decodeFetchResult(signed.fetchResult);
        } else {
            throw new InvalidResponseError('Signing provider tidak mengembalikan fetchResult (ProtoMessageFetchResult).');
        }

        if (this._processInitialData && fetchResult.messages?.length) {
            await this._processFetchResult(fetchResult);
        }

        if (!fetchResult.cursor) {
            throw new InvalidResponseError(
                `Missing cursor in initial fetch response. (fetchType=${fetchResult.fetchType}, internalExt=${Boolean(fetchResult.internalExt)}, messages=${fetchResult.messages?.length ?? 0})`
            );
        }
        this._cursor = fetchResult.cursor;
        this._internalExt = fetchResult.internalExt || '';

        if (!fetchResult.pushServer) throw new InvalidResponseError('Missing pushServer in initial fetch response.');

        await this._setupWebsocket(fetchResult, finalRoomId);
    }

    async _setupWebsocket(fetchResult, roomId) {
        const params = new URLSearchParams({
            ...wsParams(this._presets),
            room_id: roomId,
            cursor: fetchResult.cursor,
            internal_ext: fetchResult.internalExt || '',
            compress: 'gzip',
            ...Object.fromEntries(
                Object.entries(fetchResult.routeParams || {})
                    .filter(([k, v]) => k && v != null && v !== '')
                    .map(([k, v]) => [k, String(v)])
            ),
        });
        const url = `${fetchResult.pushServer}?${params}${WS_PARAMS_APPENDIX}`;

        const socket = new WebcastSocket({
            url,
            headers: {
                'User-Agent': this._presets.device.user_agent,
                Cookie: this._web.cookieJar.getCookieString(),
            },
            roomId,
            heartbeatIntervalMs: this.options.heartbeatIntervalMs ?? 10000,
            connectTimeoutMs: this.options.connectTimeoutMs ?? 20000,
        });

        socket.on('rawMessage', (buf) => this.emit(ControlEvent.WEBSOCKET_DATA, buf));
        socket.on('fetchResult', (r) => { this._cursor = r.cursor || this._cursor; this._processFetchResult(r); });
        socket.on('enteredRoom', (f) => this.emit(ControlEvent.ENTER_ROOM, f));
        socket.on('decodeError', (err) => this._handleError(err, 'Websocket message decoding failed'));
        socket.on('socketError', (err) => this._handleError(err, 'WebSocket error'));
        socket.on('close', (code, reason) => {
            if (this._socket !== socket) return;
            this._socket = null;
            this._setDisconnected();
            this.emit(ControlEvent.DISCONNECTED, { code, reason });
        });

        this._socket = socket;

        try {
            await socket.connect();
        } catch (err) {
            if (this._socket === socket) this._socket = null;
            if (err && /timed out|handshake/i.test(err.message)) {
                throw new ConnectTimeoutError(`Gagal membuka WebSocket: ${err.message}`);
            }
            throw err;
        }

        await socket.enterRoom();
        this.emit(ControlEvent.WEBSOCKET_CONNECTED, socket);
    }

    async disconnect() {
        const socket = this._socket;
        this._socket = null;
        if (!socket) {
            this._setDisconnected();
            return;
        }
        await new Promise((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            socket.once('close', finish);
            socket.close(1000);
            setTimeout(finish, this.options.disconnectTimeoutMs ?? 2000).unref?.();
        });
        this._setDisconnected();
    }

    _setDisconnected() {
        this._state = ConnectState.DISCONNECTED;
        this._roomInfo = null;
        this._availableGifts = null;
        this._cursor = '';
        this._internalExt = '';
    }

    // ---- event pipeline ----
    async _processFetchResult(fetchResult) {
        for (const message of fetchResult.messages || []) {
            if (!message.decodedData) continue;
            // Normalize sebelum emit; decodedData.data sudah dilengkapi getter kompatibel
            try {
                normalizeEventData(message.decodedData);
            } catch { /* jangan gagalkan pipeline karena normalisasi */ }
            this.emit(ControlEvent.DECODED_DATA, message.method, message.decodedData, message.payload);
            try {
                await this._processDecodedData(message.decodedData);
            } catch (ex) {
                this._handleError(ex, 'Failed to process decoded data');
            }
        }
    }

    async _processDecodedData({ type, data }) {
        switch (type) {
            case 'WebcastSocialMessage': {
                const key = data.common?.displayText?.key || '';
                if (key.includes('follow')) return this.emit(WebcastEvent.FOLLOW, data);
                if (key.includes('share')) return this.emit(WebcastEvent.SHARE, data);
                return this.emit(WebcastEvent.SOCIAL, data);
            }
            case 'WebcastControlMessage': {
                this.emit(WebcastEvent.CONTROL_MESSAGE, data);
                const schema = await getSchema();
                const { CONTROL_ACTION_STREAM_ENDED, CONTROL_ACTION_STREAM_SUSPENDED } = schema.ControlAction;
                if (data.action === CONTROL_ACTION_STREAM_ENDED || data.action === CONTROL_ACTION_STREAM_SUSPENDED) {
                    this.emit(WebcastEvent.STREAM_END, { action: data.action });
                    await this.disconnect();
                }
                return;
            }
            case 'WebcastGiftMessage': {
                if (Array.isArray(this._availableGifts) && data.giftId) {
                    data.extendedGiftInfo = this._availableGifts.find((x) => String(x.id) === String(data.giftId)) || null;
                }
                return this.emit(WebcastEvent.GIFT, data);
            }
            case 'WebcastBarrageMessage': {
                const keys = [data.content?.key, data.commonBarrageContent?.key]
                    .filter((v) => typeof v === 'string' && v)
                    .map((v) => v.toLowerCase());
                if (keys.some((v) => v.includes('ttlive_superfan_commentnotif_superfanjoined'))) {
                    this.emit(WebcastEvent.SUPER_FAN_JOIN, data);
                } else if (keys.some((v) => v.includes('ttlive_superfan'))) {
                    this.emit(WebcastEvent.SUPER_FAN, data);
                }
                return this.emit(WebcastEvent.BARRAGE, data);
            }
            case 'WebcastEnvelopeMessage': {
                const schema = await getSchema();
                const isBox = (data.common?.displayText?.key || '').toLowerCase().includes('ttlive_superfanbox')
                    || data.envelopeInfo?.businessType === schema.EnvelopeBusinessType.SUPER_FAN_BOX;
                if (isBox) this.emit(WebcastEvent.SUPER_FAN_BOX, data);
                return this.emit(WebcastEvent.ENVELOPE, data);
            }
            default: {
                const eventName = WebcastEventMap[type];
                return eventName && this.emit(eventName, data);
            }
        }
    }

    _handleError(exception, info) {
        if (this.listenerCount(ControlEvent.ERROR) < 1) return;
        this.emit(ControlEvent.ERROR, { info, exception });
    }
}

module.exports = { SiberLiveConnection, validateAndNormalizeUniqueId, SiberLiveError };
