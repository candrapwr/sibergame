export function createFactionWarAudio({
  state, uiSettings, settingsOnlyMode, animationVideoOverlay, animationVideoPlayer, requestRender, saveGameState
}) {
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
  let musicFadeTimer = 0;
  let hypeMusicBoost = false;
  function musicVolume() {
    const base = uiSettings.bgMusicVolume / 100;
    return Math.min(1, base * (hypeMusicBoost ? 1.25 : 1));
  }
  function stopMusicFade() {
    if (musicFadeTimer) window.clearInterval(musicFadeTimer);
    musicFadeTimer = 0;
  }
  function fadeBackgroundMusicIn(durationMs = 1000) {
    stopMusicFade();
    if (!backgroundMusic || typeof Audio === "undefined") return;
    if (sessionAnimationVideoActive || !uiSettings.bgMusicEnabled || !state.gameStarted) return;
    backgroundMusic.volume = 0;
    if (backgroundMusic.paused) {
      const playback = backgroundMusic.play();
      playback?.catch(() => { backgroundMusicNeedsGesture = true; });
    }
    const target = musicVolume();
    const startedAt = Date.now();
    musicFadeTimer = window.setInterval(() => {
      if (!backgroundMusic) { stopMusicFade(); return; }
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
      backgroundMusic.volume = target * progress;
      if (progress >= 1) stopMusicFade();
    }, 60);
  }
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
    backgroundMusic.volume = musicVolume();
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
    stopMusicFade();
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
    if (resumeMusic && state.gameStarted && !state.matchOver && uiSettings.bgMusicEnabled) fadeBackgroundMusicIn(1200);
    requestRender();
  }

  function animationVideoLimit() {
    return Math.max(1, Math.min(10, Math.floor(Number(uiSettings.animationVideosPerRound) || 1)));
  }
  function hasAnimationVideoSlot() {
    return state.animationVideoPlays < animationVideoLimit();
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
      || !hasAnimationVideoSlot()
      || state.animationVideoPlayedUsers.has(usernameKey)
      || sessionAnimationVideoLookups.has(lookupKey)) return;

    sessionAnimationVideoLookups.add(lookupKey);
    const checkAndPlay = async () => {
      let playbackGeneration = 0;
      const roundActive = () => state.gameStarted && !state.matchOver;
      try {
        if (!roundActive()) return;
        if (!hasAnimationVideoSlot() || state.animationVideoPlayedUsers.has(usernameKey)) return;
        let videos = [];
        if (knownVideo?.url) {
          videos = [knownVideo];
        } else {
          const listUrl = new URL("/api/games/faction-war/animation-videos", window.location.origin);
          listUrl.searchParams.set("username", username);
          const response = await fetch(listUrl.pathname + listUrl.search, { cache: "no-store" });
          const result = await response.json().catch(() => ({}));
          if (!roundActive()) return;
          if (!response.ok || !Array.isArray(result.videos)) return;
          videos = result.videos.filter((video) => String(video.username || "").toLowerCase() === usernameKey && video.url);
        }
        if (!videos.length) return;
        const matchingVideo = videos[Math.floor(Math.random() * videos.length)];
        if (!matchingVideo?.url) return;
        const videoUrl = new URL(matchingVideo.url, window.location.origin);
        if (videoUrl.origin !== window.location.origin) return;

        // Wait for the overlay to be free so several gifters' videos play one
        // after another instead of replacing each other mid-playback.
        while (sessionAnimationVideoActive) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          if (!roundActive()) return;
        }
        if (!roundActive() || !hasAnimationVideoSlot() || state.animationVideoPlayedUsers.has(usernameKey)) return;

        state.animationVideoPlays += 1;
        state.animationVideoPlayedUsers.add(usernameKey);
        saveGameState();
        playbackGeneration = ++sessionAnimationVideoGeneration;
        // Claim the overlay immediately so queued waiters keep waiting while
        // this playback loads.
        sessionAnimationVideoActive = true;
        stopTroopSounds();
        stopFinishSound();
        stopBackgroundMusic();
        animationVideoPlayer.muted = false;
        animationVideoPlayer.loop = false;
        animationVideoPlayer.src = videoUrl.href;
        animationVideoOverlay.hidden = false;
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
        } else if (!state.animationVideoPlayedUsers.has(usernameKey) && roundActive()) {
          console.warn(`Video animasi untuk @${username} gagal dimuat.`);
        }
      } finally {
        sessionAnimationVideoLookups.delete(lookupKey);
      }
    };
    sessionAnimationVideoLookupQueue = sessionAnimationVideoLookupQueue.then(checkAndPlay, checkAndPlay);
  }

  async function checkRestoredTroopAnimationVideo() {
    if (!state.gameStarted || state.matchOver || !hasAnimationVideoSlot()) return;
    const activeUsernames = [...new Set(state.troops
      .filter((troop) => !troop.dead && troop.status !== "dying")
      .map((troop) => String(troop.username || "").trim().replace(/^@+/, "").toLowerCase())
      .filter((username) => /^[a-z0-9._]{1,50}$/.test(username)))];
    if (!activeUsernames.length) return;
    try {
      const response = await fetch("/api/games/faction-war/animation-videos", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(result.videos) || !state.gameStarted || state.matchOver) return;
      for (const usernameKey of activeUsernames) {
        if (!hasAnimationVideoSlot()) break;
        if (state.animationVideoPlayedUsers.has(usernameKey)) continue;
        const matchingVideos = result.videos.filter((video) => String(video.username || "").toLowerCase() === usernameKey);
        if (!matchingVideos.length) continue;
        playSessionAnimationVideo(matchingVideos[0].username || usernameKey, matchingVideos[Math.floor(Math.random() * matchingVideos.length)]);
      }
    } catch {
      // A later matching gift will retry the username lookup.
    }
  }

  return {
    playTroopSound, playFinishSound, stopTroopSounds, stopFinishSound,
    startBackgroundMusic, stopBackgroundMusic, stopSessionAnimationVideo,
    playSessionAnimationVideo, checkRestoredTroopAnimationVideo,
    applySoundSettings() {
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
    },
    applyBackgroundMusicSettings() {
      if (!uiSettings.bgMusicEnabled) {
        stopBackgroundMusic();
        return;
      }
      if (backgroundMusic) backgroundMusic.volume = musicVolume();
      if (state.gameStarted) startBackgroundMusic();
    },
    setHypeMusicBoost(active) {
      const next = active === true;
      if (next === hypeMusicBoost) return;
      hypeMusicBoost = next;
      if (backgroundMusic && !backgroundMusic.paused && !sessionAnimationVideoActive) {
        backgroundMusic.volume = musicVolume();
      }
    },
    get sessionAnimationVideoActive() { return sessionAnimationVideoActive; },
    get backgroundMusicNeedsGesture() { return backgroundMusicNeedsGesture; }
  };
}
