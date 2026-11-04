export function setupFactionWarSettingsPanel({
  DEFAULT_SETTINGS, GIFT_UNIT_TYPES, cleanSetting, cleanPositiveCount, cleanSoundVolume,
  uiSettings, settingsOnlyMode, giftCatalog, giftCatalogById, giftCatalogReady, giftCatalogSource,
  teamButtons, teamDisplayName, audio, requestRender
}) {
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
      audio.applySoundSettings();
      audio.applyBackgroundMusicSettings();
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

  return openSettingsPanel;
}
