'use strict';

/**
 * Siber Live - utilitas bantu untuk mengonsumsi pesan webcast v3 mentah.
 *
 * Skema protobuf v3 menyimpan username di `displayId` dan tidak punya field
 * `uniqueId` seperti API connector lama. Helper ini menormalkan objek User
 * menjadi bentuk yang mudah dipakai aplikasi (game client, socket.io, dll).
 */

/**
 * Normalisasi objek User dari pesan webcast (WebcastChatMessage.user, dst).
 * @param {object|undefined} user objek User mentah hasil decode
 * @returns {{userId?: string, uniqueId?: string, nickname?: string, avatarUrl?: string, secUid?: string}}
 */
function normalizeUser(user) {
    if (!user) return {};
    return {
        userId: user.id && user.id !== '0' ? String(user.id) : undefined,
        // Di skema v3, displayId adalah username (@handle)
        uniqueId: user.displayId || undefined,
        nickname: user.nickname || undefined,
        secUid: user.secUid || undefined,
        avatarUrl: user.avatarLarge?.urlList?.[0] ?? user.avatarMedium?.urlList?.[0] ?? user.avatarThumb?.urlList?.[0],
    };
}

/**
 * Tambahkan properti kompatibilitas (getter) pada objek pesan webcast v3
 * agar handler lama (format connector v1) tetap jalan:
 *   data.uniqueId        <- user.displayId
 *   data.giftName        <- gift.name
 *   data.giftType        <- gift.type
 *   data.likeCount       <- count
 *   data.totalLikeCount  <- total (angka, bila muat)
 * Getter hanya dibuat bila nama belum ada -> tidak menimpa field asli.
 */
function normalizeEventData({ type, data }) {
    if (!data || typeof data !== 'object') return data;

    const define = (name, get) => {
        if (!(name in data)) {
            try { Object.defineProperty(data, name, { get, enumerable: false, configurable: true }); }
            catch { /* noop */ }
        }
    };

    if (data.user && !('uniqueId' in data)) define('uniqueId', () => data.user.displayId || undefined);
    if (data.user && !('profilePictureUrl' in data)) define('profilePictureUrl', () => normalizeUser(data.user).avatarUrl);

    switch (type) {
        case 'WebcastGiftMessage':
            if (data.gift) {
                // Struktur lama memakai giftDetails; di v3 namanya gift.
                if (!('giftDetails' in data)) define('giftDetails', () => data.gift);
                if (!('giftName' in data)) define('giftName', () => data.gift.name);
                if (!('giftType' in data)) define('giftType', () => data.gift.type);
                // gift.giftType (lama) <- gift.type (v3) supaya filter combo kompatibel
                if (!('giftType' in data.gift)) {
                    try {
                        Object.defineProperty(data.gift, 'giftType', {
                            get: () => data.gift.type, enumerable: false, configurable: true,
                        });
                    } catch { /* noop */ }
                }
            }
            if (typeof data.repeatEnd !== 'boolean') {
                data.repeatEnd = data.repeatEnd === 1 || data.repeatEnd === '1';
            }
            break;
        case 'WebcastLikeMessage':
            if (!('likeCount' in data)) define('likeCount', () => data.count);
            if (!('totalLikeCount' in data)) define('totalLikeCount', () => Number(data.total));
            break;
        case 'WebcastChatMessage':
            if (!('comment' in data)) define('comment', () => data.content);
            break;
        default:
            break;
    }
    return data;
}

module.exports = { normalizeUser, normalizeEventData };
