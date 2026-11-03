'use strict';

/**
 * Siber Live - klien WebSocket webcast.
 *
 * WebSocket `ws` standar + frame webcast:
 *  - pesan masuk didecode (protobuf.js), di-emit apa adanya ke handler
 *  - heartbeat (payloadType 'hb') dikirim berkala ke roomId
 *  - ack (payloadType 'ack') dikirim bila fetch result minta needAck
 *  - im_enter_room dikirim untuk berpindah ruang, dan diulang saat reconnect
 *    (server memutuskan dengan close code 1000 kalau tidak masuk ruang)
 *
 * Klien ini tidak tahu-menahu soal signing; url bertanda tangan diberikan
 * oleh signing provider (signing.js).
 */

const { EventEmitter } = require('node:events');
const WebSocket = require('ws');
const { decodeIncomingFrame, buildHeartbeatFrame, buildAckFrame, buildEnterRoomFrame } = require('./protobuf');

const TEXT_ENCODER = new TextEncoder();

function generateUniqId() {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    bytes[0] &= 0x7f; // positive java long
    let val = 0n;
    for (const b of bytes) val = (val << 8n) | BigInt(b);
    if (val === 0n) val = 1n;
    return val.toString();
}

class WebcastSocket extends EventEmitter {
    /**
     * @param {object} opts
     * @param {string} opts.url        WebSocket url (sudah bertanda tangan) lengkap dengan query params
     * @param {object} [opts.headers]  Header handshake (User-Agent, Cookie, ...)
     * @param {string} opts.roomId
     * @param {number} [opts.heartbeatIntervalMs]
     */
    constructor({ url, headers, roomId, heartbeatIntervalMs = 10000, connectTimeoutMs = 20000 }) {
        super();
        this.url = url;
        this.headers = headers || {};
        this.roomId = roomId;
        this.heartbeatIntervalMs = heartbeatIntervalMs;
        this.connectTimeoutMs = connectTimeoutMs;

        this._ws = null;
        this._seqId = 1;
        this._pingTimer = null;
        this._closedByUs = false;
    }

    get isOpen() {
        return !!this._ws && this._ws.readyState === WebSocket.OPEN;
    }

    /** Buka koneksi dan resolve setelah handshake 'open'. */
    connect() {
        return new Promise((resolve, reject) => {
            const ws = this._ws = new WebSocket(this.url, {
                headers: this.headers,
                perMessageDeflate: false,
                handshakeTimeout: this.connectTimeoutMs,
            });

            const fail = (err) => {
                clearTimeout(timer);
                ws.removeAllListeners();
                try { ws.terminate(); } catch { /* noop */ }
                this._ws = null;
                reject(err);
            };

            const timer = setTimeout(
                () => fail(new Error(`WebSocket connect timed out after ${this.connectTimeoutMs}ms`)),
                this.connectTimeoutMs
            );

            ws.once('open', () => {
                clearTimeout(timer);
                ws.removeListener('error', fail);
                resolve();
            });
            ws.once('unexpected-response', (_, res) =>
                fail(new Error(`WebSocket handshake rejected with HTTP ${res.statusCode} ${
                    res.headers['handshake-msg'] || ''}`.trim()))
            );

            ws.on('message', (data) => this._onMessage(data));
            ws.on('close', (code, reason) => {
                this._stopHeartbeat();
                this.emit('close', code, reason ? reason.toString() : '');
            });
            ws.on('error', (err) => {
                // After 'open' errors normally precede close; forward for logging.
                this.emit('socketError', err);
            });
        });
    }

    sendBytes(buf) {
        if (!this.isOpen) return false;
        this._ws.send(buf);
        return true;
    }

    /** Masuk/ganti ruang. Wajib dipanggil segera setelah open. */
    async enterRoom() {
        this._seqId = 1;
        const frame = await buildEnterRoomFrame({ roomId: this.roomId, enterUniqueId: generateUniqId() });
        this.sendBytes(Buffer.from(frame));
        this._startHeartbeat();
    }

    close(code = 1000) {
        this._closedByUs = true;
        this._stopHeartbeat();
        if (this._ws) {
            try { this._ws.close(code); } catch { /* noop */ }
        }
    }

    async _onMessage(data) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        this.emit('rawMessage', buf);

        let frame;
        try {
            // PENTING: decodeIncomingFrame async (gzip decode) -> wajib await,
            // kalau tidak `frame` hanya Promise dan semua pesan pasca-connect hilang.
            frame = await decodeIncomingFrame(buf);
        } catch (err) {
            this.emit('decodeError', err);
            return;
        }

        if (frame.protoMessageFetchResult) {
            if (frame.protoMessageFetchResult.needAck && frame.logId) {
                this._sendAck(frame);
            }
            this.emit('fetchResult', frame.protoMessageFetchResult);
        }

        if (frame.payloadType === 'im_enter_room_resp') {
            this.emit('enteredRoom', frame);
        }
    }

    _sendAck(frame) {
        const internalExt = frame.protoMessageFetchResult?.internalExt;
        if (!internalExt) return;
        buildAckFrame(frame.logId, internalExt)
            .then((f) => this.sendBytes(Buffer.from(f)))
            .catch((err) => this.emit('decodeError', err));
    }

    _startHeartbeat() {
        this._stopHeartbeat();
        this._pingTimer = setInterval(() => {
            buildHeartbeatFrame(this.roomId, String(this._seqId++))
                .then((f) => this.sendBytes(Buffer.from(f)))
                .catch(() => { /* heartbeat gagal; close handler akan menangani */ });
        }, this.heartbeatIntervalMs);
        this._pingTimer.unref?.();
    }

    _stopHeartbeat() {
        if (this._pingTimer) clearInterval(this._pingTimer);
        this._pingTimer = null;
    }
}

module.exports = { WebcastSocket, generateUniqId };
