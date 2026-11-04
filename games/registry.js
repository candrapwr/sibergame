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
  }
];

const list = document.getElementById("game-list");
const count = document.getElementById("game-count");

count.textContent = `${games.length} game`;
list.innerHTML = games.map((game) => {
  const coverStyle = game.cover
    ? `; --game-red-base: url('${game.cover.redBase}'); --game-blue-base: url('${game.cover.blueBase}')`
    : "";
  const coverUnits = game.cover?.redTroop && game.cover?.blueTroop
    ? `<img class="game-card-cover-unit red" src="${game.cover.redTroop}" alt="" /><span class="game-card-cover-vs">VS</span><img class="game-card-cover-unit blue" src="${game.cover.blueTroop}" alt="" />`
    : `<span class="game-card-cover-fallback">${game.icon}</span>`;
  return `
  <article class="game-card" style="--accent-glow: ${game.accent}${coverStyle}">
    <div class="game-card-cover" aria-hidden="true">
      <span class="game-card-cover-tag">LIVE BATTLE</span>
      ${coverUnits}
    </div>
    <div class="game-card-body">
      <div class="game-card-top">
        <span class="game-icon" aria-hidden="true">${game.icon}</span>
        <span class="game-status">${game.status}</span>
      </div>
      <h3>${game.title}</h3>
      <p>${game.description}</p>
      <a href="${game.entry}" data-game-window="${game.id}" aria-label="Buka ${game.title} di jendela baru" title="Buka ${game.title} di jendela game">Buka game <span aria-hidden="true">↗</span></a>
    </div>
  </article>
`;
}).join("") || '<p class="empty-state">Belum ada game di library.</p>';

list.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-game-window]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  event.preventDefault();
  const width = window.screen.availWidth || 1440;
  const height = window.screen.availHeight || 900;
  const features = [
    "popup=yes", "toolbar=no", "location=no", "menubar=no", "status=no", "scrollbars=no", "resizable=yes",
    `width=${width}`, `height=${height}`, "left=0", "top=0"
  ].join(",");
  const gameWindow = window.open(link.href, `game-window-${link.dataset.gameWindow}`, features);
  if (gameWindow) gameWindow.focus();
  else window.location.assign(link.href);
});
