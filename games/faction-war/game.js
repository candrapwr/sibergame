import { tiktokConnector } from "../../shared/tiktok/tiktok-connector.js";
import { getGameResetEventKey } from "../../shared/game-session.js";
import { createFactionWarAudio } from "./audio.js";
import { createFactionWarLoadingScreen } from "./loading-screen.js";
import { createFactionWarRenderer } from "./renderer.js";
import { setupFactionWarSettingsPanel } from "./settings-panel.js";

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
  const loadingScreen = createFactionWarLoadingScreen();
  const W = 1080;
  const H = 1920;
  const MID = W / 2;
  const TERRITORY_HP_MULTIPLIER = 25;
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
    likeTroopType: "mage",
    screenShakeEnabled: false,
    commentTroopEnabled: true,
    commentTroopCooldown: 15,
    animationVideosPerRound: 3,
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
  const TROOP_ATTACK_COOLDOWN = 0.8;
  const BOSS_ATTACK_COOLDOWN = 1.6;
  // Load guards: keep battles punchy without letting crowds tank FPS.
  const MAX_TROOPS = 90;
  const HEAVY_TROOP_COUNT = 30;
  const HEAVY_EFFECT_COUNT = 70;
  const EFFECT_SOFT_CAP = 96;
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
      likeTroopType: ["knight", "mage", "beast", "boss"].includes(saved.likeTroopType) ? saved.likeTroopType : DEFAULT_SETTINGS.likeTroopType,
      screenShakeEnabled: saved.screenShakeEnabled === true,
      commentTroopEnabled: saved.commentTroopEnabled !== false,
      commentTroopCooldown: cleanPositiveCount(saved.commentTroopCooldown, DEFAULT_SETTINGS.commentTroopCooldown),
      animationVideosPerRound: Math.min(10, cleanPositiveCount(saved.animationVideosPerRound, DEFAULT_SETTINGS.animationVideosPerRound)),
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
    troopHpCapacity: { RED: 0, BLUE: 0 },
    gameStarted: false,
    animationVideoPlays: 0,
    animationVideoPlayedUsers: new Set(),
    commentSpawnCooldowns: new Map(),
    particles: [],
    joinedFxKeys: new Set(),
    heavyCombat: false,
    shake: { intensity: 0, time: 0, max: 1 },
    hype: { RED: 0, BLUE: 0 },
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

  const audio = createFactionWarAudio({
    state, uiSettings, settingsOnlyMode, animationVideoOverlay, animationVideoPlayer,
    requestRender, saveGameState
  });

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

  // Ambient particles animate procedurally (phase-based sine) so they cost
  // zero tweens; the renderer derives alpha/offsetY from state.elapsed.
  for (let i = 0; i < 64; i += 1) {
    const particle = {
      x: Math.random() * W,
      y: Math.random() * H,
      radius: 1 + Math.random() * 4,
      baseAlpha: randomBetween(.24, .6),
      phase: Math.random() * 8,
      speed: randomBetween(.8, 2.2),
      offsetAmp: randomBetween(6, 14),
      alpha: .42,
      offsetY: 0,
      team: Math.random() > 0.5 ? "RED" : "BLUE"
    };
    state.ambient.push(particle);
  }

  function startAmbientAnimations() {
    // Procedural now; kept as no-op hooks for existing call sites.
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

  const renderer = createFactionWarRenderer({
    canvas, ctx, W, H, MID, state, TEAM, uiSettings, giftCatalog, giftCatalogById, giftCatalogReady,
    GIFT_UNIT_TYPES, TROOP_NAMES, BATTLE_TOP, BATTLE_BOTTOM, TERRITORY_MAX_HP, TERRITORY_BAR_X, TERRITORY_BAR_WIDTH,
    AVATAR_RADIUS, AVATAR_HEAD_GAP, TROOP_WIDTH, TROOP_HEIGHT, BOSS_WIDTH, BOSS_HEIGHT,
    clamp, teamDisplayName, safeAvatarUrl, safeGiftImageUrl, fitTextSize, territoryPercent, formatTerritoryDelta, requestRender,
    onAssetsProgress: loadingScreen.update
  });
  const initialLoadingReady = loadingScreen.finish(renderer.assetsReady);

  function updateTerritoryBar() {
    const total = state.territoryRed + state.territoryBlue || 1;
    const targetRatio = state.territoryRed / total;
    const targetFrontlineX = TERRITORY_BAR_X + TERRITORY_BAR_WIDTH * territoryPercent("RED") / 100;
    state.frontlineTargetX = targetFrontlineX;
    state.territoryTargetRatio = targetRatio;
    state.troops.forEach((troop) => {
      if (troop.dead) return;
      troop.targetX = targetFrontlineX + (troop.team === "RED" ? -36 : 36);
    });
  }

  // Territory bar and frontline drift smoothly toward their targets (was a
  // GSAP tween; a per-frame lerp behaves the same and survives pause/reset).
  function updateTerritorySmoothing(delta) {
    if (state.territoryTargetRatio === undefined) return;
    const step = Math.min(1, delta * 3.4);
    state.territoryRatio.red += (state.territoryTargetRatio - state.territoryRatio.red) * step;
    if (state.frontlineTargetX !== undefined) {
      const prevX = state.frontline.x;
      state.frontline.x += (state.frontlineTargetX - state.frontline.x) * step;
      if (Math.abs(state.frontline.x - prevX) > .1) {
        // Units standing their ground shift with the line so formations stay
        // glued to the frontline instead of leaving gaps.
        const dx = state.frontline.x - prevX;
        state.troops.forEach((troop) => {
          if (troop.dead || troop.status !== "frontline") return;
          troop.x += dx;
          troop.targetX = state.frontline.x + (troop.team === "RED" ? -36 : 36);
        });
      }
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
    audio.stopTroopSounds();
    resetGiftSession();
    state.winner = teamOf(team);
    updateGameControls();
    if (state.winner === "RED") state.scoreRed += 1;
    else state.scoreBlue += 1;
    state.roundResetTimer = 5.5;
    audio.playFinishSound();

    state.troops.forEach((troop) => {
      if (troop.dead) return;
      troop.status = "victory";
    });
    state.effects.forEach((effect) => {
      if (effect.kind === "projectile") effect.finished = true;
    });
    state.effects = state.effects.filter((effect) => effect.kind !== "projectile");

    playImpact(MID, 930, state.winner, 270);
    addShake(40, .8, 46);
    spawnParticles(MID, 930, state.winner, 40);
    floatingLabel("VICTORY!", MID, 730, state.winner, 74);
    saveGameState();
    // Round reset is counted down by the frame loop (state.roundResetTimer).
  }

  function resetGiftSession() {
    state.viewerTeams.clear();
    state.viewerProfiles.clear();
    state.giftCoinBalances.clear();
    state.viewerLikeCounts.clear();
    state.commentSpawnCooldowns.clear();
    state.joinedFxKeys.clear();
    clearPendingGiftSpawns();
  }

  function resetRound() {
    audio.stopSessionAnimationVideo(false);
    audio.stopTroopSounds();
    audio.stopFinishSound();
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
    state.particles = [];
    state.shake = { intensity: 0, time: 0, max: 1 };
    state.hype = { RED: 0, BLUE: 0 };
    state.troopHpCapacity = { RED: 0, BLUE: 0 };
    resetGiftSession();
    state.animationVideoPlays = 0;
    state.animationVideoPlayedUsers.clear();
    state.matchOver = false;
    state.winner = null;
    state.roundResetTimer = 0;
    state.territoryRed = TERRITORY_MAX_HP / 2;
    state.territoryBlue = TERRITORY_MAX_HP / 2;
    audio.startBackgroundMusic();
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
    audio.startBackgroundMusic();
    state.lastTime = 0;
    if (listenerEndpoint) tiktokConnector.connect(listenerEndpoint);
    startAmbientAnimations();
    updateTerritoryBar();
    updateGameControls();
    checkVictory();
    saveGameState();
    requestRender();
  }

  function resetGame() {
    audio.stopSessionAnimationVideo(false);
    audio.stopTroopSounds();
    audio.stopFinishSound();
    audio.stopBackgroundMusic();
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
    state.particles = [];
    state.shake = { intensity: 0, time: 0, max: 1 };
    state.hype = { RED: 0, BLUE: 0 };
    state.troopHpCapacity = { RED: 0, BLUE: 0 };
    resetGiftSession();
    state.territoryRed = TERRITORY_MAX_HP / 2;
    state.territoryBlue = TERRITORY_MAX_HP / 2;
    state.territoryRatio.red = .5;
    state.frontline.x = MID;
    state.scoreRed = 0;
    state.scoreBlue = 0;
    state.gameStarted = false;
    state.animationVideoPlays = 0;
    state.animationVideoPlayedUsers.clear();
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

  function easeOutQuad(t) { const c = 1 - t; return 1 - c * c; }
  function easeInQuad(t) { return t * t; }
  function easeOutBack(t) {
    const c1 = 1.24;
    return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  // Combat VFX are advanced by one centralized pass each frame (instead of a
  // GSAP tween per object), which keeps frame cost flat when hundreds of
  // effects spawn during crowded fights.
  function addCombatEffect(effect, premium = false) {
    if (!effect) return null;
    effect.time = 0;
    effect.startScale = effect.scale;
    effect.alpha0 = effect.alpha;
    if (premium) {
      effect.premium = true;
    } else if (state.effects.length >= EFFECT_SOFT_CAP) {
      return null;
    }
    state.effects.push(effect);
    if (state.effects.length > EFFECT_SOFT_CAP + 24) {
      for (let index = 0; index < state.effects.length; index += 1) {
        if (!state.effects[index].premium) { state.effects.splice(index, 1); break; }
      }
    }
    return effect;
  }

  function damageLabel(x, y, team, text, kind) {
    const size = kind === "ko" ? 58 : (kind === "mega" ? 60 : (kind === "big" ? 46 : (kind === "boss" ? 40 : 36)));
    const color = kind === "ko" || kind === "mega" ? "#ffd34d" : TEAM[teamOf(team)].color;
    const label = {
      text, x, y, alpha: 0, scale: .45, size, color,
      startX: x, startY: y, driftX: randomBetween(-52, 52),
      rise: kind === "ko" || kind === "mega" ? 130 : 96,
      endScale: kind === "ko" || kind === "mega" ? 1.3 : 1.08,
      duration: kind === "ko" || kind === "mega" ? 1.25 : .95,
      time: 0
    };
    state.labels.push(label);
    if (state.labels.length > 60) state.labels.splice(0, state.labels.length - 60);
  }

  function floatingLabel(text, x, y, team, size = 42) {
    const label = {
      text, x, y, alpha: 0, scale: .55, size, color: TEAM[teamOf(team)].color,
      startX: x, startY: y, driftX: 0, rise: 84, endScale: 1.12, duration: .95, time: 0
    };
    state.labels.push(label);
    if (state.labels.length > 60) state.labels.splice(0, state.labels.length - 60);
  }

  function playImpact(x, y, team, size = 180) {    const winner = teamOf(team);
    const impact = {
      kind: "impact", x, y, team: winner, alpha: .95, scale: .25, size, time: 0,
      duration: .58, endScale: size < 150 ? 1.65 : 1.35
    };
    addCombatEffect(impact);
    return impact;
  }

  function addShake(intensity, duration = .3, maxOverride = 0) {
    if (settingsOnlyMode || state.reducedMotion || !state.gameStarted) return;
    if (!uiSettings.screenShakeEnabled) {
      // Even with screen shake off, keep a faint zoom-free kick for big hits?
      // No: users asked for no shake. Hit-stop remains for impact weight.
      return;
    }
    const shake = state.shake;
    if (intensity > shake.intensity || shake.time <= 0) {
      shake.intensity = clamp(intensity, 0, 46);
      shake.time = Math.min(.8, Math.max(duration, shake.time));
    }
    if (maxOverride > (shake.max || 1)) shake.max = maxOverride;
    requestRender();
  }

  let lastHitStopAt = 0;
  let hitStopUntil = 0;
  function hitStop(duration) {
    if (settingsOnlyMode || state.reducedMotion || !state.gameStarted || state.matchOver) return;
    // rAF timestamps use the performance clock, so compare within the same base.
    const now = performance.now();
    if (now - lastHitStopAt < 240) return;
    lastHitStopAt = now;
    hitStopUntil = now + duration * 1000;
  }

  const PARTICLE_COLORS = {
    RED: ["#ffca79", "#ff8a37", "#ff5a52"],
    BLUE: ["#dfffff", "#55d5ff", "#4abfff"]
  };
  function spawnParticles(x, y, team, count = 8) {
    if (settingsOnlyMode || state.reducedMotion || !state.gameStarted) return;
    // Heavy crowds: halve particle output to keep the fill rate cheap.
    if (state.heavyCombat) count = Math.ceil(count / 2);
    const colors = PARTICLE_COLORS[teamOf(team)];
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        x, y,
        vx: randomBetween(-320, 320),
        vy: randomBetween(-360, 60),
        radius: randomBetween(2.5, 6.5),
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: randomBetween(.35, .7),
        age: 0
      });
    }
    if (state.particles.length > 260) state.particles.splice(0, state.particles.length - 260);
  }

  function updateParticles(delta) {
    if (!state.particles.length) return;
    const particles = state.particles;
    let write = 0;
    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      particle.age += delta;
      if (particle.age >= particle.life) continue;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 980 * delta;
      particle.alpha = Math.max(0, 1 - particle.age / particle.life);
      particles[write++] = particle;
    }
    particles.length = write;
  }

  function updateShake(delta) {
    const shake = state.shake;
    if (shake.time <= 0 && shake.intensity <= 0) { shake.x = 0; shake.y = 0; return; }
    shake.time -= delta;
    if (shake.time <= 0) {
      shake.intensity = 0;
      shake.max = 1;
      shake.x = 0;
      shake.y = 0;
      return;
    }
    const fade = Math.max(0, Math.min(1, shake.time / .3));
    const amp = shake.intensity * fade;
    shake.x = randomBetween(-amp, amp);
    shake.y = randomBetween(-amp, amp);
  }

  function spawnConfetti(x, y) {
    if (settingsOnlyMode || state.reducedMotion || !state.gameStarted) return;
    const colors = ["#ffd34d", "#fff4c4", "#ff9a4f", "#8cecff", "#ffffff", "#ff5a52", "#4abfff"];
    for (let i = 0; i < 34; i += 1) {
      state.particles.push({
        x: x + randomBetween(-48, 48),
        y: y + randomBetween(-22, 22),
        vx: randomBetween(-560, 560),
        vy: randomBetween(-680, -80),
        radius: randomBetween(3, 8),
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: randomBetween(.6, 1.15),
        age: 0
      });
    }
    if (state.particles.length > 340) state.particles.splice(0, state.particles.length - 340);
  }

  function triggerJoinFx(teamValue, username, viewerKey, avatarUrl) {
    const key = String(viewerKey || username || "").toLowerCase();
    const team = teamOf(teamValue);
    if (!key || state.joinedFxKeys.has(key)) return;
    state.joinedFxKeys.add(key);
    const profile = state.viewerProfiles.get(key);
    if (profile) profile.joinedAt = Date.now();
    if (state.reducedMotion) {
      // Instant, no fly-in: just record the join; the roster avatar appears.
      requestRender();
      return;
    }
    const fx = addCombatEffect({
      kind: "joinShow",
      premium: true,
      team,
      startX: team === "RED" ? 90 : W - 90,
      startY: 130,
      x: team === "RED" ? 245 : W - 245,
      y: 585,
      username: String(username || "Player").slice(0, 18),
      avatarUrl: safeAvatarUrl(avatarUrl) || safeAvatarUrl(profile?.avatarUrl),
      progress: 0, pop: 0, life: 0, landed: false, ringSpin: 0, time: 0, duration: .45
    }, true);
    if (fx) requestRender();
  }

  function playBossAttack(team, x, y) {
    addCombatEffect({
      kind: "bossImpact", team, x, y,
      alpha: 1, scale: .2, rotation: 0, duration: .56, endScale: 1.55
    });
  }

  function playShield(troop) {
    addCombatEffect({
      kind: "shield", team: troop.team, x: troop.x, y: troop.y,
      alpha: .8, scale: .72, duration: .34
    });
  }

  function playSlash(x, y, team, facingLeft) {
    addCombatEffect({
      kind: "slash", team: teamOf(team), x, y, alpha: .95, scale: .45,
      rotation: facingLeft ? Math.PI : 0, duration: .42, endScale: 1.35
    });
  }

  function playClaw(x, y, team) {
    addCombatEffect({
      kind: "claw", team: teamOf(team), x, y, alpha: 1, scale: .7, progress: 0, duration: .46
    });
  }

  function playBurst(x, y, team) {
    addCombatEffect({
      kind: "burst", team: teamOf(team), x, y, alpha: .95, scale: .3,
      rotation: Math.random() * Math.PI, spin: Math.PI / 5, duration: .5, endScale: 1.25
    });
  }

  function playShockwave(x, y, team) {
    addCombatEffect({
      kind: "shockwave", team: teamOf(team), x, y, alpha: .9, scale: .25, duration: .7, endScale: 2.1
    });
  }

  function playSpawnAura(x, y, team, style) {
    addCombatEffect({
      kind: "spawnAura", team: teamOf(team), x, y, alpha: 1, scale: .35, style, duration: .8, progress: 0, endScale: 1.3
    });
  }

  function launchProjectile(attacker, targetX, targetY, onImpact) {
    const projectile = {
      kind: "projectile", team: attacker.team,
      x: attacker.x, y: attacker.y - (attacker.isBoss ? 45 : 22),
      startX: attacker.x, startY: attacker.y - (attacker.isBoss ? 45 : 22),
      targetX, targetY, alpha: 1, scale: .9, rotation: 0, progress: 0, finished: false,
      duration: .38, time: 0, onImpact, premium: true
    };
    // Projectiles resolve damage, so they bypass the soft cap. Hard ceiling
    // only as a last resort: instantly land the oldest in-flight projectile.
    if (state.effects.length > EFFECT_SOFT_CAP + 60) {
      const oldest = state.effects.find((effect) => effect.kind === "projectile" && !effect.finished);
      if (oldest) {
        oldest.finished = true;
        state.effects = state.effects.filter((effect) => effect !== oldest);
        if (!state.matchOver) oldest.onImpact?.();
      }
    }
    state.effects.push(projectile);
  }

  function impactAt(x, y, team, amount, username = "") {
    const winner = teamOf(team);
    playImpact(x, y, winner);
    damageLabel(x, y - 12, winner, `-${formatTerritoryDelta(amount)}`, amount / TERRITORY_MAX_HP >= .4 ? "big" : "normal");
    spawnParticles(x, y, winner, 8);
    addShake(10, .26);
    setTerritory(winner, amount);
    pushFeed(winner, username || `${winner} Faction`, `dealt ${formatTerritoryDelta(amount)} territory damage`);
  }

  function retireTroop(troop, silent = false) {
    if (troop.dead || troop.status === "dying") return;
    troop.status = "dying";
    troop.dead = true;
    troop.deathTime = 0;
    if (!silent) {
      spawnParticles(troop.x, troop.y, troop.team, troop.isBoss ? 18 : 10);
      addShake(troop.isBoss ? 22 : 12, .3, troop.isBoss ? 30 : 0);
    }
    if (gsap) gsap.killTweensOf(troop);
    // The central animation pass fades alpha/popScale and removes the corpse.
  }

  function reachFrontline(troop) {
    if (troop.dead || troop.status === "frontline") return;
    troop.status = "frontline";
    troop.x = state.frontline.x + (troop.team === "RED" ? -36 : 36);
    troop.attackTimer = randomBetween(.55, .9);
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
      attackCooldown: isBoss ? BOSS_ATTACK_COOLDOWN : TROOP_ATTACK_COOLDOWN,
      attackTimer: 0,
      attackOffsetTimer: 0,
      pushCount: 0,
      giftName: String(giftName || "")
    };
    // Keep the same horizontal speed regardless of how far the frontline is.
    troop.moveSpeed = (isBoss ? 58 : 108) * troop.speed;
    state.troops.push(troop);
    state.troopHpCapacity[team] += maxHp;
    state.spawnCount += 1;
    // Crowd control: when a flood of spawns piles up, quietly fold the oldest
    // non-boss units back so the fight stays readable and cheap to simulate.
    let overflow = Math.max(0, state.troops.length - MAX_TROOPS);
    if (overflow > 0) {
      for (let index = 0; index < state.troops.length - 1 && overflow > 0; index += 1) {
        const elder = state.troops[index];
        if (elder === troop || elder.isBoss || elder.dead || elder.status === "dying") continue;
        elder.hp = 0;
        retireTroop(elder, true);
        overflow -= 1;
      }
    }
    audio.playTroopSound(troop, "spawn");
    playSpawnAura(spawnX + (team === "RED" ? 30 : -30), y + 30, team, isBoss ? "boss" : safeType);
    const title = isBoss ? "Golem Boss" : TROOP_NAMES[safeType];
    const message = isBoss ? "summoned a Boss!" : `spawned a ${title}!`;
    pushFeed(team, user, message);
    floatingLabel(isBoss ? "BOSS!" : `+ ${title.toUpperCase()}`, spawnX, y - 125, team, isBoss ? 40 : 29);

    // Unit motion and idle animation are procedural (single update pass);
    // this avoids hundreds of overlapping GSAP tweens in crowded fights.
    return troop;
  }

  function lunge(troop) {
    troop.attackOffset = TEAM[troop.team].direction * 18;
    troop.attackOffsetTimer = .3;
    troop.attackSwingTimer = .32;
  }

  function playUnitStrikeEffect(attacker, x, y) {
    // In heavy fights, keep only the cheapest strike cue to cap draw cost.
    if (state.heavyCombat) {
      if (attacker.type === "knight" && !attacker.isBoss) playSlash(x, y - 10, attacker.team, attacker.team === "BLUE");
      return;
    }
    if (attacker.isBoss) playShockwave(x, y + 30, attacker.team);
    else if (attacker.type === "knight") playSlash(x, y - 10, attacker.team, attacker.team === "BLUE");
    else if (attacker.type === "beast") playClaw(x, y - 8, attacker.team);
    else if (attacker.type === "mage") playBurst(x, y - 12, attacker.team);
  }

  function resolveUnitAttack(attacker, target, damage = attacker.attackDamage, bossPrimaryHit = false) {
    if (state.matchOver || attacker.dead || target.dead) return;
    target.hp = Math.max(0, target.hp - damage);
    playShield(target);
    playUnitStrikeEffect(attacker, target.x, target.y);
    target.hitFlash = 1;
    target.knockback = (target.knockback || 0) + (bossPrimaryHit ? 40 : (attacker.isBoss ? 26 : 12));
    const impactSize = bossPrimaryHit ? 320 : (target.hp <= 0 ? 170 : (attacker.type === "beast" ? 132 : 92));
    playImpact(target.x, target.y, attacker.team, impactSize);
    spawnParticles(target.x, target.y - 10, attacker.team, bossPrimaryHit ? 12 : (attacker.isBoss ? 8 : 6));
    addShake(bossPrimaryHit ? 26 : (target.hp <= 0 ? 20 : (attacker.isBoss ? 15 : 7)), .26, bossPrimaryHit || target.hp <= 0 ? 34 : 0);
    if (target.hp <= 0) {
      hitStop(.055);
      damageLabel(target.x, target.y - 104, attacker.team, "KO!", "ko");
      pushFeed(attacker.team, attacker.username, `defeated ${target.username}'s ${target.isBoss ? "Boss" : TROOP_NAMES[target.type]}`);
      retireTroop(target);
    } else {
      damageLabel(target.x, target.y - 58, attacker.team, `-${Math.round(damage)}`, bossPrimaryHit || attacker.isBoss ? "big" : "normal");
    }
  }

  function attackUnit(attacker, targets, targetCount = targets.length) {
    if (attacker.dead || !targetCount) return;
    audio.playTroopSound(attacker, "attack");
    lunge(attacker);
    const damagePerTarget = attacker.attackDamage / targetCount;
    const primaryTarget = targets[0];
    if (attacker.isBoss) playBossAttack(attacker.team, primaryTarget.x, primaryTarget.y + 42);
    if (attacker.type === "mage" && !attacker.isBoss) {
      for (let index = 0; index < targetCount; index += 1) {
        const target = targets[index];
        launchProjectile(attacker, target.x, target.y - 12, () => resolveUnitAttack(attacker, target, damagePerTarget));
      }
    } else {
      for (let index = 0; index < targetCount; index += 1) {
        resolveUnitAttack(attacker, targets[index], damagePerTarget, attacker.isBoss && index === 0);
      }
    }
  }

  function hasOpposingUnits(team) {
    return state.troops.some((enemy) =>
      !enemy.dead && (enemy.status === "advancing" || enemy.status === "frontline") && enemy.team !== team
    );
  }

  function updateUnitVisualState(delta) {
    state.troops.forEach((troop) => {
      if (troop.hitFlash) troop.hitFlash = Math.max(0, troop.hitFlash - delta * 5);
      if (troop.recoil) troop.recoil += (0 - troop.recoil) * Math.min(1, delta * 10);
      if (troop.knockback) {
        const push = troop.knockback;
        troop.recoil = clamp((troop.recoil || 0) + push * (troop.team === "RED" ? -1 : 1), -46, 46);
        troop.knockback = 0;
      }
    });
  }

  function updateHype() {
    const total = state.territoryRed + state.territoryBlue || 1;
    ["RED", "BLUE"].forEach((team) => {
      const ratio = (team === "RED" ? state.territoryRed : state.territoryBlue) / total;
      const active = state.hype[team] > 0;
      if (!active && ratio >= .78 && state.gameStarted && !state.matchOver) {
        state.hype[team] = 1;
        const x = team === "RED" ? 130 : W - 130;
        damageLabel(x, 500, team, "MEGA PUSH!", "mega");
        addShake(24, .5, 30);
        pushFeed(team, `${teamDisplayName(team)} Faction`, "is DOMINATING the arena!");
      } else if (active && ratio < .66) {
        state.hype[team] = 0;
      }
    });
    audio.setHypeMusicBoost(Boolean(state.hype.RED || state.hype.BLUE));
  }

  function pushFrontline(troop) {
    if (troop.dead || state.matchOver || hasOpposingUnits(troop.team)) return;
    audio.playTroopSound(troop, "attack");
    lunge(troop);
    const applyPush = () => {
      if (troop.dead || state.matchOver || hasOpposingUnits(troop.team)) return;
      const amount = troop.pushPower;
      const x = state.frontline.x;
      playUnitStrikeEffect(troop, x + (troop.team === "RED" ? 20 : -20), troop.y);
      playImpact(x, troop.y, troop.team, troop.isBoss ? 190 : (troop.type === "beast" ? 145 : 112));
      if (troop.isBoss) playBossAttack(troop.team, x, troop.y + 58);
      spawnParticles(x, troop.y, troop.team, troop.isBoss ? 10 : 6);
      addShake(troop.isBoss ? 14 : 6, .22);
      damageLabel(x, troop.y - 55, troop.team, `+${formatTerritoryDelta(amount)}`, troop.isBoss ? "big" : "normal");
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

  function dashLunge(troop, target) {
    // Snap briefly toward a near-but-out-of-reach enemy so idle troops look
    // aggressive instead of standing still while attrition ticks.
    const distance = target.x - troop.x;
    const offset = clamp(distance, -46, 46);
    troop.attackOffset = offset;
    troop.attackOffsetTimer = .34;
  }

  // Scratch buffers reused every frame so target scanning allocates nothing.
  const combatTargetList = [];
  const combatTargetDists = [];
  function collectCombatTarget(enemy, dist, count) {
    // Keep the 5 nearest hits in a stable sorted scratch buffer (zero allocation).
    let k = Math.min(count, 4);
    while (k > 0 && combatTargetDists[k - 1] > dist) {
      combatTargetList[k] = combatTargetList[k - 1];
      combatTargetDists[k] = combatTargetDists[k - 1];
      k -= 1;
    }
    combatTargetList[k] = enemy;
    combatTargetDists[k] = dist;
    return Math.min(count + 1, 5);
  }

  function updateCombat(delta) {
    if (state.matchOver) return;
    const troops = state.troops;
    const total = troops.length;
    for (let i = 0; i < total; i += 1) {
      const troop = troops[i];
      if (state.matchOver || troop.dead || troop.status !== "frontline") continue;
      troop.attackTimer -= delta;
      if (troop.attackTimer > 0) continue;
      troop.attackTimer = troop.attackCooldown;

      let targetCount = 0;
      let nearestOut = null;
      let nearestOutDist = Infinity;
      for (let j = 0; j < total; j += 1) {
        const enemy = troops[j];
        if (enemy.dead || enemy.status !== "frontline" || enemy.team === troop.team) continue;
        const isBossRange = troop.isBoss || enemy.isBoss;
        const dist = Math.abs(enemy.x - troop.x);
        if (dist < (isBossRange ? 150 : 118)) {
          targetCount = collectCombatTarget(enemy, dist, targetCount);
        } else if (dist < (isBossRange ? 260 : 210) && dist < nearestOutDist) {
          nearestOut = enemy;
          nearestOutDist = dist;
        }
      }

      if (targetCount) {
        attackUnit(troop, combatTargetList, targetCount);
      } else if (nearestOut) {
        dashLunge(troop, nearestOut);
        combatTargetList[0] = nearestOut;
        attackUnit(troop, combatTargetList, 1);
      } else if (!hasOpposingUnits(troop.team)) {
        pushFrontline(troop);
      }
    }
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
        triggerJoinFx(team, event.username, userKey, event.avatarUrl);
      } else {
        rememberViewer(event, team, userKey);
      }
      const likeTroopType = ["knight", "mage", "beast", "boss"].includes(uiSettings.likeTroopType)
        ? uiSettings.likeTroopType
        : "knight";
      for (let i = 0; i < troopCount; i += 1) {
        enqueueGiftSpawn(team, likeTroopType, event.username || "TikTok User", `${uiSettings.likesPerTroop} Likes`, event);
      }
      saveGameState();
      return true;
    }
    if (event.type === "comment") {
      const choice = event.comment.trim().toLowerCase().replace(/[\s_-]+/g, "");
      const team = choice === "1" || choice === "join1" ? "RED" : choice === "2" || choice === "join2" ? "BLUE" : null;
      if (!team) return false;
      const userKey = viewerIdentityKey(event);
      const firstJoin = !state.viewerTeams.has(userKey);
      if (firstJoin) {
        state.viewerTeams.set(userKey, team);
      } else if (state.viewerTeams.get(userKey) !== team) {
        state.giftCoinBalances.set(userKey, 0);
        state.viewerTeams.set(userKey, team);
      }
      rememberViewer(event, team, userKey);
      saveGameState();
      const joined = handleGameCommand({ action: "JOIN_TEAM", team, username: event.username });
      if (firstJoin) triggerJoinFx(team, event.username, userKey, event.avatarUrl);
      if (uiSettings.commentTroopEnabled) {
        const now = Date.now();
        const last = state.commentSpawnCooldowns.get(userKey) || 0;
        const cooldownMs = Math.max(1, uiSettings.commentTroopCooldown) * 1000;
        // A viewer joining for the first time always gets a troop; repeat
        // comments must wait out the per-viewer cooldown.
        if (firstJoin || now - last >= cooldownMs) {
          state.commentSpawnCooldowns.set(userKey, now);
          enqueueGiftSpawn(team, "knight", event.username || "TikTok User", "Komentar 1/2", event);
        } else {
          floatingLabel(`⏳ ${Math.ceil((cooldownMs - (now - last)) / 1000)}s`, team === "RED" ? 280 : 800, 900, team, 30);
        }
      }
      return joined;
    }
    if (event.type === "gift") {
      const giftName = String(event.giftName || "Gift");
      const username = String(event.username || "TikTok User");
      audio.playSessionAnimationVideo(username);
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
        triggerJoinFx(team, username, viewerIdentityKey(event), event.avatarUrl);
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
        triggerJoinFx(team, username, userKey, event.avatarUrl);
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

  // Central animation pass. Replaces the old per-object GSAP tweens for
  // labels and combat effects: one loop advances everything with a time field
  // and prunes dead entries in place (no array copies, no onComplete filters).
  function updateMotionAnimations(delta) {
    const troops = state.troops;
    let troopWrite = 0;
    for (let i = 0; i < troops.length; i += 1) {
      const troop = troops[i];
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
      if (!troop.dead) {
        troop.rotation = Math.sin(state.elapsed * 8 + troop.phase) * 7;
        troop.scaleY = 1 + Math.sin(state.elapsed * 11 + troop.phase) * .07;
        troop.bobY = Math.sin(state.elapsed * 4.8 + troop.phase) * (troop.isBoss ? 5 : 3);
        if (troop.isBoss) troop.frontPose = troop.spawnAge < .55 ? 1 : 0;
      }
      if (troop.popScale < 1) troop.popScale = Math.min(1, troop.popScale + delta * 3.2);
      troop.attackOffsetTimer = Math.max(0, troop.attackOffsetTimer - delta);
      if (troop.attackOffsetTimer === 0) troop.attackOffset = 0;
      troop.attackSwingTimer = Math.max(0, troop.attackSwingTimer - delta);
      troop.attackSwing = troop.attackSwingTimer > 0 ? 1 - troop.attackSwingTimer / .32 : 0;
      if (troop.status === "dying") {
        troop.deathTime = (troop.deathTime || 0) + delta;
        const p = clamp(troop.deathTime / .32, 0, 1);
        troop.alpha = 1 - p;
        troop.popScale = 1 - p * .8;
        if (p >= 1) continue; // corpse fully faded: drop it (no array copy).
      }
      troops[troopWrite++] = troop;
    }
    troops.length = troopWrite;

    const labels = state.labels;
    let labelWrite = 0;
    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i];
      label.time += delta;
      const p = clamp(label.time / label.duration, 0, 1);
      if (p >= 1) continue;
      const eased = easeOutQuad(p);
      label.alpha = p < .12 ? p / .12 : 1 - (p - .12) / .88;
      label.scale = .45 + eased * (label.endScale - .45);
      label.x = label.startX + label.driftX * eased;
      label.y = label.startY - label.rise * eased;
      labels[labelWrite++] = label;
    }
    labels.length = labelWrite;

    const effects = state.effects;
    let write = 0;
    for (let i = 0; i < effects.length; i += 1) {
      const effect = effects[i];
      effect.time += delta;
      const duration = effect.duration || .58;
      const p = clamp(effect.time / duration, 0, 1);
      const eased = easeOutQuad(p);
      switch (effect.kind) {
        case "projectile": {
          const t = easeInQuad(p);
          effect.progress = p;
          effect.x = effect.startX + (effect.targetX - effect.startX) * t;
          effect.y = effect.startY + (effect.targetY - effect.startY) * t;
          effect.rotation = p * Math.PI * 2;
          effect.scale = .9 + p * .25;
          if (p >= 1) {
            effect.finished = true;
            if (!state.matchOver) effect.onImpact?.();
          }
          break;
        }
        case "joinShow": {
          if (!effect.landed) {
            effect.progress = easeInQuad(p);
            if (p >= 1) {
              effect.landed = true;
              effect.time = 0;
              effect.duration = .6 + .5 + 1.55; // pop + hold + fade
              spawnConfetti(effect.x, effect.y);
            }
          } else {
            effect.pop = easeOutBack(clamp(effect.time / .6, 0, 1));
            effect.ringSpin = clamp(effect.time / .9, 0, 1);
            effect.life = clamp((effect.time - .5) / 1.55, 0, 1);
            if (effect.time >= effect.duration) effect.finished = true;
          }
          effect.alpha = 1;
          break;
        }
        case "claw": {
          effect.progress = p;
          effect.scale = .7 + p * .42;
          effect.alpha = 1 - p;
          break;
        }
        case "spawnAura": {
          effect.progress = p;
          effect.scale = .35 + p * (effect.endScale - .35);
          effect.alpha = 1 - p;
          break;
        }
        case "shield": {
          effect.scale = .72 + eased * .48;
          effect.alpha = .8 * (1 - p);
          break;
        }
        default: {
          effect.scale = (effect.startScale ?? .25) + eased * ((effect.endScale || 1.35) - (effect.startScale ?? .25));
          effect.alpha = (effect.alpha0 ?? 1) * (1 - p);
        }
      }
      if (effect.kind === "burst") effect.rotation += delta * 4;
      if (!effect.finished && effect.alpha > .02) {
        effects[write++] = effect;
      }
    }
    effects.length = write;
  }

  function saveGameState() {
    if (settingsOnlyMode) return;
    const snapshot = {
      version: 1,
      gameStarted: state.gameStarted,
      animationVideoPlays: state.animationVideoPlays,
      animationVideoPlayedUsers: [...state.animationVideoPlayedUsers],
      territoryRed: state.territoryRed,
      territoryBlue: state.territoryBlue,
      scoreRed: state.scoreRed,
      scoreBlue: state.scoreBlue,
      troopHpCapacity: state.troopHpCapacity,
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
      commentSpawnCooldowns: Object.fromEntries(state.commentSpawnCooldowns),
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
    state.animationVideoPlays = Math.max(0, Math.floor(readNumber(saved.animationVideoPlays, saved.animationVideoPlayed === true ? 1 : 0)));
    state.animationVideoPlayedUsers = new Set(Array.isArray(saved.animationVideoPlayedUsers)
      ? saved.animationVideoPlayedUsers.map((value) => String(value || "").toLowerCase()).filter(Boolean)
      : []);
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
        team: profile.team,
        joinedAt: Number.isFinite(Number(profile.joinedAt)) ? Number(profile.joinedAt) : undefined
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
    state.commentSpawnCooldowns = new Map(Object.entries(saved.commentSpawnCooldowns || {})
      .filter(([, time]) => Number.isFinite(Number(time)) && Number(time) > 0)
      .map(([key, time]) => [String(key), Number(time)]));
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
        attackCooldown: isBoss ? BOSS_ATTACK_COOLDOWN : TROOP_ATTACK_COOLDOWN,
        attackTimer: Math.max(0, readNumber(item.attackTimer, 0)),
        attackOffsetTimer: 0,
        pushCount: Math.max(0, Math.floor(readNumber(item.pushCount, 0))),
        giftName: String(item.giftName || ""),
        moveSpeed: Math.max(.1, readNumber(item.moveSpeed, (isBoss ? 58 : 108) * speed))
      });
      return troops;
    }, []) : [];
    const troopHpCapacityFromUnits = state.troops.reduce((totals, troop) => {
      totals[troop.team] += troop.maxHp;
      return totals;
    }, { RED: 0, BLUE: 0 });
    state.troopHpCapacity = {
      RED: Math.max(troopHpCapacityFromUnits.RED, Math.max(0, readNumber(saved.troopHpCapacity?.RED, 0))),
      BLUE: Math.max(troopHpCapacityFromUnits.BLUE, Math.max(0, readNumber(saved.troopHpCapacity?.BLUE, 0)))
    };

    if (state.troops.length) {
      state.nextId = Math.max(state.nextId, ...state.troops.map((troop) => troop.id + 1));
    }
    // Unit idle/movement animation is handled centrally in the frame loop.
    if (!state.matchOver) updateTerritoryBar();
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
      if (renderDirty) renderer.render();
      renderDirty = false;
      return;
    }
    // Self-healing loop: if any step throws, the frame chain must still be
    // rescheduled — otherwise the game freezes until a manual refresh.
    try {
      runFrame(now);
    } catch (error) {
      console.error("Faction War: frame error", error);
    } finally {
      if (state.gameStarted && !pendingAnimationFrame && !pendingGameTimer) requestRender();
    }
  }

  function runFrame(now) {
    if (!state.lastTime) state.lastTime = now;
    const rawDelta = Math.min(.05, (now - state.lastTime) / 1000);
    state.lastTime = now;
    // Freeze the simulation briefly on big hits (hit-stop) while keeping the
    // shake and particles alive so the impact frame lingers.
    // Safety cap: never freeze longer than 150ms even if timestamps drift.
    const frozen = hitStopUntil > now && hitStopUntil - now <= 150;
    const delta = frozen ? 0 : rawDelta;
    state.elapsed = (state.elapsed || 0) + rawDelta;
    for (let i = 0; i < state.troops.length; i += 1) state.troops[i].spawnAge += rawDelta;
    // Adaptive quality: heavy crowds lean on cheaper procedural animation.
    state.heavyCombat = state.troops.length >= HEAVY_TROOP_COUNT
      || state.effects.length >= HEAVY_EFFECT_COUNT;
    updateMotionAnimations(delta);
    updateTerritorySmoothing(rawDelta);
    updateUnitVisualState(delta);
    updateShake(rawDelta);
    updateParticles(rawDelta);
    if (frozen) {
      renderer.render();
      renderDirty = false;
      requestRender();
      return;
    }
    updateBattleAttrition(delta);
    updateCombat(delta);
    updateHype();
    if (state.matchOver) {
      state.roundResetTimer -= delta;
      if (state.roundResetTimer <= 0) resetRound();
    }
    state.saveAccumulator += delta;
    if (state.saveAccumulator >= SAVE_INTERVAL) {
      state.saveAccumulator = 0;
      saveGameState();
    }
    if (!audio.sessionAnimationVideoActive) renderer.render();
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

  const openSettingsPanel = setupFactionWarSettingsPanel({
    DEFAULT_SETTINGS, GIFT_UNIT_TYPES, cleanSetting, cleanPositiveCount, cleanSoundVolume,
    uiSettings, settingsOnlyMode, giftCatalog, giftCatalogById, giftCatalogReady, giftCatalogSource,
    teamButtons, teamDisplayName, listenerSessionId, audio, requestRender
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
    void audio.checkRestoredTroopAnimationVideo();
  }
  if (!settingsOnlyMode && pendingGiftSpawns.length && !state.matchOver) processNextGiftSpawn();
  if (state.gameStarted) {
    startAmbientAnimations();
    audio.startBackgroundMusic();
    if (listenerEndpoint) tiktokConnector.connect(listenerEndpoint);
  } else if (!settingsOnlyMode) {
    tiktokConnector.disconnect();
  }
  document.addEventListener("pointerdown", () => {
    if (audio.backgroundMusicNeedsGesture && state.gameStarted) audio.startBackgroundMusic();
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
    void initialLoadingReady.then(openSettingsPanel);
  }
  requestRender();
})();
