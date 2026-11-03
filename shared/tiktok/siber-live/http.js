'use strict';

/**
 * Siber Live - HTTP client & room lookup (langsung ke TikTok, tanpa Euler).
 *
 * Room ID / status LIVE resolve lewat dua jalur (fallback berurutan):
 *   1. Scrape halaman https://www.tiktok.com/@user/live -> JSON SIGI_STATE
 *   2. Endpoint https://www.tiktok.com/api-live/user/room/
 *
 * Menggunakan fetch bawaan Node (>=18). Cookie jar sederhana: TikTok tidak
 * mem-scoped cookie by path untuk keperluan kita, jadi simpan flat key/value.
 */

const { InvalidResponseError } = require('./errors');
const {
    TIKTOK_HOST_WEB, TIKTOK_HOST_WEBCAST, SESSION_COOKIE_NAMES, TARGET_IDC_COOKIE_NAME,
    httpHeaders, httpParams,
} = require('./config');

class CookieJar {
    constructor(initialCookieHeader = '') {
        this.store = CookieJar.parse(initialCookieHeader);
    }

    static parse(str) {
        const out = {};
        if (!str) return out;
        for (const part of str.split('; ')) {
            if (!part) continue;
            const seg = part.split('=');
            const name = decodeURIComponent(seg.shift());
            if (name) out[name] = decodeURIComponent(seg.join('='));
        }
        return out;
    }

    static serialize(obj) {
        return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('; ');
    }

    /** Proses satu header set-cookie (atau array header). */
    ingest(setCookieHeader) {
        const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        for (const header of list) {
            if (typeof header !== 'string') continue;
            const nameValue = header.split(';')[0];
            const seg = nameValue.split('=');
            const name = seg.shift();
            if (name) this.store[decodeURIComponent(name.trim())] = decodeURIComponent(seg.join('='));
        }
    }

    getCookieString() {
        return CookieJar.serialize(this.store);
    }

    /** Cookie tanpa token sesi (untuk koneksi anonim). */
    getAnonymousCookieString() {
        const anon = {};
        for (const [k, v] of Object.entries(this.store)) {
            if (!SESSION_COOKIE_NAMES.includes(k) && k !== TARGET_IDC_COOKIE_NAME) anon[k] = v;
        }
        return CookieJar.serialize(anon);
    }
}

class WebClient {
    /**
     * @param {{device:object, location:object, screen:object}} preset
     */
    constructor(preset) {
        this.headers = httpHeaders(preset.device);
        this.params = httpParams(preset);
        this.cookieJar = new CookieJar(this.headers.Cookie || '');
        this.timeoutMs = Number(process.env.TIKTOK_CLIENT_TIMEOUT || 10000);
    }

    set roomId(id) { this.params.room_id = id; }
    get roomId() { return this.params.room_id || ''; }

    /**
     * Request dasar ke host TikTok dengan param & header terkelola.
     * @returns {Promise<{status:number, headers:Headers, body:Buffer|string}>}
     */
    async request({ host, path, searchParams = {}, headers = {}, method = 'GET', responseType = 'text' }) {
        const mergedParams = { ...this.params, ...searchParams };
        const url = `https://${host}/${path}?${new URLSearchParams(mergedParams)}`;
        const mergedHeaders = { ...this.headers, ...headers };
        const cookie = this.cookieJar.getCookieString();
        if (cookie) mergedHeaders.Cookie = cookie;

        const res = await fetch(url, {
            method,
            headers: mergedHeaders,
            signal: AbortSignal.timeout(this.timeoutMs),
            redirect: 'follow',
        });

        // Simpan cookie yang di-set server
        const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie');
        if (setCookies) this.cookieJar.ingest(setCookies);

        const body = responseType === 'json'
            ? await res.json().catch(() => null)
            : responseType === 'buffer'
                ? Buffer.from(await res.arrayBuffer())
                : await res.text();

        return { status: res.status, headers: res.headers, body };
    }

    /** Ambil HTML halaman LIVE user (untuk SIGI_STATE). */
    async getLivePageHtml(uniqueId) {
        const { status, body } = await this.request({
            host: TIKTOK_HOST_WEB,
            path: `@${uniqueId}/live`,
            responseType: 'text',
        });
        if (status !== 200) throw new InvalidResponseError(`HTML live page returned HTTP ${status}.`);
        return body;
    }

