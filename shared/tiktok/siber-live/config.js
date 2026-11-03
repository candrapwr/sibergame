'use strict';

/**
 * Siber Live - konfigurasi klien web/websocket.
 * Berisi preset device (user-agent), location, screen, dan template
 * query parameter / header yang dipakai TikTok web saat membuka LIVE.
 */

const TIKTOK_HOST_WEB = 'www.tiktok.com';
const TIKTOK_HOST_WEBCAST = 'webcast.tiktok.com';
const TIKTOK_HTTP_ORIGIN = 'https://www.tiktok.com';
const AID = '1988'; // ID aplikasi TikTok web

const SESSION_COOKIE_NAMES = ['sessionid', 'sessionid_ss', 'sid_tt', 'sid_guard'];
const TARGET_IDC_COOKIE_NAME = 'tt-target-idc';

function httpHeaders(device) {
    return {
        'Cookie': `${TARGET_IDC_COOKIE_NAME}=useast1a`,
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
        'User-Agent': device.user_agent,
        'Accept': 'text/html,application/json,application/protobuf',
        'Referer': `${TIKTOK_HTTP_ORIGIN}/`,
        'Origin': TIKTOK_HTTP_ORIGIN,
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
    };
}

function httpParams({ device, location, screen }) {
    return {
        aid: AID,
        app_language: location.lang,
        app_name: 'tiktok_web',
        browser_language: location.lang_country,
        browser_name: device.browser_name,
        browser_online: 'true',
        browser_platform: device.browser_platform,
        browser_version: device.browser_version,
        cookie_enabled: 'true',
        device_platform: 'web_pc',
        focus_state: 'true',
        from_page: 'user',
        history_len: '10',
        is_fullscreen: 'false',
        is_page_visible: 'true',
        screen_height: String(screen.screen_height),
        screen_width: String(screen.screen_width),
        tz_name: location.tz_name,
        referer: `${TIKTOK_HTTP_ORIGIN}/`,
        root_referer: `${TIKTOK_HTTP_ORIGIN}/`,
        channel: 'tiktok_web',
        data_collection_enabled: 'true',
        os: device.os,
        priority_region: location.country,
        region: location.country,
        user_is_login: 'true',
        webcast_language: location.lang,
        device_id: generateDeviceId(),
    };
}

function wsParams({ device, location, screen }) {
    return {
        version_code: '180800',
        aid: AID,
        app_language: location.lang,
        app_name: 'tiktok_web',
        browser_platform: device.browser_platform,
        browser_language: location.lang_country,
        browser_name: device.browser_name,
        browser_version: device.browser_version,
        browser_online: 'true',
        cookie_enabled: 'true',
        tz_name: location.tz_name,
        device_platform: 'web',
        identity: 'audience',
        live_id: '12',
        webcast_language: location.lang,
        ws_direct: '0',
        sup_ws_ds_opt: '1',
        update_version_code: '2.0.0',
        did_rule: '3',
        screen_height: String(screen.screen_height),
        screen_width: String(screen.screen_width),
        heartbeat_duration: '0',
        resp_content_type: 'protobuf',
        history_comment_count: '6',
        client_enter: '1',
        last_rtt: String(Math.floor((Math.random() * 100) + 100)),
    };
}

const WS_PARAMS_APPENDIX = '&version_code=270000';
const WS_PING_INTERVAL_MS = 10000;

// --- Preset device -----------------------------------------------------------

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:130.0) Gecko/20100101 Firefox/130.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/128.0.2739.79',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/128.0.2739.79',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/113.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/113.0.0.0',
];

function userAgentToDevice(userAgent) {
    const slash = userAgent.indexOf('/');
    // Contoh: "... Firefox/130.0" -> browser_name diambil dari token terakhir yang mengandung "/"
    const tokens = userAgent.split(' ');
    const last = tokens[tokens.length - 1];
    const browserName = last.includes('/') ? last.split('/')[0] : userAgent.slice(0, slash);
    return {
        user_agent: userAgent,
        browser_name: browserName,
        browser_version: userAgent.slice(slash + 1),
        browser_platform: userAgent.includes('Macintosh') ? 'MacIntel' : 'Win32',
        os: userAgent.includes('Macintosh') ? 'mac' : 'windows',
    };
}

const LOCATIONS = [
    { lang_country: 'en-GB', lang: 'en', country: 'GB', tz_name: 'Europe/London' },
    { lang_country: 'en-CA', lang: 'en', country: 'CA', tz_name: 'America/Toronto' },
    { lang_country: 'en-AU', lang: 'en', country: 'AU', tz_name: 'Australia/Sydney' },
    { lang_country: 'en-NZ', lang: 'en', country: 'NZ', tz_name: 'Pacific/Auckland' },
    { lang_country: 'en-ZA', lang: 'en', country: 'ZA', tz_name: 'Africa/Johannesburg' },
    { lang_country: 'en-IE', lang: 'en', country: 'IE', tz_name: 'Europe/Dublin' },
    { lang_country: 'en-ID', lang: 'id', country: 'ID', tz_name: 'Asia/Jakarta' },
    { lang_country: 'en-MY', lang: 'ms', country: 'MY', tz_name: 'Asia/Kuala_Lumpur' },
];

const SCREENS = [
    { screen_width: 1920, screen_height: 1080 },
    { screen_width: 2560, screen_height: 1440 },
    { screen_width: 3840, screen_height: 2160 },
    { screen_width: 1440, screen_height: 2560 },
];

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateDeviceId() {
    let digits = '';
    for (let i = 0; i < 19; i++) digits += Math.floor(Math.random() * 10);
    return digits;
}

/** Bangun preset device/screen/location. `randomize: true` untuk hasil acak per instance. */
function getPreset({ randomize = true } = {}) {
    return {
        device: randomize ? userAgentToDevice(pickRandom(USER_AGENTS)) : userAgentToDevice(USER_AGENTS[1]),
        location: randomize ? pickRandom(LOCATIONS) : LOCATIONS[6], // default Indonesia
        screen: randomize ? pickRandom(SCREENS) : SCREENS[0],
    };
}

module.exports = {
    TIKTOK_HOST_WEB,
    TIKTOK_HOST_WEBCAST,
    TIKTOK_HTTP_ORIGIN,
    SESSION_COOKIE_NAMES,
    TARGET_IDC_COOKIE_NAME,
    WS_PARAMS_APPENDIX,
    WS_PING_INTERVAL_MS,
    httpHeaders,
    httpParams,
    wsParams,
    getPreset,
};
