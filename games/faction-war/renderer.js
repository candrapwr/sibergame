export function createFactionWarRenderer({
  canvas, ctx, W, H, MID, state, TEAM, uiSettings, giftCatalog, giftCatalogById, giftCatalogReady,
  GIFT_UNIT_TYPES, TROOP_NAMES, BATTLE_TOP, BATTLE_BOTTOM, TERRITORY_MAX_HP, TERRITORY_BAR_X, TERRITORY_BAR_WIDTH,
  AVATAR_RADIUS, AVATAR_HEAD_GAP, TROOP_WIDTH, TROOP_HEIGHT, BOSS_WIDTH, BOSS_HEIGHT,
  clamp, teamDisplayName, safeAvatarUrl, safeGiftImageUrl, fitTextSize, territoryPercent, formatTerritoryDelta, requestRender
}) {
  let layoutScaleX = 1;
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

  return { render, resize: resizeGameCanvas };
}
