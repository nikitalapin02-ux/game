/* ==========================================================================
   Наш Путь — движок дороги (side-scroller)
   ========================================================================== */

const SPACING = 380;          // расстояние между обычными точками
const PORTAL_SPACING = 620;   // расстояние вокруг порталов (простор для ворот)
const GROUND_Y_FRAC = 0.72;   // относительная высота земли на экране
const SPRITE_FRAME = 64;      // размер кадра в спрайт-листе 256x256 (4x2)
const STEP_LEN = 20;          // "шаг" в мировых px на один кадр анимации (плавность по расстоянию)
const CHAR_H_ROAD = SPRITE_FRAME * 1.15;
const CHAR_H_PORTAL = SPRITE_FRAME * 1.35;

const SEASONS = {
  spring: { sky: ["#eaf6ff", "#fff4e8"], ground: "#8fd17a", groundEdge: "#6fae5c" },
  summer: { sky: ["#bfe8ff", "#fff6d8"], ground: "#79c15a", groundEdge: "#5a9d3e" },
  autumn: { sky: ["#ffe3c2", "#ffd0a8"], ground: "#c98a4b", groundEdge: "#a56a34" },
  winter: { sky: ["#eaf1ff", "#ffffff"], ground: "#eef4fb", groundEdge: "#c9dcf0" },
};
function seasonOf(month) {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}
function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgbToCss([r, g, b]) { return `rgb(${r|0},${g|0},${b|0})`; }
function lerpColor(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return rgbToCss([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
}
function hash(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

// ---- предвычисление позиций точек на дороге ----
let worldX = 220;
TIMELINE.forEach((p, i) => {
  p.worldX = worldX;
  worldX += p.portal ? PORTAL_SPACING : SPACING;
});
const WORLD_END = worldX + 260;

// ---- загрузка изображений ----
function loadImage(src) {
  const img = new Image();
  img.src = (typeof window !== "undefined" && window.ASSET_URIS && window.ASSET_URIS[src]) || src;
  return img;
}
const CHAR_SPRITES = {
  nikita: loadImage("assets/characters/nikita_walk_sheet.png"),
  ksyusha: loadImage("assets/characters/ksyusha_walk_sheet.png"),
  max: loadImage("assets/characters/max_walk_sheet.png"),
  shemrok: loadImage("assets/characters/shemrok_walk_sheet.png"),
};

// ---- декор: отдельные, точно вырезанные объекты (см. tools/slice_decor.py) ----
const DECOR_IMAGES = {}; // "slug/idx" -> Image
function decorImage(slug, idx) {
  const key = slug + "/" + idx;
  if (!DECOR_IMAGES[key]) DECOR_IMAGES[key] = loadImage(`assets/decor/${slug}/${idx}.png`);
  return DECOR_IMAGES[key];
}
// детерминированный выбор N объектов пака по seed, с категорией (big/med/small по рангу площади)
function pickDecorEntries(slug, seed, count) {
  const list = typeof DECOR_MANIFEST !== "undefined" ? DECOR_MANIFEST[slug] : null;
  if (!list || !list.length) return [];
  const picks = [];
  for (let i = 0; i < count; i++) {
    const r = hash(seed * 13.37 + i * 7.77);
    const idx = Math.floor(r * list.length) % list.length;
    const entry = list[idx];
    const category = idx <= 1 ? "big" : idx <= 4 ? "medium" : "small";
    picks.push({ entry, idx, category, img: decorImage(slug, list.indexOf(entry)) });
  }
  return picks;
}
const CATEGORY_HEIGHT = {
  big: [2.2, 3.0],
  medium: [1.05, 1.55],
  small: [0.4, 0.72],
};
function drawDecorObject(ctx, pick, x, groundBottomY, refCharH, seed) {
  const img = pick.img;
  if (!img.complete || !img.naturalWidth) return;
  const [lo, hi] = CATEGORY_HEIGHT[pick.category];
  const hMul = lo + hash(seed + pick.idx * 3.1) * (hi - lo);
  const drawH = refCharH * hMul;
  const aspect = (pick.entry.w || img.naturalWidth) / (pick.entry.h || img.naturalHeight);
  const drawW = drawH * aspect;
  ctx.drawImage(img, x - drawW / 2, groundBottomY - drawH, drawW, drawH);
}

// ---- фоны-силуэты по биомам (portal.config.biome), общие для дороги и порталов ----
function drawBiomeSilhouette(ctx, W, H, biome, baseY, colorTint, camShift) {
  camShift = camShift || 0;
  ctx.save();
  ctx.fillStyle = colorTint;
  ctx.globalAlpha = 0.45;
  if (biome === "snow-mountains" || biome === "steppe-mountains" || biome === "castle-hills") {
    ctx.beginPath();
    ctx.moveTo(-50 + camShift, baseY);
    const peaks = 6;
    for (let i = 0; i <= peaks; i++) {
      const x = (-50 + camShift) + (i / peaks) * (W + 100);
      const peakY = baseY - (i % 2 === 0 ? 120 : 70) - hash(i + biome.length) * 40;
      ctx.lineTo(x, peakY);
    }
    ctx.lineTo(W + 50, baseY);
    ctx.closePath();
    ctx.fill();
  } else if (biome === "tropical-beach" || biome === "jungle-lagoon" || biome === "desert-coast") {
    const grad = ctx.createRadialGradient(W * 0.5, baseY - 40, 10, W * 0.5, baseY - 40, W * 0.5);
    grad.addColorStop(0, "rgba(255,220,150,0.55)");
    grad.addColorStop(1, "rgba(255,220,150,0)");
    ctx.fillStyle = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(W * 0.5, baseY - 20, W * 0.42, 0, Math.PI * 2); ctx.fill();
  } else if (biome === "canal-city") {
    ctx.globalAlpha = 0.4;
    for (let i = -1; i < 9; i++) {
      const x = (-40 + camShift * 0.6) + i * (W / 7);
      const bh = 60 + (i % 3) * 34;
      ctx.fillRect(x, baseY - bh, W / 9, bh);
    }
  } else if (biome === "canyon-sea") {
    ctx.globalAlpha = 0.38;
    ctx.beginPath();
    ctx.moveTo(-50, baseY);
    ctx.lineTo(-50, baseY - 90);
    for (let i = 0; i < 5; i++) ctx.lineTo(-50 + (i + 1) * (W / 4), baseY - 60 - (i % 2) * 50);
    ctx.lineTo(W + 50, baseY);
    ctx.closePath();
    ctx.fill();
  } else {
    // forest-river / умолчание: мягкая линия леса
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.moveTo(-50, baseY);
    for (let i = 0; i <= 10; i++) {
      const x = -50 + i * (W + 100) / 10;
      ctx.lineTo(x, baseY - 40 - hash(i * 3.3) * 30);
    }
    ctx.lineTo(W + 50, baseY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function biomeOfTimelinePoint(pt) {
  if (pt.portal) return PORTALS[pt.portal].biome;
  // ищем ближайший портал по индексу в TIMELINE для лёгкого тематического намёка
  const idx = TIMELINE.indexOf(pt);
  for (let d = 1; d < 8; d++) {
    const a = TIMELINE[idx - d], b = TIMELINE[idx + d];
    if (a && a.portal) return PORTALS[a.portal].biome;
    if (b && b.portal) return PORTALS[b.portal].biome;
  }
  return "forest-river";
}

class RoadEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.camX = 0;
    this.keys = {};
    this.time = 0;
    this.player = { worldX: 40, distance: 0, facing: 1, running: false, jumpT: 0 };
    this.followers = [
      { sprite: "ksyusha", offset: 78, distance: 0, bobPhase: 1.1 },
      { sprite: "max", offset: 145, distance: 0, bobPhase: 2.4 },
      { sprite: "shemrok", offset: 195, distance: 0, bobPhase: 3.7 },
    ];
    this.activePoint = null;
    this.dust = [];
    this.sparkles = Array.from({ length: 26 }, (_, i) => ({
      x: Math.random(), y: Math.random() * 0.6, phase: Math.random() * 10, speed: 0.4 + Math.random() * 0.5,
    }));
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  update(dt) {
    this.time += dt;
    const k = this.keys;
    const left = k["ArrowLeft"] || k["KeyA"];
    const right = k["ArrowRight"] || k["KeyD"];
    const run = k["ShiftLeft"] || k["ShiftRight"];
    const p = this.player;
    p.running = !!run && (left || right);
    const speed = (run ? 300 : 168) * dt; // бодрая ходьба, быстрый динамичный бег
    let dx = 0;
    if (left) dx -= speed;
    if (right) dx += speed;
    if (dx !== 0) {
      p.worldX = Math.max(20, Math.min(WORLD_END, p.worldX + dx));
      p.distance += Math.abs(dx);
      p.facing = dx > 0 ? 1 : -1;
      if (p.running && this.time % 0.05 < dt) {
        this.dust.push({ x: p.worldX - p.facing * 18, t: this.time, side: Math.random() < 0.5 });
        if (this.dust.length > 30) this.dust.shift();
      }
    }
    if (k["Space"] && p.jumpT <= 0) p.jumpT = 1;
    if (p.jumpT > 0) { p.jumpT -= dt * 2.6; if (p.jumpT < 0) p.jumpT = 0; }

    // ведомые персонажи плавно следуют по дистанции (лаг = offset)
    this.followers.forEach(f => {
      const targetX = p.worldX - f.offset * p.facing;
      f.worldX = f.worldX === undefined ? targetX : lerp(f.worldX, targetX, Math.min(1, dt * 6));
      f.distance += Math.abs(targetX - (f._prevX ?? targetX));
      f._prevX = targetX;
      f.facing = p.facing;
    });

    // камера — быстрая, отзывчивая
    const targetCam = p.worldX - this.canvas.width * 0.36;
    this.camX = lerp(this.camX, Math.max(0, targetCam), Math.min(1, dt * 8));

    // ближайшая точка для подсказки "E"
    let nearest = null, nearestD = 9999;
    TIMELINE.forEach(pt => {
      const d = Math.abs(pt.worldX - p.worldX);
      if (d < nearestD) { nearestD = d; nearest = pt; }
    });
    this.activePoint = nearestD < (nearest && nearest.portal ? 70 : 55) ? nearest : null;
  }

  seasonColorsAt(wx) {
    let prev = TIMELINE[0], next = TIMELINE[TIMELINE.length - 1];
    for (let i = 0; i < TIMELINE.length - 1; i++) {
      if (TIMELINE[i].worldX <= wx && TIMELINE[i + 1].worldX >= wx) {
        prev = TIMELINE[i]; next = TIMELINE[i + 1]; break;
      }
    }
    const span = Math.max(1, next.worldX - prev.worldX);
    const t = Math.max(0, Math.min(1, (wx - prev.worldX) / span));
    const s1 = SEASONS[seasonOf(prev.month)], s2 = SEASONS[seasonOf(next.month)];
    return {
      skyTop: lerpColor(s1.sky[0], s2.sky[0], t),
      skyBottom: lerpColor(s1.sky[1], s2.sky[1], t),
      ground: lerpColor(s1.ground, s2.ground, t),
      groundEdge: lerpColor(s1.groundEdge, s2.groundEdge, t),
    };
  }

  drawSprite(img, frameIndexTotal, worldX, groundY, facing, scale, bobPhase) {
    if (!img.complete || !img.naturalWidth) return;
    const frame = frameIndexTotal % 8;
    const col = frame % 4, row = Math.floor(frame / 4);
    const ctx = this.ctx;
    const sx = col * SPRITE_FRAME, sy = row * SPRITE_FRAME;
    const drawW = SPRITE_FRAME * scale, drawH = SPRITE_FRAME * scale;
    const screenX = worldX - this.camX;
    const bob = Math.sin(this.time * 6 + bobPhase) * 1.6;
    ctx.save();
    ctx.translate(screenX, groundY - drawH / 2 + bob);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, SPRITE_FRAME, SPRITE_FRAME, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  drawDecorForPoint(pt, groundY) {
    if (!pt.pack) return;
    const seed = pt.id * 91.7;
    const picks = pickDecorEntries(pt.pack, seed, 4);
    picks.forEach((pick, i) => {
      const spread = [-190, -70, 90, 210][i] || (i - 1.5) * 130;
      const x = pt.worldX - this.camX + spread + (hash(seed + i) - 0.5) * 40;
      drawDecorObject(this.ctx, pick, x, groundY + 8, CHAR_H_ROAD, seed + i);
    });
  }

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const groundY = H * GROUND_Y_FRAC;
    const seasonC = this.seasonColorsAt(this.player.worldX);
    const nearPt = this.activePoint || TIMELINE.reduce((a, b) =>
      Math.abs(b.worldX - this.player.worldX) < Math.abs(a.worldX - this.player.worldX) ? b : a, TIMELINE[0]);
    const biome = biomeOfTimelinePoint(nearPt);

    // небо
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, seasonC.skyTop);
    skyGrad.addColorStop(1, seasonC.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, groundY);

    // силуэт биома ближайшей главы/портала
    drawBiomeSilhouette(ctx, W, groundY - 4, biome, groundY - 4, seasonC.groundEdge, -this.camX * 0.15);

    // мягкие искры/светлячки для уютного, "радующего" ощущения
    ctx.save();
    this.sparkles.forEach(s => {
      const alpha = 0.25 + 0.25 * Math.sin(this.time * s.speed + s.phase);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = "#fff6d8";
      const sx = ((s.x * W - this.camX * 0.05) % W + W) % W;
      ctx.beginPath(); ctx.arc(sx, s.y * groundY, 2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();

    // параллакс-холмы
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = seasonC.ground;
    for (let i = -1; i < 8; i++) {
      const bx = ((i * 340) - this.camX * 0.3) % (W + 400) - 200;
      ctx.beginPath();
      ctx.ellipse(bx, groundY - 10, 220, 90, 0, Math.PI, 0);
      ctx.fill();
    }
    ctx.restore();

    // земля
    ctx.fillStyle = seasonC.ground;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = seasonC.groundEdge;
    ctx.fillRect(0, groundY, W, 6);

    // тропа
    ctx.save();
    ctx.strokeStyle = "rgba(230,214,180,0.55)";
    ctx.lineWidth = 46;
    ctx.beginPath();
    ctx.moveTo(-this.camX, groundY + 30);
    ctx.lineTo(WORLD_END - this.camX, groundY + 30);
    ctx.stroke();
    ctx.restore();

    // декор + точки маршрута
    TIMELINE.forEach(pt => {
      const screenX = pt.worldX - this.camX;
      if (screenX < -260 || screenX > W + 260) return;
      this.drawDecorForPoint(pt, groundY);
      this.drawMarker(pt, screenX, groundY);
    });

    // финальные ворота в конце дороги
    this.drawFinaleGate(WORLD_END - this.camX, groundY);

    // пыль от бега
    ctx.save();
    this.dust.forEach(d => {
      const age = this.time - d.t;
      ctx.globalAlpha = Math.max(0, 0.4 - age * 0.6);
      ctx.fillStyle = "#fff";
      const dx = d.worldX ?? d.x;
      ctx.beginPath();
      ctx.ellipse(dx - this.camX, groundY + 26 + (d.side ? 3 : -3), 5 + age * 14, 3 + age * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // персонажи (ведомые сзади, игрок сверху)
    const order = [...this.followers].sort((a, b) => a.worldX - b.worldX);
    order.forEach(f => {
      const frameIdx = Math.floor(f.distance / STEP_LEN);
      const scale = f.sprite === "shemrok" ? 0.55 : f.sprite === "max" ? 0.68 : 1.15;
      this.drawSprite(CHAR_SPRITES[f.sprite], frameIdx, f.worldX, groundY, f.facing, scale, f.bobPhase);
    });
    const pFrame = Math.floor(this.player.distance / STEP_LEN);
    const runTilt = this.player.running ? this.player.facing * 3 : 0;
    ctx.save();
    if (runTilt) {
      const sx = this.player.worldX - this.camX;
      ctx.translate(sx, groundY);
      ctx.rotate(runTilt * Math.PI / 180);
      ctx.translate(-sx, -groundY);
    }
    this.drawSprite(CHAR_SPRITES.nikita, pFrame, this.player.worldX, groundY - this.player.jumpT * 26, this.player.facing, 1.2, 0);
    ctx.restore();
  }

  drawMarker(pt, screenX, groundY) {
    const ctx = this.ctx;
    const isPortal = !!pt.portal;
    ctx.save();
    ctx.translate(screenX, groundY);
    if (isPortal) {
      const glow = 0.5 + Math.sin(this.time * 2 + pt.id) * 0.15;
      const grad = ctx.createRadialGradient(0, -70, 4, 0, -70, 90);
      grad.addColorStop(0, `rgba(255,200,140,${0.55 * glow})`);
      grad.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, -70, 90, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = "#ffd8ad";
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, -70, 34, 62, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath(); ctx.ellipse(0, -70, 34, 62, 0, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#fff6ea";
      ctx.font = "700 13px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(pt.title.split(",")[0], 0, -150);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(0, -16, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 0); ctx.stroke();
    }
    ctx.restore();
  }

  drawFinaleGate(screenX, groundY) {
    if (screenX < -300 || screenX > this.canvas.width + 300) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(screenX, groundY);
    const glow = 0.6 + Math.sin(this.time * 1.6) * 0.2;
    const grad = ctx.createRadialGradient(0, -90, 6, 0, -90, 130);
    grad.addColorStop(0, `rgba(255,150,190,${0.6 * glow})`);
    grad.addColorStop(1, "rgba(255,150,190,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, -90, 130, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffd0e0";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(0, -90, 46, 84, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "700 14px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("♥", 0, -190);
    ctx.restore();
  }
}
