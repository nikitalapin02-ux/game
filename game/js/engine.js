/* ==========================================================================
   Наш Путь — движок дороги (side-scroller)
   ========================================================================== */

const SPACING = 210;          // расстояние между обычными точками (короче — динамичнее)
const PORTAL_SPACING = 340;   // расстояние вокруг порталов
const GROUND_Y_FRAC = 0.86;   // относительная высота "линии ходьбы" на экране
const STEP_LEN = 20;          // "шаг" в мировых px на один кадр анимации (плавность по расстоянию)
const CHAR_TARGET_H = 148;    // целевой рост персонажа на дороге в px экрана (нормализует разные спрайт-листы)
const BG_ZOOM = 1.22;          // лёгкое увеличение фоновой сцены — крупнее, "ближе" к камере

// запасные цвета неба на случай, если картинка сцены ещё не загружена
const SEASON_FALLBACK = {
  spring: ["#eaf6ff", "#fff4e8"],
  summer: ["#bfe8ff", "#fff6d8"],
  autumn: ["#ffe3c2", "#ffd0a8"],
  winter: ["#eaf1ff", "#ffffff"],
};
const SEASON_ORDER = ["winter", "spring", "summer", "autumn"];
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
// каждый спрайт-лист — сетка 4 колонки x 2 ряда (8 кадров ходьбы), но
// сами кадры могут быть разного размера от листа к листу — считаем
// размер кадра из фактических размеров картинки, а не жёстко фиксируем
function frameSize(img) {
  return { w: img.naturalWidth / 4, h: img.naturalHeight / 2 };
}

// цельные нарисованные фоны-сцены (см. docs/scenario.md / Weave-генерация):
// один на каждый портал + 4 сезонных для самой дороги + один для финала
const SCENE_IMAGES = {
  spring: loadImage("assets/scenes/road_spring.png"),
  summer: loadImage("assets/scenes/road_summer.png"),
  autumn: loadImage("assets/scenes/road_autumn.png"),
  winter: loadImage("assets/scenes/road_winter.png"),
};
const PORTAL_SCENES = {};
Object.keys(PORTALS).forEach(key => { PORTAL_SCENES[key] = loadImage(`assets/scenes/${key}.png`); });
const PORTAL_GATE_ICONS = {};
Object.keys(PORTALS).forEach(key => { PORTAL_GATE_ICONS[key] = loadImage(`assets/gates/${key}.png`); });
const FINALE_SCENE = loadImage("assets/scenes/finale.png");

function readyImg(img) { return img && img.complete && img.naturalWidth > 0; }

