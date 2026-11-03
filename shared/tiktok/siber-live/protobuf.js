'use strict';

/**
 * Siber Live - decode/encode protobuf webcast.
 *
 * Skema protobuf diambil dari paket `tiktok-live-proto/v3` (ESM-only),
 * dimuat lazy via dynamic import() karena proyek ini CommonJS.
 *
 * Alur frame masuk (sesuai protokol webcast TikTok):
 *   binary -> WebcastPushFrame { payloadEncoding, payloadType, payload, ... }
 *   payloadType 'msg' & encoding 'pb' -> payload (mungkin gzip) -> ProtoMessageFetchResult
 *   setiap item .messages[] punya .method (nama schema) + .payload -> decode ke pesan event.
 */

const zlib = require('node:zlib');
const { promisify } = require('node:util');
const { SchemaDecodeError } = require('./errors');

const unzip = promisify(zlib.unzip);

/** Cache modul schema supaya dynamic import hanya sekali. */
let schemaPromise = null;

/**
 * @returns {Promise<typeof import('tiktok-live-proto/v3')>}
 */
function getSchema() {
    if (!schemaPromise) {
        schemaPromise = import('tiktok-live-proto/v3');
    }
    return schemaPromise;
}

const u8 = (v) => (v instanceof Uint8Array ? v : new Uint8Array(v ?? 0));

function isGzip(buf) {
    return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/**
 * Decode satu payload protobuf dengan nama schema.
 * @param {string} schemaName
 * @param {Uint8Array} buf
 */
async function decodeMessage(schemaName, buf) {
    const schema = await getSchema();
    const fn = schema[schemaName];
    if (!fn || typeof fn.decode !== 'function') {
        throw new SchemaDecodeError(`Unknown webcast schema: ${schemaName}`);
    }
    try {
        return fn.decode(u8(buf));
    } catch (ex) {
        throw new SchemaDecodeError(
            `Failed to decode ${schemaName}: ${ex.message} (base64: ${Buffer.from(buf).toString('base64')})`
        );
    }
}

/**
 * Decode + decode-nested satu batch ProtoMessageFetchResult.
 * Mengembalikan objek dengan tambahan:
 *   messages[i].decodedData = { type, data } | null
 *   messages[i].decodeError = Error | null
 */
async function decodeFetchResult(payload) {
    const schema = await getSchema();
    const result = schema.ProtoMessageFetchResult.decode(u8(payload));

    for (const message of result.messages || []) {
        message.decodedData = null;
        message.decodeError = null;

        if (!message.method || typeof schema[message.method]?.decode !== 'function') {
            // Tidak dikenal -> lewati diam-diam (server mengirim banyak tipe yang tidak kita pakai)
            continue;
        }

        try {
            const data = schema[message.method].decode(u8(message.payload));
            // Coerce tipe yang biasanya number/string menjadi string agar API stabil
            if (message.method === 'WebcastGiftMessage' && typeof data.repeatEnd !== 'boolean') {
                data.repeatEnd = data.repeatEnd === 1 || data.repeatEnd === true || data.repeatEnd === 'true';
            }
            message.decodedData = { type: message.method, data };
        } catch (ex) {
            message.decodeError = ex;
        }
    }

    return result;
}

/**
 * Decode satu frame WebSocket masuk.
 * Mengembalikan objek frame dengan properti tambahan `protoMessageFetchResult`
 * (object | null) bila payloadType 'msg'.
 */
async function decodeIncomingFrame(binary) {
    const schema = await getSchema();
    const frame = schema.WebcastPushFrame.decode(u8(binary));

    let fetchResult = null;
    if (frame.payloadEncoding === 'pb' && frame.payload && frame.payload.length > 0) {
        let payload = u8(frame.payload);
        if (isGzip(payload)) payload = await unzip(payload);

        if (frame.payloadType === 'msg') {
            fetchResult = await decodeFetchResult(payload);
        }
    }

    return { ...frame, protoMessageFetchResult: fetchResult };
}

/**
 * Bungkus payload menjadi WebcastPushFrame siap kirim.
 * @param {object} overrides { payloadType, payload, logId, seqId, ... }
 */
async function encodePushFrame(overrides) {
    const schema = await getSchema();
    const base = {
        seqId: '0',
        logId: '0',
        payloadEncoding: 'pb',
        payloadType: 'msg',
        payload: new Uint8Array(0),
        service: '0',
        method: '0',
        headers: [],
    };
    return schema.WebcastPushFrame.encode({ ...base, ...overrides }).finish();
}

/** Frame heartbeat (payloadType 'hb'). */
async function buildHeartbeatFrame(roomId, seqId) {
    const schema = await getSchema();
    const hb = schema.HeartBeatMessage.encode({
        roomId: String(roomId),
        sendPacketSeqId: String(seqId),
    }).finish();

    return encodePushFrame({ payloadEncoding: 'pb', payloadType: 'hb', payload: hb });
}

/** Frame ACK (payloadType 'ack', isi internalExt sebagai teks UTF-8). */
async function buildAckFrame(logId, internalExt) {
    return encodePushFrame({
        logId: String(logId),
        payloadEncoding: 'pb',
        payloadType: 'ack',
        payload: new TextEncoder().encode(String(internalExt)),
    });
}

/** Frame masuk room (payloadType 'im_enter_room'). */
async function buildEnterRoomFrame({ roomId, enterUniqueId }) {
    const schema = await getSchema();
    const msg = schema.WebcastImEnterRoomMessage.encode({
        roomId: String(roomId),
        roomTag: '',
        liveRegion: '',
        liveId: '12',
        identity: 'audience',
        cursor: '',
        accountType: '0',
        enterUniqueId: String(enterUniqueId),
        filterWelcomeMsg: '0',
        isAnchorContinueKeepMsg: false,
    }).finish();

    return encodePushFrame({ payloadEncoding: 'pb', payloadType: 'im_enter_room', payload: msg });
}

module.exports = {
    getSchema,
    decodeMessage,
    decodeFetchResult,
    decodeIncomingFrame,
    encodePushFrame,
    buildHeartbeatFrame,
    buildAckFrame,
    buildEnterRoomFrame,
};
