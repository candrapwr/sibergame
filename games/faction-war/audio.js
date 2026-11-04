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
      if (backgroundMusic) backgroundMusic.volume = uiSettings.bgMusicVolume / 100;
      if (state.gameStarted) startBackgroundMusic();
    },
    get sessionAnimationVideoActive() { return sessionAnimationVideoActive; },
    get backgroundMusicNeedsGesture() { return backgroundMusicNeedsGesture; }
  };
}