    /**
     * Route 1: room info dari HTML (SIGI_STATE.LiveRoom.liveRoomUserInfo).
     * Pola ekstraksi bisa dioverride bila TikTok mengubah markup.
     */
    async fetchRoomInfoFromHtml(uniqueId, extractionPattern = /<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/) {
        const html = await this.getLivePageHtml(uniqueId);
        const match = html.match(extractionPattern);
        if (!match || match.length < 2) {
            throw new InvalidResponseError('Failed to extract SIGI_STATE from HTML (possibly captcha-blocked).');
        }
        let sigi;
        try { sigi = JSON.parse(match[1]); }
        catch { throw new InvalidResponseError('Failed to parse SIGI_STATE JSON.'); }
        const liveRoom = sigi?.LiveRoom?.liveRoomUserInfo;
        if (!liveRoom) throw new InvalidResponseError('LiveRoom object missing from SIGI_STATE.');
        return liveRoom; // { user: { roomId, ... }, status, ... }
    }

    /** Route 2: room info dari endpoint api-live. */
    async fetchRoomInfoFromApiLive(uniqueId) {
        const { body } = await this.request({
            host: TIKTOK_HOST_WEB,
            path: 'api-live/user/room/',
            searchParams: { uniqueId, sourceType: '54' },
            responseType: 'json',
        });
        if (!body) throw new InvalidResponseError('api-live endpoint returned non-JSON body.');
        if (body.statusCode) throw new InvalidResponseError(`api-live error ${body.statusCode} (${body.message || 'unknown'})`);
        if (!body?.data?.user?.roomId) throw new InvalidResponseError(`api-live response invalid: ${JSON.stringify(body).slice(0, 200)}`);
        return body; // { statusCode, data: { user: {roomId}, liveRoom: {status} } }
    }

    /**
     * Gabungkan dua route untuk mendapatkan room ID.
     * @returns {Promise<string>}
     */
    async resolveRoomId(uniqueId) {
        const errors = [];
        try {
            const info = await this.fetchRoomInfoFromHtml(uniqueId);
            const roomId = info?.user?.roomId;
            if (roomId) return String(roomId);
            errors.push(new InvalidResponseError('Room ID missing in SIGI_STATE.'));
        } catch (e) { errors.push(e); }

        try {
            const data = await this.fetchRoomInfoFromApiLive(uniqueId);
            const roomId = data?.data?.user?.roomId;
            if (roomId) return String(roomId);
            errors.push(new InvalidResponseError('Room ID missing in api-live response.'));
        } catch (e) { errors.push(e); }

        const err = new InvalidResponseError(`Failed to retrieve room ID from all sources. Causes: ${errors.map(x => x.message).join(' | ')}`);
        err.causes = errors;
        throw err;
    }

    /** Cek status LIVE (2 = live, 4 = offline). */
    async fetchIsLive(uniqueId) {
        try {
            const info = await this.fetchRoomInfoFromHtml(uniqueId);
            if (info?.liveRoom?.status !== undefined || info?.status !== undefined) {
                return (info.liveRoom?.status ?? info.status) !== 4;
            }
        } catch { /* fallback ke api-live */ }
        const data = await this.fetchRoomInfoFromApiLive(uniqueId);
        if (data?.data?.liveRoom?.status === undefined) throw new InvalidResponseError('Live status missing from api-live response.');
        return data.data.liveRoom.status !== 4;
    }

    /** Room info lengkap dari webcast API (JSON). */
    async fetchRoomInfo(roomId = this.roomId) {
        if (!roomId) throw new InvalidResponseError('Missing roomId for room/info request.');
        const { body } = await this.request({
            host: TIKTOK_HOST_WEBCAST,
            path: 'webcast/room/info/',
            searchParams: { room_id: roomId },
            responseType: 'json',
        });
        if (!body) throw new InvalidResponseError('room/info returned non-JSON body.');
        return body;
    }

    /**
     * Daftar gift yang tersedia di room (webcast gift/list, JSON).
     * TikTok dapat menolak tanpa request bertanda tangan -> lempar error,
     * dipanggil dengan try/catch.
     */
    async fetchRoomGifts(roomId = this.roomId) {
        if (!roomId) throw new InvalidResponseError('Missing roomId for gift/list request.');
        const { body } = await this.request({
            host: TIKTOK_HOST_WEBCAST,
            path: 'webcast/gift/list/',
            searchParams: { room_id: roomId },
            responseType: 'json',
        });
        if (!body) throw new InvalidResponseError('gift/list returned non-JSON body.');
        if (body.status_code && body.status_code !== 0) {
            throw new InvalidResponseError(`gift/list status ${body.status_code} (${body.status_msg || ''})`);
        }
        return body?.data?.gifts ?? [];
    }
}

module.exports = { WebClient, CookieJar };
