import { addListenerSession, getListenerSessionId } from "../shared/tiktok/listener-session.js";

const games = [
  {
    id: "faction-war",
    title: "Faction War",
    description: "Game strategi live dua faksi. Penonton memilih tim lewat komentar, gift, atau tap like untuk memanggil Knight, Mage, Beast, dan Boss. Pasukan bertarung merebut wilayah sampai salah satu tim menang.",
    icon: "⚔️",
    status: "Siap dimainkan",
    entry: "games/faction-war/index.html",
    accent: "rgba(255, 90, 82, .22)",
    cover: {
      redBase: "games/faction-war/assets/images/base_red_volcano.png",
      blueBase: "games/faction-war/assets/images/base_blue_ice.png",
      redTroop: "games/faction-war/assets/images/troop_red_knight.png",
      blueTroop: "games/faction-war/assets/images/troop_blue_knight.png"
    }
  },
  {
    id: "drag-race",
    title: "Drag Race",
    description: "Balapan antar-penonton. Kirim komentar untuk bergabung jadi pelari, gift untuk boost kecepatan, dan like untuk speed burst. Yang pertama melewati garis finis jadi juara — podium 3 besar.",
    icon: "🏃",
    status: "Siap dimainkan",
    entry: "games/drag-race/index.html",
    accent: "rgba(255, 160, 60, .22)",
    cover: {
      type: "image",
      src: "games/drag-race/assets/ui/dashboard-cover.png"
    }
  }
];

const list = document.getElementById("game-list");
const count = document.getElementById("game-count");

count.textContent = `${games.length} game`;
list.innerHTML = games.map((game) => {
  const coverStyle = game.cover?.type === "image"
    ? `; --game-cover-img: url('${game.cover.src}')`
    : game.cover?.type === "race"
      ? `; --race-skyline: url('${game.cover.skyline}'); --race-ground: url('${game.cover.ground}')`
      : game.cover
        ? `; --game-red-base: url('${game.cover.redBase}'); --game-blue-base: url('${game.cover.blueBase}')`
        : "";
  let coverUnits, coverTag = "LIVE BATTLE";
  if (game.cover?.type === "image") {
    coverTag = "LIVE RACE";
    coverUnits = `<img class="game-card-cover-image" src="${game.cover.src}" alt="" />`;
  } else if (game.cover?.type === "race") {
    coverTag = "LIVE RACE";
    const depths = [
      { cls: "far", src: game.cover.runners[0] },
      { cls: "mid", src: game.cover.runners[1] },
      { cls: "near", src: game.cover.runners[2] }
    ];
    coverUnits = `<span class="speed-lines"></span>${depths.map((d) => `<img class="game-card-cover-runner ${d.cls}" src="${d.src}" alt="" />`).join("")}
      <img class="game-card-cover-gate" src="games/drag-race/assets/track/finish-checkered-gate.png" alt="" />`;
  } else if (game.cover?.redTroop && game.cover?.blueTroop) {
    coverUnits = `<img class="game-card-cover-unit red" src="${game.cover.redTroop}" alt="" /><span class="game-card-cover-vs">VS</span><img class="game-card-cover-unit blue" src="${game.cover.blueTroop}" alt="" />`;
  } else {
    coverUnits = `<span class="game-card-cover-fallback">${game.icon}</span>`;
  }
  return `
  <article class="game-card${game.cover?.type === "race" ? " game-card--race" : ""}" style="--accent-glow: ${game.accent}${coverStyle}">
    <div class="game-card-cover" aria-hidden="true">
      <span class="game-card-cover-tag">${coverTag}</span>
      ${coverUnits}
    </div>
    <div class="game-card-body">
      <div class="game-card-top">
        <span class="game-icon" aria-hidden="true">${game.icon}</span>
        <span class="game-status">${game.status}</span>
      </div>
      <h3>${game.title}</h3>
      <p>${game.description}</p>
      <a href="${game.entry}" data-game-window="${game.id}" aria-label="Buka ${game.title}" title="Buka ${game.title}">Buka game <span aria-hidden="true">→</span></a>
    </div>
  </article>
`;
}).join("") || '<p class="empty-state">Belum ada game di library.</p>';

list.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-game-window]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  event.preventDefault();
  // Buka di TAB/JENDELA YANG SAMA (dulu popup window.open fullscreen) — sesuai preferensi user.
  const target = addListenerSession(link.href, getListenerSessionId());
  window.location.assign(target.href);
});
