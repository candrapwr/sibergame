import { tiktokConnector } from "../../shared/tiktok/tiktok-connector.js";
import { getGameResetEventKey } from "../../shared/game-session.js";

(() => {
  "use strict";

  // All game actions enter through handleGameCommand. Local controls and the
  // shared TikTok event adapter both end up at this boundary.
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const settingsOnlyMode = window.factionWarSettingsOnly === true;
  const listenerSessionId = window.gameHubSessionId || "default";
  const GAME_RESET_EVENT_KEY = getGameResetEventKey(listenerSessionId);
  const animationVideoOverlay = document.getElementById("animation-video-overlay");
  const animationVideoPlayer = document.getElementById("animation-video-player");
  const W = 1080;
  const H = 1920;
  const MID = W / 2;
  const TERRITORY_HP_MULTIPLIER = 3;
  const TERRITORY_MAX_HP = 100 * TERRITORY_HP_MULTIPLIER;
  const TERRITORY_BAR_X = 145;
  const TERRITORY_BAR_WIDTH = 790;
  const SAVE_KEY = `game-state:${listenerSessionId}:faction-war`;
  const LEGACY_SAVE_KEY = listenerSessionId === "default" ? "faction-war-save-v1" : "";
  const GIFT_UNIT_TYPES = ["knight", "mage", "beast", "boss"];
  const DEFAULT_SETTINGS = {
    gameTitle: "Faction War",
    redTeam: "Red Team",
    blueTeam: "Blue Team",
    showAvatar: true,
    showUsername: true,
    showGiftLegend: true,
    soundEnabled: true,
    soundVolume: 42,
    bgMusicEnabled: true,
    bgMusicVolume: 25,
    likeTroopsEnabled: true,
    likesPerTroop: 100,
    giftMode: "coin",
    coinCosts: { knight: 1, mage: 5, beast: 15, boss: 100 },
    giftAssignments: {
      knight: { RED: "", BLUE: "" },
      mage: { RED: "", BLUE: "" },
      beast: { RED: "", BLUE: "" },
      boss: { RED: "", BLUE: "" }
    }
  };
  const SAVE_INTERVAL = 3;
  const GAME_FRAME_INTERVAL = 1000 / 30;
  const GIFT_SPAWN_INTERVAL_MS = 220;
  const AVATAR_RADIUS = 52;
  const AVATAR_HEAD_GAP = 6;
  const TROOP_WIDTH = 160;
  const TROOP_HEIGHT = 178;
  const BOSS_WIDTH = 236;
  const BOSS_HEIGHT = 234;
  const pendingGiftSpawns = [];
  let pendingAnimationFrame = 0;
  let pendingGameTimer = 0;
  let pendingGiftSpawnTimer = 0;
  let renderDirty = true;
  let layoutScaleX = 1;
  const BATTLE_TOP = 560;
  const BATTLE_BOTTOM = 1840;
  const gsap = window.gsap;

  function cleanSetting(value, fallback, maxLength) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength) || fallback;
  }

  function cleanPositiveCount(value, fallback) {
    const amount = Math.floor(Number(value));
    return Number.isFinite(amount) && amount > 0 ? Math.min(amount, 1000000) : fallback;
  }

  function cleanSoundVolume(value, fallback) {
    const volume = Number(value);
    return Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : fallback;
  }

  function safeGiftImageUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && url.hostname.endsWith(".tiktokcdn.com") ? url.href : "";
    } catch { return ""; }
  }

  function loadUiSettings() {
    const saved = window.factionWarSettings && typeof window.factionWarSettings === "object"
      ? window.factionWarSettings
      : {};
    const coinCosts = {};
    const giftAssignments = {};
    GIFT_UNIT_TYPES.forEach((type) => {
      coinCosts[type] = cleanPositiveCount(saved.coinCosts?.[type], DEFAULT_SETTINGS.coinCosts[type]);
      const savedAssignment = saved.giftAssignments?.[type];
      if (savedAssignment && typeof savedAssignment === "object") {
        giftAssignments[type] = {
          RED: cleanSetting(savedAssignment.RED, "", 64),
          BLUE: cleanSetting(savedAssignment.BLUE, "", 64)
        };
      } else {
        // Migrate the former single gift + team selection into its matching side.
        const legacyTeam = saved.giftTeams?.[type] === "BLUE" ? "BLUE" : "RED";
        giftAssignments[type] = { RED: "", BLUE: "" };
        giftAssignments[type][legacyTeam] = cleanSetting(savedAssignment, "", 64);
      }
    });
    return {
      gameTitle: cleanSetting(saved.gameTitle, DEFAULT_SETTINGS.gameTitle, 32),
      redTeam: cleanSetting(saved.redTeam, DEFAULT_SETTINGS.redTeam, 18),
      blueTeam: cleanSetting(saved.blueTeam, DEFAULT_SETTINGS.blueTeam, 18),
      showAvatar: saved.showAvatar !== false,
      showUsername: saved.showUsername !== false,
      showGiftLegend: saved.showGiftLegend !== false,
      soundEnabled: saved.soundEnabled !== false,
      soundVolume: cleanSoundVolume(saved.soundVolume, DEFAULT_SETTINGS.soundVolume),
      bgMusicEnabled: saved.bgMusicEnabled !== false,
      bgMusicVolume: cleanSoundVolume(saved.bgMusicVolume, DEFAULT_SETTINGS.bgMusicVolume),
      likeTroopsEnabled: saved.likeTroopsEnabled !== false,
      likesPerTroop: cleanPositiveCount(saved.likesPerTroop, DEFAULT_SETTINGS.likesPerTroop),
      giftMode: saved.giftMode === "gift" ? "gift" : "coin",
      coinCosts,
      giftAssignments
    };
  }

  const uiSettings = loadUiSettings();
  const listenerEndpoint = window.tiktokListenerEndpoint || new URLSearchParams(window.location.search).get("tiktokWs");
  const giftCatalog = Array.isArray(window.tiktokGiftCatalog)
    ? window.tiktokGiftCatalog.map((gift) => {
      const diamondCount = Number(gift?.diamondCount);
      return {
        id: String(gift?.id || "").trim(),
        name: String(gift?.name || "").trim().slice(0, 100),
        diamondCount: Number.isFinite(diamondCount) ? Math.max(0, Math.floor(diamondCount)) : 0,
        iconUrl: safeGiftImageUrl(gift?.iconUrl)
      };
    }).filter((gift) => gift.id && gift.name)
    : [];
  const giftCatalogReady = window.tiktokGiftCatalogStatus === "ready" && giftCatalog.length > 0;
  const giftCatalogSource = window.tiktokGiftCatalogSource || "none";
  const giftCatalogById = new Map(giftCatalog.map((gift) => [gift.id, gift]));

  function resizeGameCanvas() {
    const viewportAspect = window.innerWidth / Math.max(1, window.innerHeight);
    // Widen the battlefield layout for wider viewports. Sprite and text helpers
    // cancel this horizontal layout scale so characters keep their proportions.
    layoutScaleX = Math.max(1, Math.min(3.2, viewportAspect / (W / H)));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth > 1000 ? 1 : 1.25);
    canvas.width = Math.round(W * layoutScaleX * pixelRatio);
    canvas.height = Math.round(H * pixelRatio);
    ctx.setTransform(pixelRatio * layoutScaleX, 0, 0, pixelRatio, 0, 0);
  }
  resizeGameCanvas();
  window.addEventListener("resize", () => {
    resizeGameCanvas();
    requestRender();
  }, { passive: true });

  const imageFiles = {
    baseRed: "assets/images/base_red_volcano.png",
    baseBlue: "assets/images/base_blue_ice.png",
    redKnight: "assets/images/troop_red_knight.png",
    redMage: "assets/images/troop_red_mage.png",
    redBeast: "assets/images/troop_red_beast.png",
    blueKnight: "assets/images/troop_blue_knight.png",
    blueMage: "assets/images/troop_blue_mage.png",
    blueBeast: "assets/images/troop_blue_beast.png",
    bossRedFront: "assets/images/boss_red_golem_front.png",
    bossRedSide: "assets/images/boss_red_golem_side.png",
    bossBlueFront: "assets/images/boss_blue_golem_front.png",
    bossBlueSide: "assets/images/boss_blue_golem_side.png",
    fireball: "assets/images/vfx_projectile_fireball.png",
    iceshard: "assets/images/vfx_projectile_iceshard.png",
    fireExplosion: "assets/images/vfx_explosion_fire.png",
    iceImpact: "assets/images/vfx_impact_ice.png",
    shieldRed: "assets/images/ui_shield_red.png",
    shieldBlue: "assets/images/ui_shield_blue.png",
    trophy: "assets/images/ui_icon_trophy.png",
    potionRed: "assets/images/ui_potion_red.png",
    potionBlue: "assets/images/ui_potion_blue.png",
    teamButtonRed: "assets/images/ui_button_team1.png",
    teamButtonBlue: "assets/images/ui_button_team2.png",
    rose: "assets/images/ui_gift_rose.png"
  };

  const images = {};
  const avatarImageCache = new Map();
  const giftIconCache = new Map();
  const giftPairCanvasCache = new Map();
  Object.entries(imageFiles).forEach(([key, src]) => {
    const image = new Image();
    image.onload = () => requestRender();
    image.src = src;
    images[key] = image;
  });

  const state = {
    troops: [],
    effects: [],
    labels: [],
    feed: [],
    ambient: [],
    viewerTeams: new Map(),
    viewerProfiles: new Map(),
    giftCoinBalances: new Map(),
    viewerLikeCounts: new Map(),
    territoryRed: TERRITORY_MAX_HP / 2,
    territoryBlue: TERRITORY_MAX_HP / 2,
    territoryRatio: { red: 0.5 },
    frontline: { x: MID },
    scoreRed: 0,
    scoreBlue: 0,
    gameStarted: false,
    animationVideoPlayed: false,
    matchOver: false,
    winner: null,
    roundResetTimer: 0,
    resetCall: null,
    lastTime: 0,
    nextId: 1,
    spawnCount: 0,
    saveAccumulator: 0,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  };

  const troopSoundPools = new Map();
  const unavailableTroopSounds = new Set();
  const lastAttackSoundByType = new Map();
  const TROOP_SOUND_FILES = {
    knight: { spawn: "knight-spawn.wav", attack: "knight-attack.wav" },
    mage: { spawn: "mage-spawn.wav", attack: "mage-attack.ogg" },
    beast: { spawn: "beast-spawn.ogg", attack: "beast-attack.ogg" },
    boss: { spawn: "boss-spawn.ogg", attack: "boss-attack.ogg" }
  };
  let finishSound = null;
  let backgroundMusic = null;
  let backgroundMusicNeedsGesture = false;
  let sessionAnimationVideoActive = false;
  let sessionAnimationVideoTimer = 0;
  let sessionAnimationVideoGeneration = 0;
  let sessionAnimationVideoLookupQueue = Promise.resolve();
  const sessionAnimationVideoLookups = new Set();
  let lastAttackSoundAt = 0;

  function playTroopSound(troop, action) {
    if (sessionAnimationVideoActive || !uiSettings.soundEnabled || !state.gameStarted || state.matchOver || typeof Audio === "undefined") return;
    const type = troop.isBoss ? "boss" : troop.type;
    const soundFile = TROOP_SOUND_FILES[type]?.[action];
    if (!soundFile) return;
    const soundKey = `${type}-${action}`;
    if (unavailableTroopSounds.has(soundKey)) return;

    if (action === "attack") {
      const now = Date.now();
      const typeCooldown = 180;
      const globalCooldown = 105;
      if (now - (lastAttackSoundByType.get(type) || 0) < typeCooldown || now - lastAttackSoundAt < globalCooldown) return;
      lastAttackSoundByType.set(type, now);
      lastAttackSoundAt = now;
    }

    let pool = troopSoundPools.get(soundKey);
    if (!pool) {
      pool = Array.from({ length: 3 }, () => {
        const audio = new Audio(`assets/audio/${soundFile}`);
        audio.preload = "none";
        audio.addEventListener("error", () => unavailableTroopSounds.add(soundKey), { once: true });
        return audio;
      });
      troopSoundPools.set(soundKey, pool);
    }

    const audio = pool.find((item) => item.paused || item.ended) || pool[0];
    try {
      audio.volume = uiSettings.soundVolume / 100;
      audio.currentTime = 0;
      const playback = audio.play();
      playback?.catch(() => {
        if (audio.error) unavailableTroopSounds.add(soundKey);
      });
    } catch {
      if (audio.error) unavailableTroopSounds.add(soundKey);
    }
  }

  function playFinishSound() {
    if (sessionAnimationVideoActive || !uiSettings.soundEnabled || typeof Audio === "undefined") return;
    if (!finishSound) {
      finishSound = new Audio("assets/audio/finish.wav");
      finishSound.preload = "auto";
    }
    try {
      finishSound.volume = uiSettings.soundVolume / 100;
      finishSound.currentTime = 0;
      finishSound.play()?.catch(() => {});
    } catch {
      // Ignore playback failures so a sound issue cannot interrupt the match.
    }
  }

  function stopAudio(audio) {
    if (!audio) return;
    audio.pause();
    try { audio.currentTime = 0; }
    catch { /* The media element may not have loaded metadata yet. */ }
  }

  function stopTroopSounds() {
    troopSoundPools.forEach((pool) => pool.forEach(stopAudio));
  }

  function stopFinishSound() {
    stopAudio(finishSound);
  }

  function startBackgroundMusic() {
    if (sessionAnimationVideoActive || !uiSettings.bgMusicEnabled || !state.gameStarted || typeof Audio === "undefined") return;
    if (!backgroundMusic) {
      backgroundMusic = new Audio("assets/audio/bg1.mp3");
      backgroundMusic.loop = true;
      backgroundMusic.preload = "auto";
    }
    backgroundMusic.volume = uiSettings.bgMusicVolume / 100;
    if (!backgroundMusic.paused) return;
    try {
      const playback = backgroundMusic.play();
      playback?.then(() => { backgroundMusicNeedsGesture = false; }).catch(() => {
        backgroundMusicNeedsGesture = true;
      });
    } catch {
      backgroundMusicNeedsGesture = true;
    }
  }

  function stopBackgroundMusic() {
    backgroundMusicNeedsGesture = false;
    if (!backgroundMusic) return;
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
  }

  function stopSessionAnimationVideo(resumeMusic = true) {
    sessionAnimationVideoGeneration += 1;
    if (sessionAnimationVideoTimer) window.clearTimeout(sessionAnimationVideoTimer);
    sessionAnimationVideoTimer = 0;
    animationVideoPlayer.pause();
    animationVideoPlayer.removeAttribute("src");
    animationVideoPlayer.load();
    animationVideoOverlay.hidden = true;
    sessionAnimationVideoActive = false;
    if (resumeMusic && state.gameStarted && !state.matchOver && uiSettings.bgMusicEnabled) startBackgroundMusic();
    requestRender();
  }

  function playSessionAnimationVideo(usernameValue, knownVideo = null) {
    const username = String(usernameValue || "").trim().replace(/^@+/, "");
    const usernameKey = username.toLowerCase();
    const sessionToken = sessionAnimationVideoGeneration;
    const lookupKey = `${sessionToken}:${usernameKey}`;
    if (!/^[a-zA-Z0-9._]{1,50}$/.test(username)
      || settingsOnlyMode
      || !state.gameStarted
      || state.matchOver
      || state.animationVideoPlayed
      || sessionAnimationVideoLookups.has(lookupKey)) return;

    sessionAnimationVideoLookups.add(lookupKey);
    const checkAndPlay = async () => {
      let playbackGeneration = 0;
      try {
        if (sessionToken !== sessionAnimationVideoGeneration || !state.gameStarted || state.matchOver || state.animationVideoPlayed) return;
        let matchingVideo = knownVideo;
        if (!matchingVideo) {
          const listUrl = new URL("/api/games/faction-war/animation-videos", window.location.origin);
          listUrl.searchParams.set("username", username);
          const response = await fetch(listUrl.pathname + listUrl.search, { cache: "no-store" });
          const result = await response.json().catch(() => ({}));
          if (sessionToken !== sessionAnimationVideoGeneration || !state.gameStarted || state.matchOver || state.animationVideoPlayed) return;
          if (!response.ok || !Array.isArray(result.videos)) return;
          matchingVideo = result.videos.find((video) => String(video.username || "").toLowerCase() === usernameKey);
        }
        if (!matchingVideo?.url) return;
        const videoUrl = new URL(matchingVideo.url, window.location.origin);
        if (videoUrl.origin !== window.location.origin) return;

        state.animationVideoPlayed = true;
        saveGameState();
        playbackGeneration = ++sessionAnimationVideoGeneration;
        stopTroopSounds();
        stopFinishSound();
        stopBackgroundMusic();
        animationVideoPlayer.muted = false;
        animationVideoPlayer.loop = false;
        animationVideoPlayer.src = videoUrl.href;
        animationVideoOverlay.hidden = false;
        sessionAnimationVideoActive = true;
        try { await animationVideoPlayer.play(); }
        catch {
          if (playbackGeneration !== sessionAnimationVideoGeneration) return;
          animationVideoPlayer.muted = true;
          await animationVideoPlayer.play();
        }
        if (playbackGeneration !== sessionAnimationVideoGeneration || !state.gameStarted) return;
        sessionAnimationVideoTimer = window.setTimeout(() => stopSessionAnimationVideo(), 10000);
      } catch {
        if (playbackGeneration && playbackGeneration === sessionAnimationVideoGeneration) {
          stopSessionAnimationVideo();
        } else if (!state.animationVideoPlayed && sessionToken === sessionAnimationVideoGeneration) {
          console.warn(`Video animasi untuk @${username} gagal dimuat.`);
        }
      } finally {
        sessionAnimationVideoLookups.delete(lookupKey);
      }
    };
    sessionAnimationVideoLookupQueue = sessionAnimationVideoLookupQueue.then(checkAndPlay, checkAndPlay);
  }

  async function checkRestoredTroopAnimationVideo() {
    if (!state.gameStarted || state.matchOver || state.animationVideoPlayed) return;
    const activeUsernames = new Set(state.troops
      .filter((troop) => !troop.dead && troop.status !== "dying")
      .map((troop) => String(troop.username || "").trim().replace(/^@+/, "").toLowerCase())
      .filter((username) => /^[a-z0-9._]{1,50}$/.test(username)));
    if (!activeUsernames.size) return;
    try {
      const response = await fetch("/api/games/faction-war/animation-videos", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(result.videos) || !state.gameStarted || state.matchOver || state.animationVideoPlayed) return;
      const matchingVideo = result.videos.find((video) => activeUsernames.has(String(video.username || "").toLowerCase()));
      if (matchingVideo) playSessionAnimationVideo(matchingVideo.username, matchingVideo);
    } catch {
      // A later matching gift will retry the username lookup.
    }
  }

  const TEAM = {
    RED: { color: "#ff5a52", light: "#ffb17c", dark: "#7d1f36", imagePrefix: "red", direction: 1 },
    BLUE: { color: "#4abfff", light: "#b4f4ff", dark: "#173f8e", imagePrefix: "blue", direction: -1 }
  };
  const GLOBAL_HP_MULTIPLIER = 3;
  const BOSS_HP = 420;
  const TROOP_NAMES = { knight: "Knight", mage: "Mage", beast: "Beast" };
  const TROOP_HP = { knight: 80, mage: 120, beast: 160 };
  const TROOP_ATTACK = { knight: 24, mage: 30, beast: 38 };
  const TROOP_PUSH = { knight: 2, mage: 2, beast: 3 };

  // Ambient particles are fixed after setup so the main loop only draws them.
  for (let i = 0; i < 64; i += 1) {
    const particle = {
      x: Math.random() * W,
      y: Math.random() * H,
      radius: 1 + Math.random() * 4,
      alpha: gsap && !state.reducedMotion ? .28 : .42,
      offsetY: 0,
      team: Math.random() > 0.5 ? "RED" : "BLUE"
    };
    state.ambient.push(particle);
  }

  function startAmbientAnimations() {
    if (!gsap || state.reducedMotion) return;
    state.ambient.forEach((particle) => {
      gsap.to(particle, { alpha: randomBetween(.18, .7), duration: randomBetween(1.1, 2.8), ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.to(particle, { offsetY: randomBetween(-12, 12), duration: randomBetween(2.4, 5.2), ease: "sine.inOut", repeat: -1, yoyo: true });
    });
  }

  function stopAmbientAnimations() {
    if (gsap) state.ambient.forEach((particle) => gsap.killTweensOf(particle));
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function randomBetween(min, max) { return min + Math.random() * (max - min); }
  function teamOf(value) { return String(value || "").toUpperCase() === "BLUE" ? "BLUE" : "RED"; }
  function teamDisplayName(team) { return teamOf(team) === "RED" ? uiSettings.redTeam : uiSettings.blueTeam; }
  function safeAvatarUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch { return ""; }
  }
  function viewerIdentityKey(event) {
    return String(event.userId || event.username || "TikTok User").trim().toLowerCase();
  }
  function rememberViewer(event, teamValue, key = viewerIdentityKey(event)) {
    const oldProfile = state.viewerProfiles.get(key);
    const profile = {
      username: String(event.username || oldProfile?.username || "TikTok User").trim().slice(0, 50),
      avatarUrl: safeAvatarUrl(event.avatarUrl) || oldProfile?.avatarUrl || "",
      team: teamOf(teamValue)
    };
    if (oldProfile && oldProfile.username === profile.username && oldProfile.avatarUrl === profile.avatarUrl && oldProfile.team === profile.team) {
      return oldProfile;
    }
    state.viewerProfiles.set(key, profile);
    return profile;
  }
  function fitTextSize(text, baseSize, maxWidth) {
    ctx.save();
    ctx.font = `1000 ${baseSize}px Trebuchet MS, Arial, sans-serif`;
    const measuredWidth = ctx.measureText(text).width;
    ctx.restore();
    return measuredWidth > maxWidth ? baseSize * maxWidth / measuredWidth : baseSize;
  }
  function territoryPercent(team) {
    const total = state.territoryRed + state.territoryBlue || 1;
    const value = teamOf(team) === "BLUE" ? state.territoryBlue : state.territoryRed;
    return (value / total) * 100;
  }
  function formatTerritoryDelta(amount) {
    const percent = amount / TERRITORY_MAX_HP * 100;
    return `${percent >= 10 ? Math.round(percent) : percent.toFixed(1)}%`;
  }

  function roundRect(x, y, width, height, radius, fill, stroke, lineWidth = 2, horizontalScale = layoutScaleX) {
    const r = Math.min(radius, width / 2, height / 2);
    const rx = r / horizontalScale;
    ctx.beginPath();
    ctx.moveTo(x + rx, y);
    ctx.lineTo(x + width - rx, y);
    ctx.ellipse(x + width - rx, y + r, rx, r, 0, -Math.PI / 2, 0);
    ctx.lineTo(x + width, y + height - r);
    ctx.ellipse(x + width - rx, y + height - r, rx, r, 0, 0, Math.PI / 2);
    ctx.lineTo(x + rx, y + height);
    ctx.ellipse(x + rx, y + height - r, rx, r, 0, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + r);
    ctx.ellipse(x + rx, y + r, rx, r, 0, Math.PI, Math.PI * 1.5);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function polygon(points, fill, stroke, lineWidth = 2) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function image(key, x, y, width, height, alpha = 1) {
    const sprite = images[key];
    if (!sprite?.complete || !sprite.naturalWidth) return false;
    ctx.save();
    ctx.globalAlpha *= alpha;
    const drawWidth = width / layoutScaleX;
    const drawX = x + (width - drawWidth) / 2;
    ctx.drawImage(sprite, drawX, y, drawWidth, height);
    ctx.restore();
    return true;
  }

  function loadGiftIcon(gift) {
    const url = safeGiftImageUrl(gift?.iconUrl);
    if (!url) return null;
    if (giftIconCache.has(url)) return giftIconCache.get(url);
    const icon = new Image();
    const entry = { image: icon, loaded: false };
    icon.onload = () => {
      entry.loaded = true;
      requestRender();
    };
    icon.onerror = () => requestRender();
    giftIconCache.set(url, entry);
    icon.src = url;
    return entry;
  }

  function drawGiftPlaceholder(targetCtx, x, y, size, team) {
    const color = team === "RED" ? "#ffad83" : "#9deaff";
    targetCtx.save();
    targetCtx.translate(x + size / 2, y + size / 2);
    targetCtx.fillStyle = "rgba(235, 241, 255, .12)";
    targetCtx.strokeStyle = color;
    targetCtx.lineWidth = 2;
    targetCtx.fillRect(-size * .34, -size * .12, size * .68, size * .52);
    targetCtx.strokeRect(-size * .34, -size * .12, size * .68, size * .52);
    targetCtx.fillRect(-size * .42, -size * .28, size * .84, size * .2);
    targetCtx.strokeRect(-size * .42, -size * .28, size * .84, size * .2);
    targetCtx.fillRect(-size * .055, -size * .28, size * .11, size * .68);
    targetCtx.beginPath();
    targetCtx.ellipse(-size * .12, -size * .37, size * .14, size * .085, -.55, 0, Math.PI * 2);
    targetCtx.ellipse(size * .12, -size * .37, size * .14, size * .085, .55, 0, Math.PI * 2);
    targetCtx.stroke();
    targetCtx.restore();
  }

  function drawContainedImage(targetCtx, source, x, y, size) {
    const scale = Math.min(size / source.naturalWidth, size / source.naturalHeight);
    const width = source.naturalWidth * scale;
    const height = source.naturalHeight * scale;
    targetCtx.drawImage(source, x + (size - width) / 2, y + (size - height) / 2, width, height);
  }

  function assignedGift(type, team) {
    const assignment = String(uiSettings.giftAssignments[type]?.[team] || "").trim();
    if (!assignment) return null;
    return giftCatalogById.get(assignment)
      || giftCatalog.find((gift) => gift.name.toLowerCase() === assignment.toLowerCase())
      || null;
  }

  function drawGiftTeamLegend(team) {
    const troopIconSize = 128;
    const giftIconSize = 72;
    const iconOverlap = 34;
    const rowGap = 14;
    const pairWidth = troopIconSize + giftIconSize - iconOverlap;
    const edgeOffset = 46;
    const pairX = team === "RED" ? -edgeOffset : W - pairWidth + edgeOffset;
    const firstY = 580;
    const assignedTypes = GIFT_UNIT_TYPES.filter((type) =>
      String(uiSettings.giftAssignments[type]?.[team] || "").trim()
    );

    assignedTypes.forEach((type, index) => {
      const rowY = firstY + index * (troopIconSize + rowGap);
      const troopImage = type === "boss"
        ? (team === "RED" ? "bossRedFront" : "bossBlueFront")
        : `${team.toLowerCase()}${type[0].toUpperCase()}${type.slice(1)}`;
      const gift = assignedGift(type, team);
      const troopSprite = images[troopImage];
      if (!troopSprite?.complete || !troopSprite.naturalWidth) return;
      const giftEntry = loadGiftIcon(gift);
      const giftSprite = giftEntry?.loaded && giftEntry.image.naturalWidth ? giftEntry.image : null;
      const assignment = String(uiSettings.giftAssignments[type]?.[team] || "").trim();
      const cacheKey = `${team}:${type}:${assignment}:${gift?.iconUrl || ""}:${giftSprite ? "loaded" : "fallback"}`;
      let pairCanvas = giftPairCanvasCache.get(cacheKey);
      if (!pairCanvas) {
        pairCanvas = document.createElement("canvas");
        pairCanvas.width = pairWidth;
        pairCanvas.height = troopIconSize;
        const pairCtx = pairCanvas.getContext("2d");
        const troopX = team === "RED" ? 0 : giftIconSize - iconOverlap;
        const giftX = team === "RED" ? troopIconSize - iconOverlap : 0;
        const giftY = (troopIconSize - giftIconSize) / 2;
        const drawTroop = () => drawContainedImage(pairCtx, troopSprite, troopX, 0, troopIconSize);
        const drawGift = () => {
          if (giftSprite) drawContainedImage(pairCtx, giftSprite, giftX, giftY, giftIconSize);
          else drawGiftPlaceholder(pairCtx, giftX, giftY, giftIconSize, team);
        };
        if (team === "RED") {
          drawTroop();
          drawGift();
        } else {
          drawTroop();
          drawGift();
        }
        giftPairCanvasCache.set(cacheKey, pairCanvas);
      }
      ctx.save();
      ctx.translate(pairX + pairWidth / 2, rowY);
      ctx.scale(1 / layoutScaleX, 1);
      ctx.drawImage(pairCanvas, -pairWidth / 2, 0, pairWidth, troopIconSize);
      ctx.restore();
    });
  }

  function drawGiftLegends() {
    if (!uiSettings.showGiftLegend || uiSettings.giftMode !== "gift" || !giftCatalogReady) return;
    drawGiftTeamLegend("RED");
    drawGiftTeamLegend("BLUE");
  }

  function circlePath(x, y, radius) {
    ctx.beginPath();
    ctx.ellipse(x, y, radius / layoutScaleX, radius, 0, 0, Math.PI * 2);
  }

  function fillTextFixed(text, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 / layoutScaleX, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function roundRectFixed(x, y, width, height, radius, fill, stroke, lineWidth = 2) {
    ctx.save();
    ctx.translate(x + width / 2, y);
    ctx.scale(1 / layoutScaleX, 1);
    roundRect(-width / 2, 0, width, height, radius, fill, stroke, lineWidth, 1);
    ctx.restore();
  }

  function outlinedText(text, x, y, size, fill, options = {}) {
    const {
      align = "center", stroke = "#101322", lineWidth = Math.max(5, size * 0.11),
      shadow = "rgba(0, 0, 0, .42)", weight = 1000, font = "Trebuchet MS, Arial, sans-serif"
    } = options;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 / layoutScaleX, 1);
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.shadowColor = shadow;
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = Math.max(2, size * 0.045);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawBackground() {
    const territoryEdge = clamp(state.frontline.x, 0, W);
    const red = ctx.createLinearGradient(0, 0, territoryEdge, H);
    red.addColorStop(0, "#542039");
    red.addColorStop(.34, "#743047");
    red.addColorStop(.72, "#56283f");
    red.addColorStop(1, "#291e36");
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, territoryEdge, H);

    const blue = ctx.createLinearGradient(territoryEdge, 0, W, H);
    blue.addColorStop(0, "#234987");
    blue.addColorStop(.34, "#347bb4");
    blue.addColorStop(.72, "#20518a");
    blue.addColorStop(1, "#142d58");
    ctx.fillStyle = blue;
    ctx.fillRect(territoryEdge, 0, W - territoryEdge, H);

    // Atmospheric light and haze separate the distant peaks from the arena.
    const redGlow = ctx.createRadialGradient(190, 700, 20, 225, 760, 720);
    redGlow.addColorStop(0, "rgba(255, 117, 50, .38)");
    redGlow.addColorStop(.48, "rgba(209, 61, 57, .13)");
    redGlow.addColorStop(1, "rgba(255, 70, 37, 0)");
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 240, territoryEdge, 1120); ctx.clip();
    ctx.fillStyle = redGlow;
    ctx.fillRect(0, 240, territoryEdge, 1120);
    ctx.restore();
    const blueGlow = ctx.createRadialGradient(870, 730, 20, 835, 760, 740);
    blueGlow.addColorStop(0, "rgba(100, 227, 255, .32)");
    blueGlow.addColorStop(.5, "rgba(67, 156, 233, .14)");
    blueGlow.addColorStop(1, "rgba(59, 142, 255, 0)");
    ctx.save();
    ctx.beginPath(); ctx.rect(territoryEdge, 240, W - territoryEdge, 1120); ctx.clip();
    ctx.fillStyle = blueGlow;
    ctx.fillRect(territoryEdge, 240, W - territoryEdge, 1120);
    ctx.restore();

    const drawInTerritory = (team, paint) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(team === "RED" ? 0 : territoryEdge, 0, team === "RED" ? territoryEdge : W - territoryEdge, H);
      ctx.clip();
      paint();
      ctx.restore();
    };
    const territoryPolygon = (points, redFill, blueFill, redStroke, blueStroke, lineWidth = 2) => {
      drawInTerritory("RED", () => polygon(points, redFill, redStroke, lineWidth));
      drawInTerritory("BLUE", () => polygon(points, blueFill, blueStroke, lineWidth));
    };

    // Distant ridges: volcanic silhouettes on the left, glacial peaks on the right.
    territoryPolygon([[0, 850], [0, 595], [75, 563], [138, 437], [202, 610], [275, 535], [360, 665], [455, 526], [540, 620], [540, 1115], [0, 1115]], "#48233d", "#4380ae", "rgba(255, 168, 106, .16)", "rgba(206, 250, 255, .42)", 5);
    territoryPolygon([[1080, 850], [1080, 565], [1013, 535], [944, 420], [870, 607], [802, 518], [717, 667], [628, 523], [540, 620], [540, 1115], [1080, 1115]], "#48233d", "#4380ae", "rgba(255, 168, 106, .16)", "rgba(206, 250, 255, .42)", 5);
    territoryPolygon([[0, 1090], [0, 873], [96, 825], [183, 914], [274, 786], [376, 920], [459, 856], [540, 943], [540, 1265], [0, 1265]], "rgba(55, 27, 49, .78)", "rgba(39, 82, 128, .76)", null, null);
    territoryPolygon([[1080, 1090], [1080, 855], [987, 820], [899, 911], [809, 787], [707, 923], [623, 856], [540, 943], [540, 1265], [1080, 1265]], "rgba(55, 27, 49, .78)", "rgba(39, 82, 128, .76)", null, null);

    // Smoked volcano shoulders and lava channels add depth behind the troop field.
    territoryPolygon([[0, 1128], [0, 930], [102, 867], [205, 941], [307, 832], [413, 947], [540, 895], [540, 1278], [0, 1278]], "#3e263e", "#315c91", "rgba(255, 117, 65, .16)", "rgba(189, 245, 255, .4)", 4);
    const drawMiddleChannels = (team) => {
      const hot = team === "RED";
      const drawPath = () => {
        ctx.beginPath(); ctx.moveTo(193, 834); ctx.bezierCurveTo(172, 929, 243, 1001, 204, 1100); ctx.bezierCurveTo(175, 1169, 231, 1226, 214, 1354); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(376, 900); ctx.bezierCurveTo(355, 984, 418, 1028, 389, 1118); ctx.bezierCurveTo(369, 1173, 414, 1222, 400, 1312); ctx.stroke();
      };
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = hot ? "#ff512e" : "#76e9ff";
      ctx.shadowBlur = 24;
      ctx.strokeStyle = hot ? "rgba(255, 93, 41, .7)" : "rgba(89, 215, 255, .68)";
      ctx.lineWidth = 17;
      drawPath();
      ctx.shadowBlur = 5;
      ctx.strokeStyle = hot ? "rgba(255, 211, 105, .9)" : "rgba(213, 251, 255, .9)";
      ctx.lineWidth = 5;
      drawPath();
      ctx.restore();
    };
    drawInTerritory("RED", () => drawMiddleChannels("RED"));
    drawInTerritory("BLUE", () => drawMiddleChannels("BLUE"));

    // Ice shelves and luminous crevasses mirror the lava terrain.
    territoryPolygon([[1080, 1128], [1080, 922], [980, 866], [877, 945], [773, 832], [669, 949], [540, 895], [540, 1278], [1080, 1278]], "#3e263e", "#315c91", "rgba(255, 117, 65, .16)", "rgba(189, 245, 255, .4)", 4);
    const drawMiddleCrevasses = (team) => {
      const hot = team === "RED";
      const drawPath = () => {
        ctx.beginPath(); ctx.moveTo(866, 850); ctx.lineTo(840, 932); ctx.lineTo(891, 990); ctx.lineTo(856, 1055); ctx.lineTo(892, 1112); ctx.lineTo(872, 1214); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(690, 914); ctx.lineTo(714, 977); ctx.lineTo(674, 1036); ctx.lineTo(701, 1097); ctx.lineTo(671, 1179); ctx.stroke();
      };
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = hot ? "#ff512e" : "#76e9ff";
      ctx.shadowBlur = 21;
      ctx.strokeStyle = hot ? "rgba(255, 93, 41, .68)" : "rgba(89, 215, 255, .68)";
      ctx.lineWidth = 13;
      drawPath();
      ctx.shadowBlur = 2;
      ctx.strokeStyle = hot ? "rgba(255, 211, 105, .9)" : "rgba(213, 251, 255, .9)";
      ctx.lineWidth = 3;
      drawPath();
      ctx.restore();
    };
    drawInTerritory("RED", () => drawMiddleCrevasses("RED"));
    drawInTerritory("BLUE", () => drawMiddleCrevasses("BLUE"));

    // A continuous perspective floor now fills the space previously covered by UI.
    const groundY = 1250;
    const leftGround = ctx.createLinearGradient(0, groundY, 0, H);
    leftGround.addColorStop(0, "rgba(126, 54, 58, .58)");
    leftGround.addColorStop(.35, "rgba(70, 34, 55, .82)");
    leftGround.addColorStop(1, "rgba(34, 23, 42, .98)");
    ctx.fillStyle = leftGround;
    ctx.fillRect(0, groundY, territoryEdge, H - groundY);
    const rightGround = ctx.createLinearGradient(0, groundY, 0, H);
    rightGround.addColorStop(0, "rgba(80, 150, 190, .52)");
    rightGround.addColorStop(.36, "rgba(36, 82, 132, .84)");
    rightGround.addColorStop(1, "rgba(18, 39, 75, .98)");
    ctx.fillStyle = rightGround;
    ctx.fillRect(territoryEdge, groundY, W - territoryEdge, H - groundY);

    // Broken rock and ice shelves also take the color of their current owner.
    territoryPolygon([[0, 1395], [0, 1267], [79, 1237], [135, 1305], [204, 1226], [283, 1320], [346, 1260], [420, 1333], [540, 1280], [540, 1500], [0, 1500]], "#35243b", "#284c78", "rgba(255, 140, 87, .2)", "rgba(165, 236, 255, .32)", 4);
    territoryPolygon([[1080, 1395], [1080, 1259], [1001, 1233], [944, 1302], [875, 1225], [797, 1320], [730, 1259], [658, 1334], [540, 1280], [540, 1500], [1080, 1500]], "#35243b", "#284c78", "rgba(255, 140, 87, .2)", "rgba(165, 236, 255, .32)", 4);

    // Perspective seams fade into the distance instead of ending at the old UI.
    ctx.save();
    ctx.lineWidth = 2;
    for (let x = -200; x <= W + 200; x += 150) {
      ctx.strokeStyle = x < territoryEdge ? "rgba(255, 164, 111, .12)" : "rgba(181, 237, 255, .14)";
      ctx.beginPath(); ctx.moveTo(MID, groundY); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = groundY + 48; y < H; y += 82) {
      const fade = Math.min(.12, .035 + (y - groundY) / 9000);
      ctx.strokeStyle = `rgba(255,255,255,${fade})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    // Scattered glowing magma and ice shards make the floor feel less flat.
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#ff7a39";
    ctx.fillStyle = "rgba(255, 164, 74, .74)";
    [[78, 1502, 14, 5], [286, 1640, 20, 6], [456, 1468, 12, 4], [161, 1803, 17, 5]].forEach(([x, y, rx, ry]) => {
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, -.12, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowColor = "#70e8ff";
    ctx.fillStyle = "rgba(157, 241, 255, .72)";
    [[1002, 1512, 13, 5], [786, 1654, 18, 5], [625, 1476, 12, 4], [922, 1802, 16, 5]].forEach(([x, y, rx, ry]) => {
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, .12, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();

    // Heat flecks and ice glints.
    state.ambient.forEach((particle) => {
      const isRed = particle.team === "RED";
      ctx.beginPath();
      ctx.fillStyle = isRed ? `rgba(255, 171, 82, ${particle.alpha})` : `rgba(153, 237, 255, ${particle.alpha})`;
      ctx.shadowColor = isRed ? "#ff743a" : "#75e9ff";
      ctx.shadowBlur = particle.radius * 3;
      circlePath(particle.x, particle.y + particle.offsetY, particle.radius);
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    // The bright seam reads like a frontline and keeps the two sides legible.
    const frontlineX = state.frontline.x;
    const seamHalfWidth = 12 / layoutScaleX;
    const seam = ctx.createLinearGradient(frontlineX - seamHalfWidth, 0, frontlineX + seamHalfWidth, 0);
    seam.addColorStop(0, "rgba(255, 120, 73, 0)");
    seam.addColorStop(.46, "rgba(255, 183, 113, .76)");
    seam.addColorStop(.54, "rgba(167, 241, 255, .9)");
    seam.addColorStop(1, "rgba(79, 177, 255, 0)");
    ctx.fillStyle = seam;
    ctx.fillRect(frontlineX - seamHalfWidth, 386, seamHalfWidth * 2, H - 406);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.fillRect(frontlineX - 2 / layoutScaleX, 422, 4 / layoutScaleX, H - 442);
  }

  function drawHeader() {
    const gameTitle = uiSettings.gameTitle.toUpperCase();
    outlinedText(gameTitle, MID, 76, fitTextSize(gameTitle, 66, 940), "#dff7ff", { stroke: "#11152d", lineWidth: 13, shadow: "rgba(0,0,0,.7)" });

    // Territory bar: red fills from the left, blue from the right.
    const barX = TERRITORY_BAR_X;
    const barY = 122;
    const barW = TERRITORY_BAR_WIDTH;
    const barH = 64;
    roundRect(barX - 11, barY - 10, barW + 22, barH + 20, 24, "#171d38", "#6374a3", 5);
    roundRect(barX, barY, barW, barH, 16, "#10162c", "rgba(255,255,255,.16)", 2);
    const redW = Math.max(8, barW * state.territoryRatio.red);
    const blueW = Math.max(8, barW - redW);
    ctx.save();
    ctx.beginPath();
    roundRect(barX, barY, barW, barH, 16, null, null);
    ctx.clip();
    const redFill = ctx.createLinearGradient(barX, 0, barX + redW, 0);
    redFill.addColorStop(0, "#ff704d"); redFill.addColorStop(1, "#d82952");
    ctx.fillStyle = redFill; ctx.fillRect(barX, barY, redW, barH);
    const blueFill = ctx.createLinearGradient(barX + redW, 0, barX + barW, 0);
    blueFill.addColorStop(0, "#2478e9"); blueFill.addColorStop(1, "#36dcff");
    ctx.fillStyle = blueFill; ctx.fillRect(barX + redW, barY, blueW, barH);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
    outlinedText("VS", MID, barY + barH / 2 + 1, 40, "#fff4e8", { stroke: "#181b35", lineWidth: 10, shadow: "rgba(0,0,0,.65)" });
    ctx.restore();
    outlinedText(`${Math.round(territoryPercent("RED"))}%`, barX + 72, barY + barH / 2, 28, "#fff4e8", { align: "left", lineWidth: 6, shadow: "none" });
    outlinedText(`${Math.round(territoryPercent("BLUE"))}%`, barX + barW - 72, barY + barH / 2, 28, "#f1fcff", { align: "right", lineWidth: 6, shadow: "none" });

    image("baseRed", -10, 300, 470, 444, .98);
    image("baseBlue", 620, 297, 470, 457, .98);
    // Team ribbons sit above the castles so their artwork stays visible.
    roundRect(22, 230, 330, 61, 15, "rgba(193, 38, 61, .94)", "#211a32", 5);
    roundRect(728, 230, 330, 61, 15, "rgba(29, 111, 200, .96)", "#211a32", 5);
    image("teamButtonRed", 37, 233, 54, 54, .95);
    image("teamButtonBlue", 989, 233, 54, 54, .95);
    const redName = uiSettings.redTeam.toUpperCase();
    const blueName = uiSettings.blueTeam.toUpperCase();
    outlinedText(redName, 208, 261, fitTextSize(redName, 39, 260), "#fff0e8", { stroke: "#301a2c", lineWidth: 9 });
    outlinedText(blueName, 872, 261, fitTextSize(blueName, 39, 260), "#e9fbff", { stroke: "#192648", lineWidth: 9 });
  }

  function drawBattlefieldTrim() {
    // Subtle side banners and lane markings keep the camera focused on combat.
    ctx.save();
    ctx.globalAlpha = .55;
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.setLineDash([12, 18]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(42, BATTLE_TOP + 12); ctx.lineTo(42, BATTLE_BOTTOM - 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1038, BATTLE_TOP + 12); ctx.lineTo(1038, BATTLE_BOTTOM - 18); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    const markerX = state.frontline.x;
    roundRectFixed(markerX - 73, 592, 146, 40, 20, "rgba(23, 24, 42, .82)", "rgba(255,255,255,.3)", 2);
    outlinedText("FRONTLINE", markerX, 612, 14, "#edfaff", { stroke: "#18203b", lineWidth: 4, weight: 900, shadow: "none" });
  }

  function drawAttackMotion(troop, x, y) {
    const progress = clamp(troop.attackSwing, 0, 1);
    const strength = Math.sin(progress * Math.PI);
    if (strength < .08 || troop.type === "mage" && !troop.isBoss) return;

    const direction = TEAM[troop.team].direction;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 / layoutScaleX, 1);
    ctx.globalAlpha *= strength * troop.alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = TEAM[troop.team].light;
    ctx.shadowBlur = 17;
    ctx.strokeStyle = TEAM[troop.team].light;
    ctx.lineWidth = troop.isBoss ? 12 : 9;

    if (troop.type === "knight" && !troop.isBoss) {
      const start = direction > 0 ? -1.08 : Math.PI + 1.08;
      const end = direction > 0 ? .82 : Math.PI - .82;
      ctx.beginPath();
      ctx.arc(direction * 24, -16, 60, start, end, direction < 0);
      ctx.stroke();
      ctx.shadowBlur = 3;
      ctx.strokeStyle = "rgba(255,255,255,.92)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(direction * 24, -16, 60, start + direction * .08, end - direction * .08, direction < 0);
      ctx.stroke();
    } else {
      // Beasts and golems get claw/fist streaks instead of a sword arc.
      for (let index = 0; index < 3; index += 1) {
        const offset = (index - 1) * 15;
        ctx.beginPath();
        ctx.moveTo(direction * 22, -12 + offset);
        ctx.lineTo(direction * (70 + index * 6), -29 + offset);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawTroop(troop) {
    const team = TEAM[troop.team];
    const walking = troop.status === "advancing";
    const stride = walking ? Math.sin(state.elapsed * 12 + troop.phase) : 0;
    const bob = troop.bobY + (walking ? Math.abs(stride) * 2.2 : 0);
    const x = troop.x + troop.attackOffset;
    const y = troop.y + bob;
    const imageKey = troop.isBoss
      ? (troop.team === "RED"
        ? (troop.frontPose > .5 ? "bossRedFront" : "bossRedSide")
        : (troop.frontPose > .5 ? "bossBlueFront" : "bossBlueSide"))
      : `${team.imagePrefix}${troop.type[0].toUpperCase()}${troop.type.slice(1)}`;
    const width = troop.isBoss ? BOSS_WIDTH : TROOP_WIDTH;
    const height = troop.isBoss ? BOSS_HEIGHT : TROOP_HEIGHT;

    // Spawn flash and shadow establish the unit on the floor.
    ctx.save();
    ctx.globalAlpha = .3;
    ctx.fillStyle = team.color;
    ctx.shadowColor = team.color;
    ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.ellipse(x, troop.y + height * .36, (troop.isBoss ? 88 : 64) / layoutScaleX, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 / layoutScaleX, 1);
    const walkTilt = walking ? stride * 2.6 : 0;
    const attackTilt = (troop.attackSwing || 0) * -6 * TEAM[troop.team].direction;
    ctx.rotate((troop.rotation + walkTilt + attackTilt) * Math.PI / 180);
    ctx.globalAlpha *= troop.alpha;
    // The Golem side sprites face left in the source art; troop sprites use the opposite orientation.
    const flipX = troop.isBoss ? troop.team === "RED" : troop.team === "BLUE";
    ctx.scale(flipX ? -1 : 1, troop.scaleY * troop.popScale);
    const sprite = images[imageKey];
    const drawn = sprite?.complete && sprite.naturalWidth;
    if (!drawn) {
      ctx.fillStyle = team.color;
      ctx.beginPath(); ctx.arc(0, 0, troop.isBoss ? 68 : 52, 0, Math.PI * 2); ctx.fill();
      ctx.font = "1000 32px Trebuchet MS, Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 6; ctx.strokeStyle = team.dark; ctx.strokeText(troop.isBoss ? "BOSS" : TROOP_NAMES[troop.type][0], 0, 0);
      ctx.fillStyle = "#fff"; ctx.fillText(troop.isBoss ? "BOSS" : TROOP_NAMES[troop.type][0], 0, 0);
    } else {
      ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
    }
    ctx.restore();
    drawAttackMotion(troop, x, y);

    if (!troop.dead && (troop.status === "frontline" || troop.hp < troop.maxHp)) {
      const barWidth = troop.isBoss ? 132 : 86;
      const barHeight = troop.isBoss ? 14 : 10;
      const barY = y + height / 2 - 24;
      roundRectFixed(x - barWidth / 2, barY, barWidth, barHeight, barHeight / 2, "rgba(15,17,30,.86)", "rgba(255,255,255,.48)", 1);
      const healthColor = troop.hp / troop.maxHp < .35 ? "#ff514f" : (troop.team === "RED" ? "#ff9b61" : "#61dfff");
      roundRectFixed(x - barWidth / 2 + 2, barY + 2, (barWidth - 4) * clamp(troop.hp / troop.maxHp, 0, 1), barHeight - 4, 4, healthColor, null);
    }

  }

  function loadAvatarImage(url) {
    if (!url) return null;
    if (avatarImageCache.has(url)) return avatarImageCache.get(url);
    const image = new Image();
    const entry = { image, loaded: false };
    image.onload = () => {
      entry.loaded = true;
      requestRender();
    };
    image.onerror = () => requestRender();
    avatarImageCache.set(url, entry);
    image.src = url;
    return entry;
  }

  function drawTroopAvatar(troop, x, centerY, username) {
    const profile = troop.viewerKey ? state.viewerProfiles.get(troop.viewerKey) : null;
    const avatarUrl = safeAvatarUrl(profile?.avatarUrl || troop.avatarUrl);
    if (!troop.viewerKey && !avatarUrl) return;
    const cached = loadAvatarImage(avatarUrl);
    const radius = AVATAR_RADIUS;

    ctx.save();
    ctx.translate(x, centerY);
    ctx.scale(1 / layoutScaleX, 1);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(13, 16, 31, .96)";
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius - 2, 0, Math.PI * 2);
    ctx.clip();
    if (cached?.loaded) {
      ctx.drawImage(cached.image, -radius + 2, -radius + 2, (radius - 2) * 2, (radius - 2) * 2);
    } else {
      ctx.fillStyle = TEAM[troop.team].dark;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "900 30px Trebuchet MS, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(username.slice(0, 1).toUpperCase() || "?", 0, 0);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, radius - 1, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = TEAM[troop.team].color;
    ctx.stroke();
    ctx.restore();
  }

  function drawTroopNameplate(troop) {
    if (troop.dead || (!uiSettings.showAvatar && !uiSettings.showUsername)) return;
    const team = TEAM[troop.team];
    const walking = troop.status === "advancing";
    const stride = walking ? Math.sin(state.elapsed * 12 + troop.phase) : 0;
    const bob = troop.bobY + (walking ? Math.abs(stride) * 2.2 : 0);
    const x = troop.x + troop.attackOffset;
    const y = troop.y + bob;
    const username = String(troop.username || "Player");
    const usernameCharacters = Array.from(username);
    const safeUsername = usernameCharacters.length > 18
      ? `${usernameCharacters.slice(0, 15).join("")}...`
      : username;

    const labelY = y - (troop.isBoss ? 180 : 130);
    if (uiSettings.showUsername) {
      ctx.save();
      ctx.font = "800 28px Trebuchet MS, Arial, sans-serif";
      const labelWidth = Math.min(560, Math.max(250, ctx.measureText(safeUsername).width + 40));
      ctx.translate(x, labelY);
      ctx.scale(1 / layoutScaleX, 1);
      roundRect(-labelWidth / 2, 0, labelWidth, 58, 27, "rgba(16, 18, 34, .9)", team.color, 3, 1);
      ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "800 28px Trebuchet MS, Arial"; ctx.fillStyle = "#fff";
      ctx.fillText(safeUsername, -labelWidth / 2 + 20, 29, labelWidth - 40);
      ctx.restore();
    }
    if (uiSettings.showAvatar) {
      const avatarCenterY = uiSettings.showUsername
        ? labelY - AVATAR_RADIUS - 5
        : y - ((troop.isBoss ? BOSS_HEIGHT : TROOP_HEIGHT) * troop.scaleY * troop.popScale) / 2 - AVATAR_RADIUS - AVATAR_HEAD_GAP;
      drawTroopAvatar(troop, x, avatarCenterY, username);
    }
  }

  function drawEffect(effect) {
    if (effect.kind === "bossImpact") {
      const color = effect.team === "BLUE" ? "#8cecff" : "#ff9a4f";
      const radius = 112 * effect.scale;
      ctx.save();
      ctx.translate(effect.x, effect.y);
      ctx.scale(1 / layoutScaleX, 1);
      ctx.rotate(effect.rotation || 0);
      ctx.globalAlpha *= effect.alpha;
      ctx.lineCap = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * .32, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= .72;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, radius * .72, radius * .23, 0, 0, Math.PI * 2); ctx.stroke();
      for (let index = 0; index < 12; index += 1) {
        ctx.save();
        ctx.rotate(index * Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(0, -radius * .77);
        ctx.lineTo(0, -radius * 1.02);
        ctx.moveTo(-7, -radius * .88);
        ctx.lineTo(0, -radius * 1.02);
        ctx.lineTo(7, -radius * .88);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    } else if (effect.kind === "impact") {
      const key = effect.team === "BLUE" ? "iceImpact" : "fireExplosion";
      const size = effect.size * effect.scale;
      if (!image(key, effect.x - size / 2, effect.y - size / 2, size, size, effect.alpha)) {
        ctx.save(); ctx.globalAlpha = effect.alpha;
        const gradient = ctx.createRadialGradient(effect.x, effect.y, 2, effect.x, effect.y, size / 2);
        gradient.addColorStop(0, effect.team === "BLUE" ? "#dfffff" : "#fff9b0");
        gradient.addColorStop(.35, effect.team === "BLUE" ? "#55d5ff" : "#ff8a37");
        gradient.addColorStop(1, "rgba(255,90,50,0)");
        ctx.fillStyle = gradient; circlePath(effect.x, effect.y, size / 2); ctx.fill(); ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = effect.alpha * .55;
      ctx.strokeStyle = effect.team === "BLUE" ? "#b4f4ff" : "#ffca79";
      ctx.lineWidth = 5;
      circlePath(effect.x, effect.y, 36 * effect.scale); ctx.stroke();
      ctx.restore();
    } else if (effect.kind === "projectile") {
      const sprite = effect.team === "RED" ? "fireball" : "iceshard";
      const size = 48 * effect.scale;
      ctx.save();
      ctx.translate(effect.x, effect.y);
      ctx.scale(1 / layoutScaleX, 1);
      ctx.rotate(effect.rotation || 0);
      const projectile = images[sprite];
      if (projectile?.complete && projectile.naturalWidth) {
        ctx.globalAlpha *= effect.alpha;
        ctx.drawImage(projectile, -size / 2, -size / 2, size, size);
      }
      ctx.restore();
    } else if (effect.kind === "shield") {
      const sprite = effect.team === "RED" ? "shieldRed" : "shieldBlue";
      const size = 84 * effect.scale;
      image(sprite, effect.x - size / 2, effect.y - size / 2, size, size, effect.alpha);
    }
  }

  function drawFloatingLabels() {
    state.labels.forEach((label) => {
      ctx.save();
      ctx.globalAlpha = label.alpha;
      ctx.translate(label.x, label.y);
      ctx.scale(label.scale, label.scale);
      outlinedText(label.text, 0, 0, label.size, label.color, {
        stroke: "#171629", lineWidth: 8, weight: 1000, shadow: "rgba(0,0,0,.35)"
      });
      ctx.restore();
    });
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawHeader();
    drawGiftLegends();
    drawBattlefieldTrim();
    state.troops.forEach(drawTroop);
    state.effects.forEach(drawEffect);
    drawFloatingLabels();
    state.troops.forEach(drawTroopNameplate);
    drawVictoryOverlay();
  }

  function drawVictoryOverlay() {
    if (!state.matchOver || !state.winner) return;
    const color = TEAM[state.winner].color;
    ctx.save();
    ctx.fillStyle = "rgba(8, 10, 23, .78)";
    ctx.fillRect(0, 0, W, H);
    roundRect(130, 665, 820, 570, 42, "rgba(23, 27, 50, .97)", color, 5);
    image("trophy", MID - 66, 725, 132, 138, 1);
    const victoryTitle = `${teamDisplayName(state.winner).toUpperCase()} WINS!`;
    outlinedText(victoryTitle, MID, 904, fitTextSize(victoryTitle, 58, 720), state.winner === "RED" ? "#ffb17c" : "#b4f4ff", {
      stroke: "#11152d", lineWidth: 13, shadow: "rgba(0,0,0,.6)"
    });
    outlinedText(`${state.scoreRed}  -  ${state.scoreBlue}`, MID, 1011, 104, "#fff4c4", {
      stroke: "#13172c", lineWidth: 18, shadow: "rgba(0,0,0,.65)"
    });
    outlinedText("MATCH SCORE", MID, 1087, 20, "#d9e4ff", { stroke: "#15192d", lineWidth: 5, weight: 900, shadow: "none" });
    outlinedText("NEXT ROUND STARTING…", MID, 1163, 20, "#b8bfd7", { stroke: "#15192d", lineWidth: 5, weight: 900, shadow: "none" });
    ctx.restore();
  }

  function updateTerritoryBar() {
    const total = state.territoryRed + state.territoryBlue || 1;
    const targetRatio = state.territoryRed / total;
    const targetFrontlineX = TERRITORY_BAR_X + TERRITORY_BAR_WIDTH * territoryPercent("RED") / 100;
    if (gsap && !state.reducedMotion && state.gameStarted) {
      gsap.to(state.territoryRatio, { red: targetRatio, duration: .75, ease: "power2.out", overwrite: true });
      gsap.to(state.frontline, { x: targetFrontlineX, duration: .72, ease: "power2.out", overwrite: true });
      state.troops.forEach((troop) => {
        if (troop.dead) return;
        const targetX = targetFrontlineX + (troop.team === "RED" ? -36 : 36);
        if (troop.status === "frontline") {
          gsap.to(troop, { x: targetX, duration: .72, ease: "power2.out", overwrite: "auto" });
        } else {
          troop.targetX = targetX;
          gsap.killTweensOf(troop, "x");
          gsap.to(troop, {
            x: targetX,
            duration: Math.max(.25, Math.abs(targetX - troop.x) / troop.moveSpeed),
            ease: "none",
            onComplete: () => reachFrontline(troop)
          });
        }
      });
    } else {
      state.territoryRatio.red = targetRatio;
      state.frontline.x = targetFrontlineX;
      state.troops.forEach((troop) => {
        if (troop.dead) return;
        troop.targetX = targetFrontlineX + (troop.team === "RED" ? -36 : 36);
        if (troop.status === "frontline") troop.x = troop.targetX;
      });
    }
  }

  function setTerritory(team, amount) {
    if (state.matchOver) return;
    const normalized = teamOf(team);
    const nextValue = clamp((normalized === "RED" ? state.territoryRed : state.territoryBlue) + amount, 0, TERRITORY_MAX_HP);
    if (normalized === "RED") {
      state.territoryRed = nextValue;
      state.territoryBlue = TERRITORY_MAX_HP - nextValue;
    } else {
      state.territoryBlue = nextValue;
      state.territoryRed = TERRITORY_MAX_HP - nextValue;
    }
    updateTerritoryBar();
    checkVictory();
  }

  function checkVictory() {
    if (state.matchOver || !state.gameStarted) return;
    if (state.territoryRed >= TERRITORY_MAX_HP) beginVictory("RED");
    else if (state.territoryBlue >= TERRITORY_MAX_HP) beginVictory("BLUE");
  }

  function beginVictory(team) {
    if (state.matchOver) return;
    state.matchOver = true;
    stopTroopSounds();
    resetGiftSession();
    state.winner = teamOf(team);
    updateGameControls();
    if (state.winner === "RED") state.scoreRed += 1;
    else state.scoreBlue += 1;
    state.roundResetTimer = 5.5;
    playFinishSound();

    state.troops.forEach((troop) => {
      if (troop.dead) return;
      troop.status = "victory";
      if (gsap) gsap.killTweensOf(troop, "x");
    });
    state.effects.filter((effect) => effect.kind === "projectile").forEach((effect) => {
      if (gsap) gsap.killTweensOf(effect);
      effect.finished = true;
    });
    state.effects = state.effects.filter((effect) => effect.kind !== "projectile");

    playImpact(MID, 930, state.winner, 270);
    floatingLabel("VICTORY!", MID, 730, state.winner, 64);
    saveGameState();
    if (state.gameStarted && gsap && !state.reducedMotion) {
      state.resetCall = gsap.delayedCall(state.roundResetTimer, resetRound);
    }
  }

  function resetGiftSession() {
    state.viewerTeams.clear();
    state.viewerProfiles.clear();
    state.giftCoinBalances.clear();
    state.viewerLikeCounts.clear();
    clearPendingGiftSpawns();
  }

  function resetRound() {
    stopSessionAnimationVideo(false);
    stopTroopSounds();
    stopFinishSound();
    if (state.resetCall) {
      state.resetCall.kill();
      state.resetCall = null;
    }
    state.troops.forEach((troop) => { if (gsap) gsap.killTweensOf(troop); });
    state.effects.forEach((effect) => { if (gsap) gsap.killTweensOf(effect); });
    state.labels.forEach((label) => { if (gsap) gsap.killTweensOf(label); });
    state.troops = [];
    state.effects = [];
    state.labels = [];
    resetGiftSession();
    state.animationVideoPlayed = false;
    state.matchOver = false;
    state.winner = null;
    state.roundResetTimer = 0;
    state.territoryRed = TERRITORY_MAX_HP / 2;
    state.territoryBlue = TERRITORY_MAX_HP / 2;
    startBackgroundMusic();
    updateTerritoryBar();
    updateGameControls();
    pushFeed("RED", "Arena", `Round ${state.scoreRed + state.scoreBlue + 1} begins!`);
    saveGameState();
  }

  function updateGameControls() {
    const startButton = document.getElementById("start-game");
    if (!startButton) return;
    startButton.disabled = state.gameStarted;
    startButton.querySelector(".action-icon").textContent = state.gameStarted ? "✓" : "▶";
    startButton.querySelector(".action-label").textContent = state.gameStarted ? "Berjalan" : "Mulai";
    startButton.setAttribute("aria-label", state.gameStarted ? "Game sedang berjalan" : "Mulai game");
    startButton.title = state.gameStarted ? "Game sedang berjalan" : "Mulai game";
    document.querySelectorAll("[data-spawn]").forEach((button) => {
      button.disabled = !state.gameStarted || state.matchOver;
    });
  }

  function startGame() {
    if (settingsOnlyMode || state.gameStarted) return;
    state.gameStarted = true;
    startBackgroundMusic();
    state.lastTime = 0;
    if (listenerEndpoint) tiktokConnector.connect(listenerEndpoint);
    startAmbientAnimations();
    updateTerritoryBar();
    state.troops.forEach((troop) => {
      if (gsap && !state.reducedMotion) {
        gsap.to(troop, { rotation: randomBetween(-8, 8), duration: randomBetween(.32, .48), ease: "sine.inOut", repeat: -1, yoyo: true });
        gsap.to(troop, { scaleY: 1.08, duration: .28, ease: "sine.inOut", repeat: -1, yoyo: true });
        gsap.to(troop, { bobY: troop.isBoss ? 5 : 3, duration: troop.isBoss ? .56 : .38, ease: "sine.inOut", repeat: -1, yoyo: true });
      }
    });
    updateGameControls();
    checkVictory();
    saveGameState();
    requestRender();
  }

  function resetGame() {
    stopSessionAnimationVideo(false);
    stopTroopSounds();
    stopFinishSound();
    stopBackgroundMusic();
    clearPendingGiftSpawns();
    if (state.resetCall) {
      state.resetCall.kill();
      state.resetCall = null;
    }
    state.troops.forEach((troop) => { if (gsap) gsap.killTweensOf(troop); });
    state.effects.forEach((effect) => { if (gsap) gsap.killTweensOf(effect); });
    state.labels.forEach((label) => { if (gsap) gsap.killTweensOf(label); });
    if (gsap) {
      gsap.killTweensOf(state.territoryRatio);
      gsap.killTweensOf(state.frontline);
    }
    state.troops = [];
    state.effects = [];
    state.labels = [];
    state.feed = [];
    resetGiftSession();
    state.territoryRed = TERRITORY_MAX_HP / 2;
    state.territoryBlue = TERRITORY_MAX_HP / 2;
    state.territoryRatio.red = .5;
    state.frontline.x = MID;
    state.scoreRed = 0;
    state.scoreBlue = 0;
    state.gameStarted = false;
    state.animationVideoPlayed = false;
    tiktokConnector.disconnect();
    stopAmbientAnimations();
    state.matchOver = false;
    state.winner = null;
    state.roundResetTimer = 0;
    state.nextId = 1;
    state.spawnCount = 0;
    state.elapsed = 0;
    state.lastTime = 0;
    state.saveAccumulator = 0;
    updateGameControls();
    saveGameState();
    requestRender();
  }

  function pushFeed(team, username, message) {
    state.feed.unshift({ team: teamOf(team), username: String(username || "TikTok User"), message: String(message || "joined the battle") });
    state.feed.length = Math.min(state.feed.length, 12);
  }

  function floatingLabel(text, x, y, team, size = 42) {
    const label = { text, x, y, alpha: 1, scale: .75, size, color: TEAM[teamOf(team)].color };
    state.labels.push(label);
    if (gsap && !state.reducedMotion) {
      gsap.fromTo(label, { y: y + 12, alpha: 0, scale: .55 }, {
        y: y - 84, alpha: 0, scale: 1.12, duration: .95, ease: "power2.out",
        onComplete: () => { state.labels = state.labels.filter((item) => item !== label); }
      });
    } else {
      label.fallbackTime = 0;
    }
  }

  function playImpact(x, y, team, size = 180) {
    const winner = teamOf(team);
    const impact = { kind: "impact", x, y, team: winner, alpha: 1, scale: .25, size };
    state.effects.push(impact);
    if (gsap && !state.reducedMotion) {
      gsap.fromTo(impact, { scale: .25, alpha: .95 }, {
        scale: size < 150 ? 1.65 : 1.35, alpha: 0, duration: .58, ease: "power2.out",
        onComplete: () => { state.effects = state.effects.filter((item) => item !== impact); }
      });
    } else {
      impact.fallbackTime = 0;
    }
    return impact;
  }

  function playBossAttack(team, x, y) {
    const impact = {
      kind: "bossImpact", team, x, y,
      alpha: 1, scale: .2, rotation: 0
    };
    state.effects.push(impact);

    if (gsap && !state.reducedMotion) {
      gsap.fromTo(impact, { scale: .2, alpha: 1 }, {
        scale: 1.55, alpha: 0, duration: .56, ease: "power2.out",
        onComplete: () => { state.effects = state.effects.filter((effect) => effect !== impact); }
      });
    } else {
      impact.fallbackTime = 0;
      impact.duration = .56;
    }
  }

  function playShield(troop) {
    const shield = { kind: "shield", team: troop.team, x: troop.x, y: troop.y, alpha: .8, scale: .72 };
    state.effects.push(shield);
    if (gsap && !state.reducedMotion) {
      gsap.to(shield, {
        alpha: 0, scale: 1.2, duration: .34, ease: "power2.out",
        onComplete: () => { state.effects = state.effects.filter((effect) => effect !== shield); }
      });
    } else {
      shield.fallbackTime = 0;
    }
  }

  function launchProjectile(attacker, targetX, targetY, onImpact) {
    const projectile = {
      kind: "projectile", team: attacker.team,
      x: attacker.x, y: attacker.y - (attacker.isBoss ? 45 : 22),
      startX: attacker.x, startY: attacker.y - (attacker.isBoss ? 45 : 22),
      targetX, targetY, alpha: 1, scale: .9, rotation: 0, progress: 0, finished: false
    };
    state.effects.push(projectile);
    const finish = () => {
      if (projectile.finished) return;
      projectile.finished = true;
      state.effects = state.effects.filter((effect) => effect !== projectile);
      if (!state.matchOver) onImpact();
    };
    projectile.finish = finish;
    if (gsap && !state.reducedMotion) {
      gsap.to(projectile, {
        x: targetX, y: targetY, rotation: Math.PI * 2, scale: 1.15,
        duration: .38, ease: "power2.in", onComplete: finish
      });
    } else {
      projectile.fallbackTime = 0;
      projectile.duration = .38;
    }
  }

  function impactAt(x, y, team, amount, username = "") {
    const winner = teamOf(team);
    playImpact(x, y, winner);
    floatingLabel(`-${formatTerritoryDelta(amount)}`, x, y - 12, winner, amount / TERRITORY_MAX_HP >= .4 ? 53 : 43);
    setTerritory(winner, amount);
    pushFeed(winner, username || `${winner} Faction`, `dealt ${formatTerritoryDelta(amount)} territory damage`);
  }

  function retireTroop(troop) {
    if (troop.dead || troop.status === "dying") return;
    troop.status = "dying";
    troop.dead = true;
    const remove = () => { state.troops = state.troops.filter((item) => item !== troop); };
    if (gsap) gsap.killTweensOf(troop);
    if (gsap && !state.reducedMotion) {
      gsap.to(troop, { alpha: 0, popScale: .2, duration: .32, ease: "power2.in", onComplete: remove });
    } else {
      remove();
    }
  }

  function reachFrontline(troop) {
    if (troop.dead || troop.status === "frontline") return;
    troop.status = "frontline";
    troop.x = state.frontline.x + (troop.team === "RED" ? -36 : 36);
    troop.attackTimer = randomBetween(.55, .9);
    if (gsap && !state.reducedMotion) {
      gsap.killTweensOf(troop, "x");
      gsap.to(troop, { x: state.frontline.x + (troop.team === "RED" ? -36 : 36), duration: .24, ease: "power1.out" });
    }
    pushFeed(troop.team, troop.username, "reached the frontline and is attacking!");
  }

  function spawnTroop(teamValue, troopType = "knight", username = "TikTok User", isBoss = false, giftName = "", viewerKey = "", avatarUrl = "") {
    const team = teamOf(teamValue);
    const type = String(troopType || "knight").toLowerCase();
    const safeType = TROOP_NAMES[type] ? type : "knight";
    const side = TEAM[team];
    const id = state.nextId++;
    const spawnX = team === "RED" ? randomBetween(60, 205) : randomBetween(875, 1020);
    const targetX = state.frontline.x + (team === "RED" ? -36 : 36);
    const y = randomBetween(BATTLE_TOP + (isBoss ? 120 : 90), BATTLE_BOTTOM - (isBoss ? 125 : 85));
    const maxHp = (isBoss ? BOSS_HP : TROOP_HP[safeType]) * GLOBAL_HP_MULTIPLIER;
    const user = String(username || `User${id}`);
    const troop = {
      id, team, type: safeType, username: user, isBoss,
      viewerKey: String(viewerKey || ""),
      avatarUrl: safeAvatarUrl(avatarUrl) || state.viewerProfiles.get(String(viewerKey || ""))?.avatarUrl || "",
      x: spawnX, y, targetX, direction: side.direction,
      scaleY: 1, popScale: .72, rotation: 0, bobY: 0, attackOffset: 0, attackSwing: 0, attackSwingTimer: 0,
      frontPose: 1, phase: Math.random() * 8,
      speed: randomBetween(.92, 1.12), spawnAge: 0, dead: false, status: "advancing", alpha: 1,
      maxHp,
      hp: maxHp,
      attackDamage: isBoss ? 58 : TROOP_ATTACK[safeType],
      pushPower: isBoss ? 8 : TROOP_PUSH[safeType],
      attackCooldown: isBoss ? 3.6 : 2.8,
      attackTimer: 0,
      attackOffsetTimer: 0,
      pushCount: 0,
      giftName: String(giftName || "")
    };
    // Keep the same horizontal speed regardless of how far the frontline is.
    troop.moveSpeed = (isBoss ? 58 : 108) * troop.speed;
    const movementDuration = Math.max(.25, Math.abs(targetX - spawnX) / troop.moveSpeed);
    state.troops.push(troop);
    state.spawnCount += 1;
    playTroopSound(troop, "spawn");
    const title = isBoss ? "Golem Boss" : TROOP_NAMES[safeType];
    const message = isBoss ? "summoned a Boss!" : `spawned a ${title}!`;
    pushFeed(team, user, message);
    floatingLabel(isBoss ? "BOSS!" : `+ ${title.toUpperCase()}`, spawnX, y - 125, team, isBoss ? 40 : 29);

    if (state.gameStarted && gsap && !state.reducedMotion) {
      gsap.to(troop, { x: targetX, duration: movementDuration, ease: "none", onComplete: () => reachFrontline(troop) });
      gsap.to(troop, { rotation: randomBetween(-8, 8), duration: randomBetween(.32, .48), ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.to(troop, { scaleY: 1.08, duration: .28, ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.to(troop, { bobY: isBoss ? 5 : 3, duration: isBoss ? .56 : .38, ease: "sine.inOut", repeat: -1, yoyo: true });
      if (isBoss) gsap.to(troop, { frontPose: 0, delay: .55, duration: 0 });
      gsap.fromTo(troop, { popScale: .72 }, { popScale: 1, duration: isBoss ? .48 : .32, ease: "back.out(2)" });
    } else {
      troop.popScale = 1;
    }
    return troop;
  }

  function lunge(troop) {
    troop.attackOffset = TEAM[troop.team].direction * 18;
    troop.attackOffsetTimer = .3;
    troop.attackSwingTimer = .32;
    if (gsap && !state.reducedMotion) {
      gsap.to(troop, { attackOffset: 0, delay: .1, duration: .18, ease: "power2.out", overwrite: true });
      gsap.killTweensOf(troop, "attackSwing");
      gsap.fromTo(troop, { attackSwing: 0 }, {
        attackSwing: 1, duration: .32, ease: "power2.out", overwrite: true,
        onComplete: () => { troop.attackSwing = 0; }
      });
    }
  }

  function resolveUnitAttack(attacker, target, damage = attacker.attackDamage, bossPrimaryHit = false) {
    if (state.matchOver || attacker.dead || target.dead) return;
    target.hp = Math.max(0, target.hp - damage);
    playShield(target);
    const impactSize = bossPrimaryHit ? 320 : (target.hp <= 0 ? 170 : (attacker.type === "beast" ? 132 : 92));
    playImpact(target.x, target.y, attacker.team, impactSize);
    floatingLabel(`-${Math.round(damage)}`, target.x, target.y - 58, attacker.team, target.isBoss ? 38 : 31);
    if (target.hp <= 0) {
      floatingLabel("KO!", target.x, target.y - 104, attacker.team, 36);
      pushFeed(attacker.team, attacker.username, `defeated ${target.username}'s ${target.isBoss ? "Boss" : TROOP_NAMES[target.type]}`);
      retireTroop(target);
    }
  }

  function attackUnit(attacker, targets) {
    if (attacker.dead || !targets.length) return;
    playTroopSound(attacker, "attack");
    lunge(attacker);
    const damagePerTarget = attacker.attackDamage / targets.length;
    const primaryTarget = targets[0];
    if (attacker.isBoss) playBossAttack(attacker.team, primaryTarget.x, primaryTarget.y + 42);
    if (attacker.type === "mage" && !attacker.isBoss) {
      targets.forEach((target) => {
        launchProjectile(attacker, target.x, target.y - 12, () => resolveUnitAttack(attacker, target, damagePerTarget));
      });
    } else {
      targets.forEach((target, index) => resolveUnitAttack(attacker, target, damagePerTarget, attacker.isBoss && index === 0));
    }
  }

  function hasOpposingUnits(team) {
    return state.troops.some((enemy) =>
      !enemy.dead && (enemy.status === "advancing" || enemy.status === "frontline") && enemy.team !== team
    );
  }

  function pushFrontline(troop) {
    if (troop.dead || state.matchOver || hasOpposingUnits(troop.team)) return;
    playTroopSound(troop, "attack");
    lunge(troop);
    const applyPush = () => {
      if (troop.dead || state.matchOver || hasOpposingUnits(troop.team)) return;
      const amount = troop.pushPower;
      const x = state.frontline.x;
      playImpact(x, troop.y, troop.team, troop.isBoss ? 190 : (troop.type === "beast" ? 145 : 112));
      if (troop.isBoss) playBossAttack(troop.team, x, troop.y + 58);
      floatingLabel(`+${formatTerritoryDelta(amount)}`, x, troop.y - 55, troop.team, troop.isBoss ? 43 : 32);
      setTerritory(troop.team, amount);
      troop.pushCount += 1;
      if (troop.pushCount % 3 === 1) {
        pushFeed(troop.team, troop.username, `pushed the frontline +${formatTerritoryDelta(amount)}`);
      }
    };

    if (troop.type === "mage" && !troop.isBoss) {
      launchProjectile(troop, state.frontline.x, troop.y - 18, applyPush);
    } else {
      applyPush();
    }
  }

  function updateCombat(delta) {
    if (state.matchOver) return;
    const troops = [...state.troops];
    troops.forEach((troop) => {
      if (state.matchOver || troop.dead || troop.status !== "frontline") return;
      troop.attackTimer -= delta;
      if (troop.attackTimer > 0) return;
      troop.attackTimer = troop.attackCooldown;

      const targets = state.troops
        .filter((enemy) => !enemy.dead && enemy.status === "frontline" && enemy.team !== troop.team)
        .filter((enemy) => Math.abs(enemy.x - troop.x) < (troop.isBoss || enemy.isBoss ? 150 : 118))
        .sort((a, b) => Math.abs(a.x - troop.x) - Math.abs(b.x - troop.x));

      if (targets.length) attackUnit(troop, targets);
      else if (!hasOpposingUnits(troop.team)) pushFrontline(troop);
    });
  }

  function updateBattleAttrition(delta) {
    if (state.matchOver) return;
    const activeTeams = { RED: false, BLUE: false };
    const teamAttackPower = { RED: 0, BLUE: 0 };
    state.troops.forEach((troop) => {
      if (troop.dead || troop.status === "dying") return;
      activeTeams[troop.team] = true;
      teamAttackPower[troop.team] += troop.attackDamage / 30;
    });
    if (!activeTeams.RED || !activeTeams.BLUE) return;

    // Outnumbered units take more battlefield pressure, even when enemies are
    // outside direct attack range. Keep one HP so only a direct hit can KO.
    state.troops.forEach((troop) => {
      if (troop.dead || troop.status === "dying") return;
      const enemyTeam = troop.team === "RED" ? "BLUE" : "RED";
      const enemyPressure = Math.min(4.5, teamAttackPower[enemyTeam] * .8);
      const pressurePerSecond = (troop.isBoss ? .5 : .35) + enemyPressure;
      troop.hp = Math.max(1, troop.hp - pressurePerSecond * delta);
    });
  }

  function normalizeCommand(data) {
    if (!data || typeof data !== "object") return null;
    const action = String(data.action || "").toUpperCase();
    if (!["SPAWN_TROOP", "SPAWN_BOSS", "ADD_DAMAGE", "UPDATE_TERRITORY", "JOIN_TEAM"].includes(action)) return null;
    return { ...data, action, team: teamOf(data.team), amount: Number(data.amount) };
  }

  function handleGameCommand(input) {
    if (settingsOnlyMode) return false;
    const data = normalizeCommand(input);
    if (!data) {
      console.warn("Faction War: command tidak dikenal", input);
      return false;
    }
    if (state.matchOver) return false;
    const username = String(data.username || "TikTok User");
    const amount = Number.isFinite(data.amount) ? Math.max(0, data.amount) : 0;

    switch (data.action) {
      case "SPAWN_TROOP":
        spawnTroop(data.team, data.troopType || "knight", username, false, data.giftName || "", data.viewerKey, data.avatarUrl);
        break;
      case "SPAWN_BOSS":
        spawnTroop(data.team, "beast", username, true, data.giftName || "", data.viewerKey, data.avatarUrl);
        break;
      case "ADD_DAMAGE":
        impactAt(data.team === "RED" ? 350 : 730, randomBetween(BATTLE_TOP + 100, BATTLE_BOTTOM - 80), data.team, amount || 10, username);
        break;
      case "UPDATE_TERRITORY":
        setTerritory(data.team, amount || 5);
        pushFeed(data.team, username, `pushed the frontline +${formatTerritoryDelta(amount || 5)}`);
        floatingLabel(`+${formatTerritoryDelta(amount || 5)}`, data.team === "RED" ? 280 : 800, 720, data.team, 38);
        break;
      case "JOIN_TEAM": {
        setTerritory(data.team, amount || 1);
        const joinSource = data.joinSource === "gift"
          ? "first gift"
          : data.joinSource === "like"
            ? `${uiSettings.likesPerTroop} likes`
            : `comment ${data.team === "RED" ? "1" : "2"}`;
        pushFeed(data.team, username, `joined ${teamDisplayName(data.team)} · ${joinSource}`);
        floatingLabel(`${teamDisplayName(data.team).toUpperCase()} +1`, data.team === "RED" ? 280 : 800, 760, data.team, 34);
        break;
      }
      default:
        return false;
    }
    if (!state.gameStarted) {
      saveGameState();
      requestRender();
    }
    return true;
  }

  // TikTok event to game command rules belong to this game. Other games can
  // subscribe to the same connector and map these events differently.
  function handleTikTokEvent(event) {
    if (!event || !state.gameStarted || state.matchOver) return false;
    if (event.type === "like") {
      if (!uiSettings.likeTroopsEnabled) return false;
      const userKey = viewerIdentityKey(event);
      const totalLikes = (state.viewerLikeCounts.get(userKey) || 0) + Math.max(1, Math.floor(Number(event.likeCount) || 1));
      const troopCount = Math.floor(totalLikes / uiSettings.likesPerTroop);
      state.viewerLikeCounts.set(userKey, totalLikes % uiSettings.likesPerTroop);
      if (troopCount <= 0) {
        saveGameState();
        return true;
      }

      let team = state.viewerTeams.get(userKey);
      if (!team) {
        team = Math.random() < .5 ? "RED" : "BLUE";
        state.viewerTeams.set(userKey, team);
        state.giftCoinBalances.set(userKey, 0);
        rememberViewer(event, team, userKey);
        handleGameCommand({ action: "JOIN_TEAM", team, username: event.username, joinSource: "like" });
      } else {
        rememberViewer(event, team, userKey);
      }
      for (let i = 0; i < troopCount; i += 1) {
        enqueueGiftSpawn(team, "knight", event.username || "TikTok User", `${uiSettings.likesPerTroop} Likes`, event);
      }
      saveGameState();
      return true;
    }
    if (event.type === "comment") {
      const choice = event.comment.trim().toLowerCase().replace(/[\s_-]+/g, "");
      const team = choice === "1" || choice === "join1" ? "RED" : choice === "2" || choice === "join2" ? "BLUE" : null;
      if (!team) return false;
      const userKey = viewerIdentityKey(event);
      if (state.viewerTeams.has(userKey) && state.viewerTeams.get(userKey) !== team) {
        state.giftCoinBalances.set(userKey, 0);
      }
      state.viewerTeams.set(userKey, team);
      rememberViewer(event, team, userKey);
      saveGameState();
      return handleGameCommand({ action: "JOIN_TEAM", team, username: event.username });
    }
    if (event.type === "gift") {
      const giftName = String(event.giftName || "Gift");
      const username = String(event.username || "TikTok User");
      playSessionAnimationVideo(username);
      if (uiSettings.giftMode === "gift" && giftCatalogReady) {
        const giftId = String(event.giftId || "").trim().toLowerCase();
        const normalizedGiftName = giftName.trim().toLowerCase();
        const matchedAssignment = GIFT_UNIT_TYPES.flatMap((type) => ["RED", "BLUE"].map((team) => ({
          type,
          team,
          assignment: uiSettings.giftAssignments[type][team].trim().toLowerCase()
        }))).find(({ assignment }) => assignment && (assignment === giftId || assignment === normalizedGiftName));
        if (!matchedAssignment) return false;
        const { type: matchedType, team } = matchedAssignment;
        rememberViewer(event, team);
        const count = clamp(Math.floor(Number(event.giftCount) || 1), 1, 25);
        for (let i = 0; i < count; i += 1) enqueueGiftSpawn(team, matchedType, username, giftName, event);
        saveGameState();
        return true;
      }

      const userKey = viewerIdentityKey(event);
      let team = state.viewerTeams.get(userKey);
      if (!team) {
        team = Math.random() < .5 ? "RED" : "BLUE";
        state.viewerTeams.set(userKey, team);
        state.giftCoinBalances.set(userKey, 0);
        rememberViewer(event, team, userKey);
        handleGameCommand({ action: "JOIN_TEAM", team, username, joinSource: "gift" });
      } else {
        rememberViewer(event, team, userKey);
      }
      const coinValue = Math.max(0, Number(event.coinValue) || 0);
      if (coinValue <= 0) {
        saveGameState();
        return false;
      }
      let balance = (state.giftCoinBalances.get(userKey) || 0) + coinValue * Math.max(1, Number(event.giftCount) || 1);
      let spawned = 0;
      while (spawned < 50) {
        const affordableType = GIFT_UNIT_TYPES
          .filter((type) => uiSettings.coinCosts[type] <= balance)
          .sort((a, b) => uiSettings.coinCosts[b] - uiSettings.coinCosts[a])[0];
        if (!affordableType) break;
        balance -= uiSettings.coinCosts[affordableType];
        enqueueGiftSpawn(team, affordableType, username, giftName, event);
        spawned += 1;
      }
      state.giftCoinBalances.set(userKey, balance);
      saveGameState();
      return true;
    }
    return false;
  }

  function spawnConfiguredUnit(team, type, username, giftName, event = null) {
    const viewerKey = event ? viewerIdentityKey(event) : "";
    const avatarUrl = event?.avatarUrl || "";
    if (type === "boss") {
      return handleGameCommand({ action: "SPAWN_BOSS", team, username, giftName, viewerKey, avatarUrl });
    }
    return handleGameCommand({ action: "SPAWN_TROOP", team, troopType: type, username, giftName, viewerKey, avatarUrl });
  }

  function enqueueGiftSpawn(team, type, username, giftName, event) {
    pendingGiftSpawns.push({
      team,
      type,
      username,
      giftName,
      event: {
        userId: event.userId,
        username: event.username,
        avatarUrl: event.avatarUrl
      }
    });
    if (!pendingGiftSpawnTimer) processNextGiftSpawn();
  }

  function processNextGiftSpawn() {
    pendingGiftSpawnTimer = 0;
    if (state.matchOver) {
      pendingGiftSpawns.length = 0;
      saveGameState();
      return;
    }
    const next = pendingGiftSpawns.shift();
    if (!next) return;
    spawnConfiguredUnit(next.team, next.type, next.username, next.giftName, next.event);
    saveGameState();
    pendingGiftSpawnTimer = window.setTimeout(processNextGiftSpawn, GIFT_SPAWN_INTERVAL_MS);
  }

  function clearPendingGiftSpawns() {
    pendingGiftSpawns.length = 0;
    if (pendingGiftSpawnTimer) window.clearTimeout(pendingGiftSpawnTimer);
    pendingGiftSpawnTimer = 0;
  }

  function updateFallbackAnimations(delta) {
    if (gsap && !state.reducedMotion) return;
    state.troops.forEach((troop) => {
      if (troop.status === "advancing") {
        const remaining = troop.targetX - troop.x;
        const step = troop.moveSpeed * delta;
        if (Math.abs(remaining) <= step) {
          troop.x = troop.targetX;
          reachFrontline(troop);
        } else {
          troop.x += Math.sign(remaining) * step;
        }
      }
      troop.rotation = Math.sin(state.elapsed * 8 + troop.phase) * 7;
      troop.scaleY = 1 + Math.sin(state.elapsed * 11 + troop.phase) * .07;
      troop.bobY = Math.sin(state.elapsed * 4.8 + troop.phase) * (troop.isBoss ? 5 : 3);
      if (troop.isBoss) troop.frontPose = troop.spawnAge < .55 ? 1 : 0;
      troop.attackOffsetTimer = Math.max(0, troop.attackOffsetTimer - delta);
      if (troop.attackOffsetTimer === 0) troop.attackOffset = 0;
      troop.attackSwingTimer = Math.max(0, troop.attackSwingTimer - delta);
      troop.attackSwing = troop.attackSwingTimer > 0 ? 1 - troop.attackSwingTimer / .32 : 0;
    });
    state.labels.forEach((label) => {
      label.fallbackTime += delta;
      const progress = clamp(label.fallbackTime / .95, 0, 1);
      label.y -= delta * 72;
      label.alpha = 1 - progress;
      label.scale = .75 + progress * .37;
    });
    state.labels = state.labels.filter((label) => label.alpha > .02);
    [...state.effects].forEach((effect) => {
      effect.fallbackTime += delta;
      if (effect.kind === "bossImpact") {
        const progress = clamp(effect.fallbackTime / effect.duration, 0, 1);
        effect.scale = .2 + progress * 1.35;
        effect.alpha = 1 - progress;
      } else if (effect.kind === "projectile") {
        const progress = clamp(effect.fallbackTime / effect.duration, 0, 1);
        effect.progress = progress;
        effect.x = effect.startX + (effect.targetX - effect.startX) * progress;
        effect.y = effect.startY + (effect.targetY - effect.startY) * progress;
        effect.rotation = progress * Math.PI * 2;
        effect.scale = .9 + progress * .25;
        if (progress >= 1) effect.finish();
      } else if (effect.kind === "shield") {
        const progress = clamp(effect.fallbackTime / .34, 0, 1);
        effect.scale = .72 + progress * .48;
        effect.alpha = .8 * (1 - progress);
      } else {
        const progress = clamp(effect.fallbackTime / .58, 0, 1);
        effect.scale = .25 + progress * 1.1;
        effect.alpha = 1 - progress;
      }
    });
    state.effects = state.effects.filter((effect) => effect.alpha > .02 && !effect.finished);
  }

  function saveGameState() {
    if (settingsOnlyMode) return;
    const snapshot = {
      version: 1,
      gameStarted: state.gameStarted,
      animationVideoPlayed: state.animationVideoPlayed,
      territoryRed: state.territoryRed,
      territoryBlue: state.territoryBlue,
      scoreRed: state.scoreRed,
      scoreBlue: state.scoreBlue,
      matchOver: state.matchOver,
      winner: state.winner,
      roundResetTimer: state.roundResetTimer,
      nextId: state.nextId,
      spawnCount: state.spawnCount,
      elapsed: state.elapsed || 0,
      viewerTeams: Object.fromEntries(state.viewerTeams),
      viewerProfiles: Object.fromEntries(state.viewerProfiles),
      giftCoinBalances: Object.fromEntries(state.giftCoinBalances),
      viewerLikeCounts: Object.fromEntries(state.viewerLikeCounts),
      pendingGiftSpawns,
      feed: state.feed.slice(0, 12),
      troops: state.troops
        .filter((troop) => !troop.dead && troop.status !== "dying")
        .map((troop) => ({
          id: troop.id,
          team: troop.team,
          type: troop.type,
          username: troop.username,
          isBoss: troop.isBoss,
          viewerKey: troop.viewerKey,
          avatarUrl: troop.avatarUrl,
          x: troop.x,
          y: troop.y,
          scaleY: troop.scaleY,
          popScale: troop.popScale,
          rotation: troop.rotation,
          bobY: troop.bobY,
          frontPose: troop.frontPose,
          phase: troop.phase,
          speed: troop.speed,
          spawnAge: troop.spawnAge,
          status: troop.status,
          maxHp: troop.maxHp,
          hp: troop.hp,
          attackDamage: troop.attackDamage,
          pushPower: troop.pushPower,
          attackCooldown: troop.attackCooldown,
          attackTimer: troop.attackTimer,
          pushCount: troop.pushCount,
          giftName: troop.giftName,
          moveSpeed: troop.moveSpeed
        }))
    };

    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
      if (LEGACY_SAVE_KEY) window.localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch (error) {
      // Storage may be unavailable or full; keep the live match running.
    }
  }

  function restoreGameState() {
    let saved;
    try {
      const raw = window.localStorage.getItem(SAVE_KEY) || (LEGACY_SAVE_KEY && window.localStorage.getItem(LEGACY_SAVE_KEY));
      if (!raw) return;
      saved = JSON.parse(raw);
    } catch (error) {
      return;
    }
    if (!saved || saved.version !== 1) return;

    const readNumber = (value, fallback) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const savedRed = Math.max(0, readNumber(saved.territoryRed, TERRITORY_MAX_HP / 2));
    const savedBlue = Math.max(0, readNumber(saved.territoryBlue, TERRITORY_MAX_HP / 2));
    const savedTotal = savedRed + savedBlue;
    if (savedTotal <= 0) return;

    const redRatio = clamp(savedRed / savedTotal, 0, 1);
    const winner = saved.winner === "RED" || saved.winner === "BLUE" ? saved.winner : null;
    // Saves made before the start button existed represent an already running game.
    state.gameStarted = saved.gameStarted !== false;
    state.animationVideoPlayed = saved.animationVideoPlayed === true;
    state.matchOver = saved.matchOver === true && Boolean(winner);
    state.winner = state.matchOver ? winner : null;
    state.territoryRed = redRatio * TERRITORY_MAX_HP;
    state.territoryBlue = TERRITORY_MAX_HP - state.territoryRed;
    // Restore the percentage and its battlefield marker from one shared ratio.
    state.territoryRatio.red = redRatio;
    state.frontline.x = TERRITORY_BAR_X + TERRITORY_BAR_WIDTH * redRatio;
    state.scoreRed = Math.max(0, Math.floor(readNumber(saved.scoreRed, 0)));
    state.scoreBlue = Math.max(0, Math.floor(readNumber(saved.scoreBlue, 0)));
    state.roundResetTimer = state.matchOver
      ? clamp(readNumber(saved.roundResetTimer, 5.5), .1, 5.5)
      : 0;
    state.nextId = Math.max(1, Math.floor(readNumber(saved.nextId, 1)));
    state.spawnCount = Math.max(0, Math.floor(readNumber(saved.spawnCount, 0)));
    state.elapsed = Math.max(0, readNumber(saved.elapsed, 0));
    state.viewerTeams = new Map(Object.entries(saved.viewerTeams || {}).filter(([, team]) => team === "RED" || team === "BLUE"));
    state.viewerProfiles = new Map(Object.entries(saved.viewerProfiles || {})
      .filter(([, profile]) => profile && typeof profile === "object" && (profile.team === "RED" || profile.team === "BLUE"))
      .map(([key, profile]) => [key, {
        username: String(profile.username || "TikTok User").slice(0, 50),
        avatarUrl: safeAvatarUrl(profile.avatarUrl),
        team: profile.team
      }]));
    const profileKeyByUsername = new Map([...state.viewerProfiles].map(([key, profile]) => [profile.username.toLowerCase(), key]));
    pendingGiftSpawns.length = 0;
    if (Array.isArray(saved.pendingGiftSpawns)) {
      saved.pendingGiftSpawns.slice(0, 2000).forEach((item) => {
        if (!item || !["RED", "BLUE"].includes(item.team) || !GIFT_UNIT_TYPES.includes(item.type)) return;
        pendingGiftSpawns.push({
          team: item.team,
          type: item.type,
          username: String(item.username || "TikTok User").slice(0, 50),
          giftName: String(item.giftName || "Gift").slice(0, 80),
          event: {
            userId: String(item.event?.userId || ""),
            username: String(item.event?.username || item.username || "TikTok User").slice(0, 50),
            avatarUrl: safeAvatarUrl(item.event?.avatarUrl)
          }
        });
      });
    }
    state.giftCoinBalances = new Map(Object.entries(saved.giftCoinBalances || {}).filter(([, balance]) => Number.isFinite(Number(balance)) && Number(balance) >= 0).map(([key, balance]) => [key, Number(balance)]));
    state.viewerLikeCounts = new Map(Object.entries(saved.viewerLikeCounts || {})
      .filter(([, count]) => Number.isFinite(Number(count)) && Number(count) >= 0 && Number(count) < 1000000)
      .map(([key, count]) => [key, Math.floor(Number(count))]));
    state.feed = Array.isArray(saved.feed)
      ? saved.feed.slice(0, 12).filter((item) => item && typeof item === "object").map((item) => ({
        team: item.team === "BLUE" ? "BLUE" : "RED",
        username: String(item.username || "TikTok User"),
        message: String(item.message || "joined the battle")
      }))
      : [];

    const allowedTypes = ["knight", "mage", "beast"];
    const allowedStatuses = ["advancing", "frontline", "victory"];
    state.troops = Array.isArray(saved.troops) ? saved.troops.slice(0, 2500).reduce((troops, item) => {
      if (!item || (item.team !== "RED" && item.team !== "BLUE")) return troops;
      const type = allowedTypes.includes(item.type) ? item.type : "knight";
      const isBoss = item.isBoss === true;
      const speed = readNumber(item.speed, 1);
      const maxHp = Math.max(.1, readNumber(item.maxHp, (isBoss ? BOSS_HP : TROOP_HP[type]) * GLOBAL_HP_MULTIPLIER));
      const hp = clamp(readNumber(item.hp, maxHp), .1, maxHp);
      const username = String(item.username || "TikTok User");
      const viewerKey = String(item.viewerKey || profileKeyByUsername.get(username.toLowerCase()) || "");
      const lineX = state.frontline.x + (item.team === "RED" ? -36 : 36);
      const savedStatus = allowedStatuses.includes(item.status) ? item.status : "advancing";
      const status = state.matchOver ? "victory" : (savedStatus === "victory" ? "frontline" : savedStatus);
      troops.push({
        id: Math.max(1, Math.floor(readNumber(item.id, troops.length + 1))),
        team: item.team,
        type,
        username,
        isBoss,
        viewerKey,
        avatarUrl: safeAvatarUrl(item.avatarUrl) || state.viewerProfiles.get(viewerKey)?.avatarUrl || "",
        x: clamp(readNumber(item.x, lineX), 0, W),
        y: clamp(readNumber(item.y, (BATTLE_TOP + BATTLE_BOTTOM) / 2), BATTLE_TOP - 150, BATTLE_BOTTOM + 150),
        targetX: lineX,
        direction: TEAM[item.team].direction,
        scaleY: readNumber(item.scaleY, 1),
        popScale: readNumber(item.popScale, 1),
        rotation: readNumber(item.rotation, 0),
        bobY: readNumber(item.bobY, 0),
        attackOffset: 0,
        attackSwing: 0,
        attackSwingTimer: 0,
        frontPose: readNumber(item.frontPose, isBoss ? 0 : 1),
        phase: readNumber(item.phase, Math.random() * 8),
        speed,
        spawnAge: Math.max(0, readNumber(item.spawnAge, 0)),
        dead: false,
        status,
        alpha: 1,
        maxHp,
        hp,
        attackDamage: Math.max(.1, readNumber(item.attackDamage, isBoss ? 58 : TROOP_ATTACK[type])),
        pushPower: Math.max(.1, readNumber(item.pushPower, isBoss ? 8 : TROOP_PUSH[type])),
        attackCooldown: Math.max(.1, readNumber(item.attackCooldown, isBoss ? 3.6 : 2.8)),
        attackTimer: Math.max(0, readNumber(item.attackTimer, 0)),
        attackOffsetTimer: 0,
        pushCount: Math.max(0, Math.floor(readNumber(item.pushCount, 0))),
        giftName: String(item.giftName || ""),
        moveSpeed: Math.max(.1, readNumber(item.moveSpeed, (isBoss ? 58 : 108) * speed))
      });
      return troops;
    }, []) : [];

    if (state.troops.length) {
      state.nextId = Math.max(state.nextId, ...state.troops.map((troop) => troop.id + 1));
    }
    if (!state.matchOver) updateTerritoryBar();
    state.troops.forEach((troop) => {
      if (state.gameStarted && gsap && !state.reducedMotion) {
        if (troop.isBoss) gsap.to(troop, { frontPose: 0, duration: 0 });
        gsap.to(troop, { rotation: randomBetween(-8, 8), duration: randomBetween(.32, .48), ease: "sine.inOut", repeat: -1, yoyo: true });
        gsap.to(troop, { scaleY: 1.08, duration: .28, ease: "sine.inOut", repeat: -1, yoyo: true });
        gsap.to(troop, { bobY: troop.isBoss ? 5 : 3, duration: troop.isBoss ? .56 : .38, ease: "sine.inOut", repeat: -1, yoyo: true });
      }
    });
    if (state.matchOver && gsap && !state.reducedMotion) {
      state.resetCall = gsap.delayedCall(state.roundResetTimer, resetRound);
    }
  }

  function requestRender() {
    renderDirty = true;
    if (!state.gameStarted && pendingGameTimer) {
      window.clearTimeout(pendingGameTimer);
      pendingGameTimer = 0;
    }
    if (pendingAnimationFrame || pendingGameTimer) return;
    if (state.gameStarted) {
      pendingGameTimer = window.setTimeout(() => {
        pendingGameTimer = 0;
        pendingAnimationFrame = window.requestAnimationFrame(frame);
      }, GAME_FRAME_INTERVAL);
    } else {
      pendingAnimationFrame = window.requestAnimationFrame(frame);
    }
  }

  function frame(now) {
    pendingAnimationFrame = 0;
    if (!state.gameStarted) {
      if (renderDirty) render();
      renderDirty = false;
      return;
    }
    if (!state.lastTime) state.lastTime = now;
    const delta = Math.min(.05, (now - state.lastTime) / 1000);
    state.lastTime = now;
    state.elapsed = (state.elapsed || 0) + delta;
    state.troops.forEach((troop) => { troop.spawnAge += delta; });
    updateFallbackAnimations(delta);
    updateBattleAttrition(delta);
    updateCombat(delta);
    if (state.matchOver && (!gsap || state.reducedMotion)) {
      state.roundResetTimer -= delta;
      if (state.roundResetTimer <= 0) resetRound();
    }
    state.saveAccumulator += delta;
    if (state.saveAccumulator >= SAVE_INTERVAL) {
      state.saveAccumulator = 0;
      saveGameState();
    }
    if (!sessionAnimationVideoActive) render();
    renderDirty = false;
    requestRender();
  }

  // The bottom dock is the compact local simulator. TikTok events still enter
  // through the same shared connector and are interpreted by this game.
  if (!settingsOnlyMode) tiktokConnector.subscribe(handleTikTokEvent);

  let selectedSpawnTeam = "RED";
  const teamButtons = [...document.querySelectorAll("[data-select-team]")];
  const troopButtons = [...document.querySelectorAll("[data-spawn]")];
  const bottomPanel = document.querySelector(".bottom-base");
  let bottomPanelHideTimer = 0;
  let bottomPanelInput = "pointer";

  function showBottomPanel() {
    if (bottomPanelHideTimer) window.clearTimeout(bottomPanelHideTimer);
    bottomPanelHideTimer = 0;
    document.body.classList.add("controls-visible");
  }

  function scheduleBottomPanelHide() {
    if (bottomPanelHideTimer) window.clearTimeout(bottomPanelHideTimer);
    bottomPanelHideTimer = window.setTimeout(() => {
      bottomPanelHideTimer = 0;
      if (bottomPanel.matches(":hover")) return;
      if (bottomPanelInput === "keyboard" && bottomPanel.contains(document.activeElement)) return;
      if (bottomPanel.contains(document.activeElement)) document.activeElement.blur();
      document.body.classList.remove("controls-visible");
    }, 650);
  }

  if (bottomPanel && !window.matchMedia("(hover: none)").matches) {
    window.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      bottomPanelInput = "pointer";
      const bounds = bottomPanel.getBoundingClientRect();
      const nearPanel = event.clientX >= bounds.left - 100 && event.clientX <= bounds.right + 100;
      if (nearPanel && event.clientY >= window.innerHeight - 140) showBottomPanel();
      else if (document.body.classList.contains("controls-visible")) scheduleBottomPanelHide();
    }, { passive: true });
    bottomPanel.addEventListener("pointerenter", showBottomPanel);
    bottomPanel.addEventListener("pointerleave", scheduleBottomPanelHide);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Tab" || event.key.startsWith("Arrow")) bottomPanelInput = "keyboard";
    });
    bottomPanel.addEventListener("focusin", showBottomPanel);
    bottomPanel.addEventListener("focusout", (event) => {
      if (!bottomPanel.contains(event.relatedTarget)) scheduleBottomPanelHide();
    });
  }

  const settingsDialog = document.getElementById("settings-dialog");
  const settingsForm = document.getElementById("settings-form");
  const settingsTabs = [...document.querySelectorAll("[data-settings-tab]")];
  const settingsPanels = [...document.querySelectorAll("[data-settings-panel]")];
  const giftModeOptions = [...document.querySelectorAll('input[name="gift-mode"]')];
  const giftModePanels = [...document.querySelectorAll("[data-gift-mode-panel]")];
  const gameTitleInput = document.getElementById("setting-game-title");
  const redTeamInput = document.getElementById("setting-red-team");
  const blueTeamInput = document.getElementById("setting-blue-team");
  const showAvatarInput = document.getElementById("setting-show-avatar");
  const showUsernameInput = document.getElementById("setting-show-username");
  const showGiftLegendInput = document.getElementById("setting-show-gift-legend");
  const soundEnabledInput = document.getElementById("setting-sound-enabled");
  const soundVolumeInput = document.getElementById("setting-sound-volume");
  const soundVolumeValue = document.getElementById("setting-sound-volume-value");
  const bgMusicEnabledInput = document.getElementById("setting-bg-music-enabled");
  const bgMusicVolumeInput = document.getElementById("setting-bg-music-volume");
  const bgMusicVolumeValue = document.getElementById("setting-bg-music-volume-value");
  const likeTroopsEnabledInput = document.getElementById("setting-like-troops-enabled");
  const likesPerTroopInput = document.getElementById("setting-likes-per-troop");
  const giftCatalogStatusMessage = document.getElementById("gift-catalog-status");
  const settingsDescription = document.getElementById("settings-description");
  const settingsSaveStatus = document.getElementById("settings-save-status");
  const settingsSaveStatusText = document.getElementById("settings-save-status-text");
  const settingsSaveButton = document.getElementById("settings-save-button");
  const animationVideoUsernameInput = document.getElementById("animation-video-username");
  const animationVideoFileInput = document.getElementById("animation-video-file");
  const animationVideoUploadButton = document.getElementById("animation-video-upload");
  const animationVideoStatus = document.getElementById("animation-video-status");
  const animationVideoList = document.getElementById("animation-video-list");
  const animationVideoCount = document.getElementById("animation-video-count");
  let animationVideosLoaded = false;
  const giftPickerDialog = document.getElementById("gift-picker-dialog");
  const giftPickerTitle = document.getElementById("gift-picker-title");
  const giftPickerSearch = document.getElementById("gift-picker-search");
  const giftPickerSort = document.getElementById("gift-picker-sort");
  const giftPickerMinPrice = document.getElementById("gift-picker-min-price");
  const giftPickerMaxPrice = document.getElementById("gift-picker-max-price");
  const giftPickerList = document.getElementById("gift-picker-list");
  const giftPickerCount = document.getElementById("gift-picker-count");
  const giftPickerVisibleCount = document.getElementById("gift-picker-visible-count");
  const giftPickerMore = document.getElementById("gift-picker-more");
  const giftPickerClear = document.getElementById("gift-picker-clear");
  let activeGiftAssignmentKey = "";
  let giftPickerVisibleLimit = 40;
  let settingsSaving = false;
  let settingsControlsBeforeSave = [];
  const setSettingsSaveStatus = (state, message) => {
    settingsSaveStatus.dataset.state = state;
    settingsSaveStatusText.textContent = message;
    settingsSaveStatus.hidden = false;
  };
  const clearSettingsSaveStatus = () => {
    settingsSaveStatus.hidden = true;
    settingsSaveStatus.removeAttribute("data-state");
    settingsSaveStatusText.textContent = "";
  };
  const setSettingsSaving = (saving) => {
    settingsSaving = saving;
    if (saving) {
      settingsControlsBeforeSave = [...settingsForm.querySelectorAll("button, input")]
        .map((control) => [control, control.disabled]);
      settingsControlsBeforeSave.forEach(([control]) => { control.disabled = true; });
      settingsSaveButton.textContent = "Menyimpan…";
      setSettingsSaveStatus("saving", "Menyimpan pengaturan ke SQLite…");
      return;
    }
    settingsControlsBeforeSave.forEach(([control, wasDisabled]) => { control.disabled = wasDisabled; });
    settingsControlsBeforeSave = [];
    settingsSaveButton.textContent = "Simpan";
  };
  const syncTeamNameControls = () => {
    teamButtons.forEach((button) => {
      const name = teamDisplayName(button.dataset.selectTeam);
      button.textContent = name;
      button.title = `Pilih ${name} untuk simulasi troop`;
      button.setAttribute("aria-label", `Pilih ${name} untuk simulasi troop`);
    });
  };
  syncTeamNameControls();

  const syncSoundVolumeValue = () => {
    soundVolumeValue.value = `${soundVolumeInput.value}%`;
    soundVolumeValue.textContent = `${soundVolumeInput.value}%`;
  };
  const syncSoundEnabledControl = () => {
    soundVolumeInput.disabled = !soundEnabledInput.checked;
  };
  const syncBgMusicVolumeValue = () => {
    bgMusicVolumeValue.value = `${bgMusicVolumeInput.value}%`;
    bgMusicVolumeValue.textContent = `${bgMusicVolumeInput.value}%`;
  };
  const syncBgMusicEnabledControl = () => {
    bgMusicVolumeInput.disabled = !bgMusicEnabledInput.checked;
  };
  const applySoundSettings = () => {
    troopSoundPools.forEach((pool) => pool.forEach((audio) => {
      audio.volume = uiSettings.soundVolume / 100;
      if (!uiSettings.soundEnabled && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    }));
    if (finishSound) {
      finishSound.volume = uiSettings.soundVolume / 100;
      if (!uiSettings.soundEnabled && !finishSound.paused) {
        finishSound.pause();
        finishSound.currentTime = 0;
      }
    }
  };
  const applyBackgroundMusicSettings = () => {
    if (!uiSettings.bgMusicEnabled) {
      stopBackgroundMusic();
      return;
    }
    if (backgroundMusic) backgroundMusic.volume = uiSettings.bgMusicVolume / 100;
    if (state.gameStarted) startBackgroundMusic();
  };
  soundVolumeInput.addEventListener("input", syncSoundVolumeValue);
  soundEnabledInput.addEventListener("change", syncSoundEnabledControl);
  bgMusicVolumeInput.addEventListener("input", syncBgMusicVolumeValue);
  bgMusicEnabledInput.addEventListener("change", syncBgMusicEnabledControl);
  syncSoundVolumeValue();
  syncSoundEnabledControl();
  syncBgMusicVolumeValue();
  syncBgMusicEnabledControl();

  settingsTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const selectedTab = tab.dataset.settingsTab;
      settingsTabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      settingsPanels.forEach((panel) => {
        panel.hidden = panel.dataset.settingsPanel !== selectedTab;
      });
      if (selectedTab === "animation") loadAnimationVideos();
    });
  });

  const setAnimationVideoStatus = (stateName, message) => {
    animationVideoStatus.dataset.state = stateName;
    animationVideoStatus.textContent = message;
    animationVideoStatus.hidden = !message;
  };
  const formatAnimationVideoSize = (bytes) => {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size < 0) return "Ukuran tidak diketahui";
    return size < 1024 * 1024
      ? `${Math.max(1, Math.round(size / 1024))} KB`
      : `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };
  async function loadAnimationVideos(force = false) {
    if (animationVideosLoaded && !force) return;
    animationVideoList.replaceChildren();
    animationVideoCount.textContent = "Memuat…";
    const loading = document.createElement("p");
    loading.className = "animation-video-empty";
    loading.textContent = "Memuat daftar video…";
    animationVideoList.append(loading);
    try {
      const response = await fetch("/api/games/faction-war/animation-videos", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Daftar video gagal dimuat.");
      const videos = Array.isArray(result.videos) ? result.videos : [];
      animationVideosLoaded = true;
      animationVideoCount.textContent = `${videos.length} video`;
      animationVideoList.replaceChildren();
      if (!videos.length) {
        const empty = document.createElement("p");
        empty.className = "animation-video-empty";
        empty.textContent = "Belum ada video yang diupload.";
        animationVideoList.append(empty);
        return;
      }

      videos.forEach((video) => {
        const row = document.createElement("div");
        row.className = "animation-video-row";
        const copy = document.createElement("span");
        copy.className = "animation-video-row-copy";
        const username = document.createElement("strong");
        username.textContent = `@${video.username}`;
        const filename = document.createElement("small");
        filename.textContent = `${video.filename} · ${formatAnimationVideoSize(video.size)}`;
        copy.append(username, filename);
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "animation-video-delete";
        removeButton.textContent = "Hapus";
        removeButton.setAttribute("aria-label", `Hapus video untuk @${video.username}`);
        removeButton.addEventListener("click", async () => {
          removeButton.disabled = true;
          setAnimationVideoStatus("loading", `Menghapus video @${video.username}…`);
          try {
            const deleteUrl = new URL("/api/games/faction-war/animation-videos", window.location.origin);
            deleteUrl.searchParams.set("username", video.username);
            const deleteResponse = await fetch(`${deleteUrl.pathname}${deleteUrl.search}`, { method: "DELETE" });
            const deleteResult = await deleteResponse.json().catch(() => ({}));
            if (!deleteResponse.ok) throw new Error(deleteResult.error || "Video gagal dihapus.");
            animationVideosLoaded = false;
            setAnimationVideoStatus("success", `Video @${video.username} dihapus.`);
            await loadAnimationVideos(true);
          } catch (error) {
            setAnimationVideoStatus("error", error.message || "Video gagal dihapus.");
            removeButton.disabled = false;
          }
        });
        row.append(copy, removeButton);
        animationVideoList.append(row);
      });
    } catch (error) {
      animationVideosLoaded = false;
      animationVideoCount.textContent = "Gagal memuat";
      animationVideoList.replaceChildren();
      const failed = document.createElement("p");
      failed.className = "animation-video-empty";
      failed.textContent = error.message || "Daftar video gagal dimuat.";
      animationVideoList.append(failed);
    }
  }
  animationVideoUploadButton.addEventListener("click", async () => {
    const username = animationVideoUsernameInput.value.trim().replace(/^@+/, "");
    const file = animationVideoFileInput.files?.[0];
    if (!/^[a-zA-Z0-9._]{1,50}$/.test(username)) {
      setAnimationVideoStatus("error", "Masukkan username TikTok yang valid.");
      animationVideoUsernameInput.focus();
      return;
    }
    if (!file) {
      setAnimationVideoStatus("error", "Pilih file video MP4 atau WebM.");
      animationVideoFileInput.focus();
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!new Set(["mp4", "webm"]).has(extension)) {
      setAnimationVideoStatus("error", "Format video harus MP4 atau WebM.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setAnimationVideoStatus("error", "Ukuran video maksimal 100 MB.");
      return;
    }

    const originalLabel = animationVideoUploadButton.textContent;
    animationVideoUploadButton.disabled = true;
    animationVideoUsernameInput.disabled = true;
    animationVideoFileInput.disabled = true;
    animationVideoUploadButton.textContent = "Mengunggah…";
    setAnimationVideoStatus("loading", `Mengupload video untuk @${username}…`);
    try {
      const uploadUrl = new URL("/api/games/faction-war/animation-videos", window.location.origin);
      uploadUrl.searchParams.set("username", username);
      uploadUrl.searchParams.set("filename", file.name);
      const contentType = file.type || (extension === "mp4" ? "video/mp4" : "video/webm");
      const response = await fetch(`${uploadUrl.pathname}${uploadUrl.search}`, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: file
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Upload video gagal.");
      animationVideoFileInput.value = "";
      animationVideosLoaded = false;
      setAnimationVideoStatus("success", `Video ${result.filename} tersimpan untuk @${result.username}.`);
      await loadAnimationVideos(true);
    } catch (error) {
      setAnimationVideoStatus("error", error.message || "Upload video gagal.");
    } finally {
      animationVideoUploadButton.disabled = false;
      animationVideoUsernameInput.disabled = false;
      animationVideoFileInput.disabled = false;
      animationVideoUploadButton.textContent = originalLabel;
    }
  });

  const syncGiftModePanels = (mode) => {
    giftModePanels.forEach((panel) => { panel.hidden = panel.dataset.giftModePanel !== mode; });
  };
  const formatGiftPrice = (diamondCount) => `${new Intl.NumberFormat("id-ID").format(diamondCount)} diamond`;
  const parseGiftAssignmentKey = (key) => {
    const [type, team] = String(key || "").split(":");
    return GIFT_UNIT_TYPES.includes(type) && (team === "RED" || team === "BLUE") ? { type, team } : null;
  };
  const giftAssignmentInput = (key) => document.querySelector(`[data-gift-assignment="${key}"]`);
  const giftForAssignment = (value) => {
    const assignment = String(value || "").trim();
    if (!assignment) return null;
    return giftCatalogById.get(assignment) || giftCatalog.find((gift) => gift.name.toLowerCase() === assignment.toLowerCase()) || null;
  };
  const syncGiftCatalogStatus = () => {
    const giftModeOption = giftModeOptions.find((option) => option.value === "gift");
    const coinModeOption = giftModeOptions.find((option) => option.value === "coin");
    giftModeOption.disabled = !giftCatalogReady;
    if (!giftCatalogReady && giftModeOption.checked) {
      giftModeOption.checked = false;
      coinModeOption.checked = true;
    }
    giftCatalogStatusMessage.dataset.state = giftCatalogReady ? "ready" : "failed";
    giftCatalogStatusMessage.textContent = giftCatalogReady
      ? giftCatalogSource === "saved"
        ? `Daftar siap: ${new Intl.NumberFormat("id-ID").format(giftCatalog.length)} gift dari unduhan terakhir akun ini.`
        : `Daftar siap: ${new Intl.NumberFormat("id-ID").format(giftCatalog.length)} gift tersedia untuk sesi LIVE ini.`
      : settingsOnlyMode
        ? "Belum ada katalog gift tersimpan untuk akun ini. Hubungkan akun LIVE sekali agar daftar gift bisa diunduh untuk pengaturan offline."
        : "Daftar gift tidak berhasil dimuat. Mode berdasarkan gift tidak tersedia; mode coin tetap bisa digunakan.";
  };
  const syncGiftMappingTeamTitles = () => {
    document.querySelectorAll("[data-gift-team-title]").forEach((label) => {
      label.textContent = teamDisplayName(label.dataset.giftTeamTitle);
    });
  };
  const syncGiftAssignmentButtons = () => {
    document.querySelectorAll("[data-gift-assignment]").forEach((input) => {
      const assignmentKey = input.dataset.giftAssignment;
      const assignmentSlot = parseGiftAssignmentKey(assignmentKey);
      if (!assignmentSlot) return;
      const { type, team } = assignmentSlot;
      const gift = giftForAssignment(input.value);
      const button = document.querySelector(`[data-open-gift-picker="${assignmentKey}"]`);
      const icon = document.querySelector(`[data-selected-gift-icon="${assignmentKey}"]`);
      const name = document.querySelector(`[data-selected-gift-name="${assignmentKey}"]`);
      const price = document.querySelector(`[data-selected-gift-price="${assignmentKey}"]`);
      button.disabled = !giftCatalogReady;
      const slotName = `${type[0].toUpperCase()}${type.slice(1)} ${teamDisplayName(team)}`;
      button.setAttribute("aria-label", gift ? `Gift ${gift.name}, ${formatGiftPrice(gift.diamondCount)}. Ubah pilihan untuk ${slotName}.` : `Pilih gift untuk ${slotName}`);
      name.textContent = gift ? gift.name : (input.value ? "Gift tidak ada di katalog" : "Pilih gift");
      price.textContent = gift ? `${formatGiftPrice(gift.diamondCount)} · ID ${gift.id}` : "";
      icon.hidden = !gift?.iconUrl;
      if (gift?.iconUrl) icon.src = gift.iconUrl;
    });
  };
  giftModeOptions.forEach((option) => {
    option.addEventListener("change", () => {
      if (option.checked) syncGiftModePanels(option.value);
    });
  });
  const renderGiftPicker = () => {
    const query = giftPickerSearch.value.trim().toLowerCase();
    const minPrice = giftPickerMinPrice.value === "" ? null : Math.max(0, Math.floor(Number(giftPickerMinPrice.value)));
    const maxPrice = giftPickerMaxPrice.value === "" ? null : Math.max(0, Math.floor(Number(giftPickerMaxPrice.value)));
    const validPriceRange = (minPrice === null || Number.isFinite(minPrice))
      && (maxPrice === null || Number.isFinite(maxPrice))
      && (minPrice === null || maxPrice === null || minPrice <= maxPrice);
    const sorted = validPriceRange ? giftCatalog.filter((gift) => {
      const matchesQuery = !query || gift.name.toLowerCase().includes(query) || gift.id.toLowerCase().includes(query);
      const matchesMin = minPrice === null || gift.diamondCount >= minPrice;
      const matchesMax = maxPrice === null || gift.diamondCount <= maxPrice;
      return matchesQuery && matchesMin && matchesMax;
    }) : [];
    if (giftPickerSort.value === "price-desc") sorted.sort((a, b) => b.diamondCount - a.diamondCount || a.name.localeCompare(b.name));
    else if (giftPickerSort.value === "name-asc") sorted.sort((a, b) => a.name.localeCompare(b.name) || a.diamondCount - b.diamondCount);
    else sorted.sort((a, b) => a.diamondCount - b.diamondCount || a.name.localeCompare(b.name));

    const visible = sorted.slice(0, giftPickerVisibleLimit);
    giftPickerList.replaceChildren();
    giftPickerCount.textContent = `${new Intl.NumberFormat("id-ID").format(sorted.length)} gift ditemukan`;
    giftPickerVisibleCount.textContent = `Menampilkan ${visible.length} dari ${sorted.length}`;
    giftPickerMore.hidden = visible.length >= sorted.length;
    giftPickerClear.hidden = !giftForAssignment(giftAssignmentInput(activeGiftAssignmentKey)?.value);

    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "gift-picker-empty";
      empty.textContent = validPriceRange
        ? "Tidak ada gift yang cocok dengan pencarian dan rentang harga ini."
        : "Harga minimum harus lebih kecil atau sama dengan harga maksimum.";
      giftPickerList.append(empty);
      return;
    }

    const selectedId = giftAssignmentInput(activeGiftAssignmentKey)?.value;
    visible.forEach((gift) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "gift-picker-item";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(gift.id === selectedId));
      option.dataset.giftId = gift.id;

      const icon = document.createElement("img");
      icon.alt = "";
      icon.loading = "lazy";
      icon.decoding = "async";
      if (gift.iconUrl) icon.src = gift.iconUrl;
      else icon.hidden = true;

      const copy = document.createElement("span");
      copy.className = "gift-picker-item-copy";
      const name = document.createElement("span");
      name.className = "gift-picker-item-name";
      name.textContent = gift.name;
      const meta = document.createElement("span");
      meta.className = "gift-picker-item-meta";
      meta.textContent = `${formatGiftPrice(gift.diamondCount)} · ID ${gift.id}`;
      copy.append(name, meta);
      option.append(icon, copy);
      option.addEventListener("click", () => {
        giftAssignmentInput(activeGiftAssignmentKey).value = gift.id;
        syncGiftAssignmentButtons();
        giftPickerDialog.close();
        document.querySelector(`[data-open-gift-picker="${activeGiftAssignmentKey}"]`).focus();
      });
      giftPickerList.append(option);
    });
  };
  document.querySelectorAll("[data-open-gift-picker]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!giftCatalogReady) return;
      activeGiftAssignmentKey = button.dataset.openGiftPicker;
      const assignment = parseGiftAssignmentKey(activeGiftAssignmentKey);
      const typeName = `${assignment.type[0].toUpperCase()}${assignment.type.slice(1)}`;
      giftPickerTitle.textContent = `Pilih gift untuk ${typeName} · ${teamDisplayName(assignment.team)}`;
      giftPickerSearch.value = "";
      giftPickerSort.value = "price-asc";
      giftPickerMinPrice.value = "";
      giftPickerMaxPrice.value = "";
      giftPickerVisibleLimit = 40;
      giftPickerList.scrollTop = 0;
      renderGiftPicker();
      giftPickerDialog.showModal();
      giftPickerSearch.focus();
    });
  });
  giftPickerSearch.addEventListener("input", () => {
    giftPickerVisibleLimit = 40;
    giftPickerList.scrollTop = 0;
    renderGiftPicker();
  });
  [giftPickerMinPrice, giftPickerMaxPrice].forEach((input) => {
    input.addEventListener("input", () => {
      giftPickerVisibleLimit = 40;
      giftPickerList.scrollTop = 0;
      renderGiftPicker();
    });
  });
  giftPickerSort.addEventListener("change", () => {
    giftPickerVisibleLimit = 40;
    giftPickerList.scrollTop = 0;
    renderGiftPicker();
  });
  giftPickerMore.addEventListener("click", () => {
    giftPickerVisibleLimit += 40;
    renderGiftPicker();
  });
  giftPickerClear.addEventListener("click", () => {
    giftAssignmentInput(activeGiftAssignmentKey).value = "";
    syncGiftAssignmentButtons();
    giftPickerDialog.close();
  });
  document.getElementById("gift-picker-close").addEventListener("click", () => giftPickerDialog.close());
  giftPickerDialog.addEventListener("click", (event) => {
    if (event.target === giftPickerDialog) giftPickerDialog.close();
  });
  const fillGiftSettingsForm = () => {
    giftModeOptions.forEach((option) => { option.checked = option.value === uiSettings.giftMode; });
    syncGiftCatalogStatus();
    document.querySelectorAll("[data-coin-cost]").forEach((input) => {
      input.value = uiSettings.coinCosts[input.dataset.coinCost];
    });
    document.querySelectorAll("[data-gift-assignment]").forEach((input) => {
      const assignmentSlot = parseGiftAssignmentKey(input.dataset.giftAssignment);
      if (!assignmentSlot) return;
      const { type, team } = assignmentSlot;
      const savedAssignment = uiSettings.giftAssignments[type][team];
      input.value = giftForAssignment(savedAssignment)?.id || savedAssignment;
    });
    syncGiftAssignmentButtons();
    syncGiftMappingTeamTitles();
    syncGiftModePanels(giftModeOptions.find((option) => option.checked)?.value || "coin");
  };

  const openSettingsPanel = () => {
    clearSettingsSaveStatus();
    const accountUsername = String(window.factionWarSettingsUsername || "").replace(/^@+/, "");
    settingsDescription.textContent = settingsOnlyMode
      ? `Mode pengaturan untuk akun @${accountUsername}. Listener TikTok dan gameplay tidak dijalankan.`
      : accountUsername
        ? `Pengaturan ini disimpan khusus untuk akun LIVE @${accountUsername}.`
        : "Pengaturan disimpan berdasarkan username akun LIVE yang tersambung.";
    if (window.factionWarSettingsLoadError) {
      setSettingsSaveStatus("error", `Gagal memuat setting: ${window.factionWarSettingsLoadError}`);
    }
    gameTitleInput.value = uiSettings.gameTitle;
    redTeamInput.value = uiSettings.redTeam;
    blueTeamInput.value = uiSettings.blueTeam;
    showAvatarInput.checked = uiSettings.showAvatar;
    showUsernameInput.checked = uiSettings.showUsername;
    showGiftLegendInput.checked = uiSettings.showGiftLegend;
    soundEnabledInput.checked = uiSettings.soundEnabled;
    soundVolumeInput.value = uiSettings.soundVolume;
    syncSoundVolumeValue();
    syncSoundEnabledControl();
    bgMusicEnabledInput.checked = uiSettings.bgMusicEnabled;
    bgMusicVolumeInput.value = uiSettings.bgMusicVolume;
    syncBgMusicVolumeValue();
    syncBgMusicEnabledControl();
    likeTroopsEnabledInput.checked = uiSettings.likeTroopsEnabled;
    likesPerTroopInput.value = uiSettings.likesPerTroop;
    fillGiftSettingsForm();
    settingsDialog.showModal();
    if (document.querySelector('[data-settings-tab].active')?.dataset.settingsTab === "animation") loadAnimationVideos(true);
    gameTitleInput.focus();
  };
  document.getElementById("settings-button").addEventListener("click", openSettingsPanel);
  document.getElementById("settings-close").addEventListener("click", () => settingsDialog.close());
  document.getElementById("settings-cancel").addEventListener("click", () => settingsDialog.close());
  settingsDialog.addEventListener("cancel", (event) => {
    if (settingsSaving) event.preventDefault();
  });
  settingsDialog.addEventListener("click", (event) => {
    if (event.target === settingsDialog && !settingsSaving) settingsDialog.close();
  });
  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (settingsSaving) return;
    const nextSettings = {
      gameTitle: cleanSetting(gameTitleInput.value, DEFAULT_SETTINGS.gameTitle, 32),
      redTeam: cleanSetting(redTeamInput.value, DEFAULT_SETTINGS.redTeam, 18),
      blueTeam: cleanSetting(blueTeamInput.value, DEFAULT_SETTINGS.blueTeam, 18),
      showAvatar: showAvatarInput.checked,
      showUsername: showUsernameInput.checked,
      showGiftLegend: showGiftLegendInput.checked,
      soundEnabled: soundEnabledInput.checked,
      soundVolume: cleanSoundVolume(soundVolumeInput.value, uiSettings.soundVolume),
      bgMusicEnabled: bgMusicEnabledInput.checked,
      bgMusicVolume: cleanSoundVolume(bgMusicVolumeInput.value, uiSettings.bgMusicVolume),
      likeTroopsEnabled: likeTroopsEnabledInput.checked,
      likesPerTroop: cleanPositiveCount(likesPerTroopInput.value, uiSettings.likesPerTroop),
      giftMode: giftCatalogReady
        ? (giftModeOptions.find((option) => option.checked)?.value === "gift" ? "gift" : "coin")
        : (uiSettings.giftMode === "gift" ? "gift" : "coin"),
      coinCosts: Object.fromEntries(GIFT_UNIT_TYPES.map((type) => [
        type, cleanPositiveCount(document.querySelector(`[data-coin-cost="${type}"]`).value, uiSettings.coinCosts[type])
      ])),
      giftAssignments: Object.fromEntries(GIFT_UNIT_TYPES.map((type) => [type, Object.fromEntries(
        ["RED", "BLUE"].map((team) => [
          team,
          cleanSetting(giftAssignmentInput(`${type}:${team}`).value, "", 64)
        ])
      )]))
    };

    setSettingsSaving(true);
    try {
      const saveUrl = new URL("/api/games/faction-war/settings", window.location.origin);
      if (settingsOnlyMode) saveUrl.searchParams.set("username", window.factionWarSettingsUsername);
      const response = await fetch(`${saveUrl.pathname}${saveUrl.search}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Pengaturan gagal disimpan.");

      Object.assign(uiSettings, nextSettings);
      window.factionWarSettings = nextSettings;
      window.factionWarSettingsUsername = result.username || window.factionWarSettingsUsername || "";
      window.factionWarSettingsLoadError = "";
      applySoundSettings();
      applyBackgroundMusicSettings();
      syncTeamNameControls();
      syncGiftMappingTeamTitles();
      requestRender();
      settingsDialog.close();
    } catch (error) {
      setSettingsSaveStatus("error", error.message || "Pengaturan gagal disimpan. Coba lagi.");
    } finally {
      setSettingsSaving(false);
    }
  });

  const selectSpawnTeam = (team) => {
    selectedSpawnTeam = team === "BLUE" ? "BLUE" : "RED";
    teamButtons.forEach((button) => {
      const selected = button.dataset.selectTeam === selectedSpawnTeam;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll(".troop-picker [data-red-src][data-blue-src]").forEach((icon) => {
      icon.src = icon.dataset[selectedSpawnTeam === "RED" ? "redSrc" : "blueSrc"];
    });
  };

  teamButtons.forEach((button) => {
    button.addEventListener("click", () => selectSpawnTeam(button.dataset.selectTeam));
  });

  troopButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const userNumber = Math.floor(Math.random() * 890 + 100);
      const username = `SimUser${userNumber}`;
      if (button.dataset.spawn === "boss") {
        handleGameCommand({ action: "SPAWN_BOSS", team: selectedSpawnTeam, username: `BigDonatur${userNumber}`, giftName: "Boss Summon" });
      } else {
        handleGameCommand({ action: "SPAWN_TROOP", team: selectedSpawnTeam, troopType: button.dataset.spawn, username });
      }
    });
  });

  document.getElementById("start-game").addEventListener("click", startGame);
  const leaveDialog = document.getElementById("leave-dialog");
  document.getElementById("back-to-dashboard").addEventListener("click", () => leaveDialog.showModal());
  document.getElementById("cancel-leave").addEventListener("click", () => leaveDialog.close());
  document.getElementById("confirm-leave").addEventListener("click", () => {
    leaveDialog.close();
    if (!settingsOnlyMode) resetGame();
    if (window.opener && !window.opener.closed) {
      window.close();
      if (!window.closed) window.location.assign("/");
    } else {
      window.location.assign("/");
    }
  });
  leaveDialog.addEventListener("click", (event) => {
    if (event.target === leaveDialog) leaveDialog.close();
  });

  const resetDialog = document.getElementById("reset-dialog");
  document.getElementById("reset-game").addEventListener("click", () => resetDialog.showModal());
  document.getElementById("cancel-reset").addEventListener("click", () => resetDialog.close());
  document.getElementById("confirm-reset").addEventListener("click", () => {
    resetDialog.close();
    resetGame();
  });
  resetDialog.addEventListener("click", (event) => {
    if (event.target === resetDialog) resetDialog.close();
  });
  window.addEventListener("storage", (event) => {
    if (!settingsOnlyMode && event.key === GAME_RESET_EVENT_KEY && event.newValue) resetGame();
  });

  // Console helpers use the same central command handler as the dummy controls.
  window.handleGameCommand = handleGameCommand;
  window.spawnTroop = (team, troopType = "knight", username = "UserTest") =>
    handleGameCommand({ action: "SPAWN_TROOP", team, troopType, username });
  window.spawnBoss = (team, username = "BigDonatur") =>
    handleGameCommand({ action: "SPAWN_BOSS", team, username, giftName: "Big Gift" });
  window.addDamage = (team, amount = 10) =>
    handleGameCommand({ action: "ADD_DAMAGE", team, amount, username: "Console" });
  window.updateTerritory = (team, amount = 5) =>
    handleGameCommand({ action: "UPDATE_TERRITORY", team, amount, username: "Console" });

  window.publishTikTokEvent = (event) => tiktokConnector.publish(event);
  window.connectTikTokListener = (endpoint) => {
    if (settingsOnlyMode || !state.gameStarted) return false;
    tiktokConnector.connect(endpoint);
    return true;
  };
  window.disconnectTikTokListener = () => {
    if (!settingsOnlyMode) tiktokConnector.disconnect();
  };

  if (!gsap) console.info("GSAP tidak tersedia; animasi dasar tetap berjalan. Pastikan koneksi internet aktif untuk memuat GSAP CDN.");
  if (!settingsOnlyMode) {
    restoreGameState();
    void checkRestoredTroopAnimationVideo();
  }
  if (!settingsOnlyMode && pendingGiftSpawns.length && !state.matchOver) processNextGiftSpawn();
  if (state.gameStarted) {
    startAmbientAnimations();
    startBackgroundMusic();
    if (listenerEndpoint) tiktokConnector.connect(listenerEndpoint);
  } else if (!settingsOnlyMode) {
    tiktokConnector.disconnect();
  }
  document.addEventListener("pointerdown", () => {
    if (backgroundMusicNeedsGesture && state.gameStarted) startBackgroundMusic();
  }, { passive: true });
  updateGameControls();
  window.addEventListener("pagehide", saveGameState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveGameState();
  });
  if (settingsOnlyMode) {
    document.getElementById("leave-dialog-title").textContent = "Keluar dari pengaturan?";
    document.querySelector("#leave-dialog .reset-dialog-content > p").textContent = "Perubahan yang sudah disimpan tetap tersimpan. Sesi permainan tidak diubah.";
    document.getElementById("cancel-leave").textContent = "Tetap di pengaturan";
    document.getElementById("confirm-leave").textContent = "Keluar";
    openSettingsPanel();
  }
  requestRender();
})();
