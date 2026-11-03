'use strict';

/**
 * Siber Live - provider tanda tangan (signing).
 *
 * Koneksi websocket webcast TikTok memerlukan URL bertanda tangan yang
 * tidak bisa (praktis) dihasilkan sendiri oleh klien tanpa mekanisme signing
 * TikTok. Interface provider dibuat sengaja sederhana dan bisa diganti:
 *
 *   new SiberLiveConnection(user, {
 *       signingProvider: async ({ roomId, cursor, userAgent, uniqueId }) => ({
 *           // ProtoMessageFetchResult (binary) dari server signing
 *           fetchResult: Buffer,
 *           // opsional: header Set-Cookie tambahan dari respons signing
 *           cookieHeader: '...',
 *           // opsional: room id final kalau server signing mengubahnya
 *           roomId: '...',
 *       }),
 *   });
 *
 * Provider bawaan 'euler' memanggil endpoint publik Euler Stream
 * (/webcast/rooms/{room_id}/connect) persis seperti yang dipakai
 * tiktok-live-connector, tapi dengan fetch biasa (tanpa SDK).
 * apiKey opsional — tanpa key akan kena rate-limit anonim (sama seperti
 * perilaku library resmi); dengan key (options.signApiKey / env SIGN_API_KEY)
 * kuota lebih longgar.
 */

const { SignAPIError, SignatureRateLimitError } = require('./errors');

const DEFAULT_SIGN_BASE = process.env.SIGN_API_URL || 'https://api.eulerstream.com';
const LIBRARY_IDENTITY = process.env.SIGN_CLIENT_IDENTITY || 'ttlive-node';

/**
 * Provider default: Euler Stream sign server, raw fetch.
 * Opsi: { baseURL, apiKey, timeoutMs, platform }
 */
function createEulerSigningProvider(opts = {}) {
    const baseURL = (opts.baseURL || DEFAULT_SIGN_BASE).replace(/\/+$/, '');
    const apiKey = opts.apiKey ?? process.env.SIGN_API_KEY;
    const platform = opts.platform || 'web';

    return async function fetchSignedWebSocket({ roomId, cursor, userAgent, uniqueId }) {
        const params = new URLSearchParams({ client: LIBRARY_IDENTITY });
        if (apiKey) params.set('apiKey', apiKey);
        // Server menolak kalau room_id (di path) dan unique_id dikirim bersamaan.
        if (!roomId && uniqueId) params.set('unique_id', uniqueId);
        if (cursor) params.set('cursor', cursor);
        if (userAgent) params.set('user_agent', userAgent);
        params.set('client_enter', 'true');
        params.set('platform', platform);

        const url = `${baseURL}/webcast/rooms/${encodeURIComponent(roomId)}/connect?${params}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 15000);
        let res;
        try {
            const headers = {
                'Accept': 'application/protobuf,application/json',
                'User-Agent': `${LIBRARY_IDENTITY}/1.0 ${process.platform}`,
            };
            if (apiKey) headers['x-api-key'] = apiKey;
            res = await fetch(url, { signal: controller.signal, headers });
        } catch (err) {
            throw new SignAPIError(`Gagal menghubungi sign server (${baseURL}): ${err.message}`);
        } finally {
            clearTimeout(timer);
        }

        if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10) * 1000;
            let msg = '';
            try { msg = (await res.json()).message || ''; } catch { /* non-json */ }
            throw new SignatureRateLimitError(
                `Sign server rate-limit${msg ? `: ${msg}` : ''}`, retryAfter);
        }
        if (res.status === 402) {
            throw new SignAPIError('Fitur sign server ini memerlukan paket premium (HTTP 402).');
        }
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new SignAPIError(`Sign server balasan HTTP ${res.status}: ${body.slice(0, 300)}`);
        }

        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) throw new SignAPIError('Sign server mengirim body kosong.');

        return {
            fetchResult: buf,
            cookieHeader: res.headers.get('x-set-tt-cookie') || undefined,
            roomId: res.headers.get('x-room-id') || undefined,
        };
    };
}

function resolveSigningProvider(provider, opts) {
    if (typeof provider === 'function') return provider;
    if (provider && typeof provider === 'object' && typeof provider.fetch === 'function') {
        return (args) => provider.fetch(args);
    }
    if (provider === 'euler' || provider === undefined || provider === null) {
        return createEulerSigningProvider(opts);
    }
    throw new TypeError(`signingProvider tidak dikenali: ${String(provider)}`);
}

module.exports = { createEulerSigningProvider, resolveSigningProvider, LIBRARY_IDENTITY };
