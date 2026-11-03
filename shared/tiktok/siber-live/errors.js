'use strict';

/**
 * Siber Live - error types
 * Error khusus agar penanganan kegagalan koneksi mudah di-diff oleh pemanggil.
 */

class SiberLiveError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}

class InvalidUniqueIdError extends SiberLiveError {}
class AlreadyConnectedError extends SiberLiveError {}
class AlreadyConnectingError extends SiberLiveError {}
class UserOfflineError extends SiberLiveError {}
class ConnectTimeoutError extends SiberLiveError {}
class InvalidResponseError extends SiberLiveError {}
class SignAPIError extends SiberLiveError {}
class SignatureRateLimitError extends SignAPIError {
    constructor(message, retryAfterMs) {
        super(message);
        this.retryAfterMs = retryAfterMs;
    }
}
class SchemaDecodeError extends SiberLiveError {}

module.exports = {
    SiberLiveError,
    InvalidUniqueIdError,
    AlreadyConnectedError,
    AlreadyConnectingError,
    UserOfflineError,
    ConnectTimeoutError,
    InvalidResponseError,
    SignAPIError,
    SignatureRateLimitError,
    SchemaDecodeError,
};
