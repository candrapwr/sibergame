'use strict';

/**
 * Siber Live - entry point modul.
 *
 * Usage:
 *   const { SiberLiveConnection, WebcastEvent, ControlEvent } = require('./shared/tiktok/siber-live');
 *   const conn = new SiberLiveConnection('username', { signApiKey: '...' });
 *   conn.on(WebcastEvent.GIFT, (data) => { ... });
 *   await conn.connect();
 */

const { SiberLiveConnection, validateAndNormalizeUniqueId } = require('./connection');
const { ControlEvent, WebcastEvent, WebcastEventMap, ConnectState } = require('./events');
const errors = require('./errors');
const { createEulerSigningProvider, resolveSigningProvider } = require('./signing');
const { normalizeUser, normalizeEventData } = require('./util');
const config = require('./config');
const protobuf = require('./protobuf');
const { WebClient, CookieJar } = require('./http');
const { WebcastSocket, generateUniqId } = require('./socket');

module.exports = {
    SiberLiveConnection,
    validateAndNormalizeUniqueId,
    // events
    ControlEvent,
    WebcastEvent,
    WebcastEventMap,
    ConnectState,
    // errors
    ...errors,
    // signing (pluggable)
    createEulerSigningProvider,
    resolveSigningProvider,
    // helpers
    normalizeUser,
    normalizeEventData,
    // internals (for extension / testing)
    config,
    protobuf,
    WebClient,
    CookieJar,
    WebcastSocket,
    generateUniqId,
};