// рисует картинку сцены на всю высоту канваса как единый нескроллящийся (очень
// медленный параллакс) фон, БЕЗ зеркалирования; если камера всё же выходит за
// пределы одной картинки, следующая копия мягко проявляется кроссфейдом вместо
// жёсткого/зеркального шва
function drawTiledScene(ctx, img, W, H, parallaxX, alpha) {
  if (!readyImg(img)) return;
  const drawH = H * BG_ZOOM;
  const scale = drawH / img.naturalHeight;
  const tileW = img.naturalWidth * scale;
  const yOff = H - drawH; // подрезаем сверху, "низ" сцены (тропа) остаётся на месте
  const blend = Math.min(tileW * 0.35, 260);
  const start = -((parallaxX % tileW) + tileW) % tileW;
  let x = start - tileW;
  while (x < W + tileW) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x, yOff, tileW, drawH);
    ctx.restore();
    x += tileW;
  }
  // тонкая мягкая дымка поверх швов, чтобы стык не читался жёсткой линией
  ctx.save();
  ctx.globalAlpha = alpha * 0.5;
  const seamX = ((-parallaxX % tileW) + tileW) % tileW;
  for (let sx = seamX - tileW; sx < W + tileW; sx += tileW) {
    const grad = ctx.createLinearGradient(sx - blend, 0, sx + blend, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.10)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(sx - blend, 0, blend * 2, H);
  }
  ctx.restore();
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
      { sprite: "ksyusha", offset: 42, distance: 0, bobPhase: 1.1 },
      { sprite: "max", offset: 78, distance: 0, bobPhase: 2.4 },
      { sprite: "shemrok", offset: 104, distance: 0, bobPhase: 3.7 },
    ];
    this.activePoint = null;
    this.dust = [];
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

  // сезон в текущей мировой позиции + мягкий переход к следующему (без рывков)
  seasonAt(wx) {
    let prev = TIMELINE[0], next = TIMELINE[TIMELINE.length - 1];
    for (let i = 0; i < TIMELINE.length - 1; i++) {
      if (TIMELINE[i].worldX <= wx && TIMELINE[i + 1].worldX >= wx) {
        prev = TIMELINE[i]; next = TIMELINE[i + 1]; break;
      }
    }
    const span = Math.max(1, next.worldX - prev.worldX);
    const t = Math.max(0, Math.min(1, (wx - prev.worldX) / span));
    return { a: seasonOf(prev.month), b: seasonOf(next.month), t };
  }

  drawSprite(img, frameIndexTotal, worldX, groundY, facing, heightMul, bobPhase) {
    if (!img.complete || !img.naturalWidth) return;
    const { w: fw, h: fh } = frameSize(img);
    const frame = frameIndexTotal % 8;
    const col = frame % 4, row = Math.floor(frame / 4);
    const ctx = this.ctx;
    const sx = col * fw, sy = row * fh;
    const drawH = CHAR_TARGET_H * heightMul, drawW = drawH * (fw / fh);
    const screenX = worldX - this.camX;
    const bob = Math.sin(this.time * 6 + bobPhase) * 1.4;
    ctx.save();
    ctx.translate(screenX, groundY - drawH / 2 + bob);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, fw, fh, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const groundY = H * GROUND_Y_FRAC;
    const season = this.seasonAt(this.player.worldX);

    // запасной цвет неба, пока картинки сцены ещё грузятся/не присланы
    const fbA = SEASON_FALLBACK[season.a], fbB = SEASON_FALLBACK[season.b];
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, lerpColor(fbA[0], fbB[0], season.t));
    skyGrad.addColorStop(1, lerpColor(fbA[1], fbB[1], season.t));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // цельная нарисованная сцена дороги, зеркально-тайлится по горизонтали,
    // с медленным параллаксом и мягким кроссфейдом между сезонами
    const parallax = this.camX * 0.55;
    drawTiledScene(ctx, SCENE_IMAGES[season.a], W, H, parallax, 1);
    if (season.t > 0.001) drawTiledScene(ctx, SCENE_IMAGES[season.b], W, H, parallax, season.t);

    // лёгкое затемнение внизу, чтобы текст/маркеры маршрута читались на любом фоне
    const shade = ctx.createLinearGradient(0, groundY - 40, 0, H);
    shade.addColorStop(0, "rgba(10,14,10,0)");
    shade.addColorStop(1, "rgba(10,14,10,0.28)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, groundY - 40, W, H - groundY + 40);

    // точки маршрута
    TIMELINE.forEach(pt => {
      const screenX = pt.worldX - this.camX;
      if (screenX < -260 || screenX > W + 260) return;
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
      ctx.beginPath();
      ctx.ellipse(d.x - this.camX, groundY + 10 + (d.side ? 3 : -3), 5 + age * 14, 3 + age * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // персонажи (ведомые сзади, игрок сверху)
    const order = [...this.followers].sort((a, b) => a.worldX - b.worldX);
    order.forEach(f => {
      const frameIdx = Math.floor(f.distance / STEP_LEN);
      const heightMul = f.sprite === "shemrok" ? 0.32 : f.sprite === "max" ? 0.52 : 0.97;
      this.drawSprite(CHAR_SPRITES[f.sprite], frameIdx, f.worldX, groundY, f.facing, heightMul, f.bobPhase);
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
    this.drawSprite(CHAR_SPRITES.nikita, pFrame, this.player.worldX, groundY - this.player.jumpT * 26, this.player.facing, 1.0, 0);
    ctx.restore();
  }

  drawMarker(pt, screenX, groundY) {
    const ctx = this.ctx;
    const isPortal = !!pt.portal;
    ctx.save();
    ctx.translate(screenX, groundY);
    if (isPortal) {
      const glow = 0.5 + Math.sin(this.time * 2 + pt.id) * 0.15;
      const bob = Math.sin(this.time * 1.4 + pt.id) * 4;
      const icon = PORTAL_GATE_ICONS[pt.portal];
      if (readyImg(icon)) {
        const gh = CHAR_TARGET_H * 1.9;
        const gw = gh * (icon.naturalWidth / icon.naturalHeight);
        const grad = ctx.createRadialGradient(0, -gh * 0.5, 4, 0, -gh * 0.5, gh * 0.75);
        grad.addColorStop(0, `rgba(255,210,150,${0.4 * glow})`);
        grad.addColorStop(1, "rgba(255,210,150,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, -gh * 0.5, gh * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(icon, -gw / 2, -gh + bob, gw, gh);
      } else {
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
      }
      ctx.fillStyle = "#fff6ea";
      ctx.font = "700 13px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 5;
      ctx.fillText(pt.title.split(",")[0], 0, -CHAR_TARGET_H * 2.1);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(0, -16, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
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
