const MINIMUM_LOADING_TIME_MS = 1800;
const EXIT_TRANSITION_MS = 520;

export function createFactionWarLoadingScreen() {
  const root = document.getElementById("game-asset-loader");
  const message = document.getElementById("asset-loader-message");
  const count = document.getElementById("asset-loader-count");
  const percent = document.getElementById("asset-loader-percent");
  const progress = document.getElementById("asset-loader-progress");
  const bar = document.getElementById("asset-loader-bar");
  const stage = document.getElementById("asset-loader-stage");
  const startedAt = Number(window.factionWarLoaderStartedAt) || performance.now();

  function update({ loaded = 0, total = 0, failed = 0 } = {}) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeLoaded = Math.max(0, Math.min(safeTotal, Number(loaded) || 0));
    const safeFailed = Math.max(0, Number(failed) || 0);
    const value = safeTotal ? Math.round(safeLoaded / safeTotal * 100) : 100;

    if (count) count.textContent = `${safeLoaded} / ${safeTotal} ASSET`;
    if (percent) percent.textContent = String(value);
    if (bar) bar.style.width = `${value}%`;
    if (progress) progress.setAttribute("aria-valuenow", String(value));

    if (stage) {
      stage.textContent = safeLoaded === safeTotal && safeTotal
        ? "MERAPIKAN FORMASI"
        : value < 35
          ? "MEMUAT MEDAN PERANG"
          : value < 75
            ? "MEMANGGIL PASUKAN"
            : "MENYIAPKAN EFEK VISUAL";
    }
    if (message) {
      message.textContent = safeFailed
        ? `Memuat asset arena… ${safeFailed} asset akan memakai tampilan cadangan.`
        : value < 100
          ? "Memuat kastil, troop, dan efek visual…"
          : "Semua asset utama sudah siap. Membuka arena…";
    }
  }

  async function finish(assetsReady) {
    let result = { total: 0, failed: 0 };
    try {
      result = await assetsReady;
    } catch {
      result = { total: 0, failed: 1 };
    }

    const fontsReady = document.fonts?.ready;
    if (fontsReady) await fontsReady.catch(() => {});

    const remaining = MINIMUM_LOADING_TIME_MS - (performance.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));

    if (!root) return result;
    update({ loaded: result.total, total: result.total, failed: result.failed });
    if (message) {
      message.textContent = result.failed
        ? `Arena siap dengan ${result.failed} asset cadangan.`
        : "Medan perang siap. Pasukan telah berkumpul.";
    }
    if (stage) stage.textContent = "ARENA SIAP";
    root.setAttribute("aria-busy", "false");
    root.classList.add("is-leaving");
    await new Promise((resolve) => window.setTimeout(resolve, EXIT_TRANSITION_MS));
    root.hidden = true;
    return result;
  }

  return { update, finish };
}
