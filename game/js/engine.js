/* ==========================================================================
   Наш Путь — движок дороги (side-scroller)
   ========================================================================== */

const SPACING = 380;          // расстояние между обычными точками
const PORTAL_SPACING = 620;   // расстояние вокруг порталов (простор для ворот)
const GROUND_Y_FRAC = 0.72;   // относительная высота земли на экране
const SPRITE_FRAME = 64;      // размер кадра в спрайт-листе 256x256 (4x2)
const STEP_LEN = 16;          // "шаг" в мировых px на один кадр анимации (плавность по расстоянию)

const SEASONS = {
  spring: { sky: ["#dff3ff", "#eafff0"], ground: "#8fd17a", groundEdge: "#6fae5c" },
  summer: { sky: ["#bfe8ff", "#fff6d8"], ground: "#79c15a", groundEdge: "#5a9d3e" },
  autumn: { sky: ["#ffe3c2", "#ffd0a8"], ground: "#c98a4b", groundEdge: "#a56a34" },
  winter: { sky: ["#e8f1ff", "#ffffff"], ground: "#eef4fb", groundEdge: "#c9dcf0" },
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
  img.src = src;
  return img;
}
const CHAR_SPRITES = {
  nikita: loadImage("assets/characters/nikita_walk_sheet.png"),
  ksyusha: loadImage("assets/characters/ksyusha_walk_sheet.png"),
  max: loadImage("assets/characters/max_walk_sheet.png"),
  shemrok: loadImage("assets/characters/shemrok_walk_sheet.png"),
};
const LOCATION_PACKS = {};
(function preloadPacks() {
  const slugs = new Set();
  TIMELINE.forEach(p => p.pack && slugs.add(p.pack));
  Object.values(PORTALS).forEach(p => p.pack && slugs.add(p.pack));
  slugs.forEach(s => { LOCATION_PACKS[s] = loadImage(`assets/locations/${s}.png`); });
})();

// генерические зоны нарезки атласа декора 1024x1024 (см. docs/scenario.md пояснение в data.js)
const DECOR_SLOTS = [
  { x: 0, y: 0, w: 340, h: 340 },
  { x: 340, y: 0, w: 340, h: 340 },
  { x: 680, y: 0, w: 344, h: 340 },
  { x: 0, y: 340, w: 340, h: 170 },
  { x: 340, y: 340, w: 340, h: 170 },
  { x: 0, y: 510, w: 340, h: 220 },
  { x: 340, y: 510, w: 340, h: 220 },
  { x: 0, y: 730, w: 340, h: 170 },
  { x: 340, y: 730, w: 340, h: 170 },
];

class RoadEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.camX = 0;
    this.keys = {};
    this.time = 0;
    this.player = { worldX: 40, distance: 0, facing: 1, running: false, jumpT: 0 };
    this.followers = [
      { sprite: "ksyusha", offset: 70, distance: 0, bobPhase: 1.1 },
      { sprite: "max", offset: 130, distance: 0, bobPhase: 2.4 },
      { sprite: "shemrok", offset: 175, distance: 0, bobPhase: 3.7 },
    ];
    this.activePoint = null;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this._decorCache = new Map();
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
    const speed = (run ? 108 : 58) * dt; // очень медленная база ходьбы, бег заметно быстрее
    let dx = 0;
    if (left) dx -= speed;
    if (right) dx += speed;
    if (dx !== 0) {
      p.worldX = Math.max(20, Math.min(WORLD_END, p.worldX + dx));
      p.distance += Math.abs(dx);
      p.facing = dx > 0 ? 1 : -1;
    }
    if (k["Space"] && p.jumpT <= 0) p.jumpT = 1;
    if (p.jumpT > 0) { p.jumpT -= dt * 2.2; if (p.jumpT < 0) p.jumpT = 0; }

    // ведомые персонажи плавно следуют по дистанции (лаг = offset)
    this.followers.forEach(f => {
      const targetX = p.worldX - f.offset;
      f.worldX = f.worldX === undefined ? targetX : lerp(f.worldX, targetX, Math.min(1, dt * 4));
      f.distance += Math.abs(targetX - (f._prevX ?? targetX));
      f._prevX = targetX;
      f.facing = p.facing;
    });

    // камера
    const targetCam = p.worldX - this.canvas.width * 0.36;
    this.camX = lerp(this.camX, Math.max(0, targetCam), Math.min(1, dt * 5));

    // ближайшая точка для подсказки "E"
    let nearest = null, nearestD = 9999;
    TIMELINE.forEach(pt => {
      const d = Math.abs(pt.worldX - p.worldX);
      if (d < nearestD) { nearestD = d; nearest = pt; }
    });
    this.activePoint = nearestD < (nearest && nearest.portal ? 70 : 55) ? nearest : null;
  }

  seasonColorsAt(wx) {
    // находим соседние точки для плавной интерполяции сезона
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
    const pack = pt.pack && LOCATION_PACKS[pt.pack];
    if (!pack || !pack.complete || !pack.naturalWidth) return;
    const ctx = this.ctx;
    // детерминированный псевдослучайный выбор 3 слотов декора по id точки
    const seed = pt.id * 2654435761 % 2147483647;
    const rand = (n) => ((seed * (n + 7)) % 97) / 97;
    const slotsPicked = [0, 5, 3].map((base, i) => DECOR_SLOTS[(base + pt.id + i) % DECOR_SLOTS.length]);
    slotsPicked.forEach((slot, i) => {
      const dx = (rand(i) - 0.5) * 260;
      const screenX = pt.worldX - this.camX + dx - (i === 1 ? 90 : 0);
      const scale = 0.32 + rand(i + 3) * 0.12;
      const w = slot.w * scale, h = slot.h * scale;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(pack, slot.x, slot.y, slot.w, slot.h, screenX - w / 2, groundY - h + 6, w, h);
      ctx.restore();
    });
  }

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const groundY = H * GROUND_Y_FRAC;
    const seasonC = this.seasonColorsAt(this.player.worldX);

    // небо
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, seasonC.skyTop);
    skyGrad.addColorStop(1, seasonC.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, groundY);

    // мягкие "холмы" параллакс
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
      if (screenX < -200 || screenX > W + 200) return;
      this.drawDecorForPoint(pt, groundY);
      this.drawMarker(pt, screenX, groundY);
    });

    // финальные ворота в конце дороги
    this.drawFinaleGate(WORLD_END - this.camX, groundY);

    // персонажи (ведомые сзади, игрок сверху)
    const order = [...this.followers].sort((a, b) => a.worldX - b.worldX);
    order.forEach(f => {
      const frameIdx = Math.floor(f.distance / STEP_LEN);
      const scale = f.sprite === "shemrok" ? 0.5 : f.sprite === "max" ? 0.62 : 1.05;
      this.drawSprite(CHAR_SPRITES[f.sprite], frameIdx, f.worldX, groundY, f.facing, scale, f.bobPhase);
    });
    const pFrame = Math.floor(this.player.distance / STEP_LEN);
    this.drawSprite(CHAR_SPRITES.nikita, pFrame, this.player.worldX, groundY - this.player.jumpT * 26, this.player.facing, 1.1, 0);
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
