/* ==========================================================================
   Наш Путь — движок портала (top-down комната)
   Общий шаблон, переиспользуемый для всех 13 локаций, оформленный
   декором конкретной локации (см. tools/slice_decor.py / decor_manifest.js).
   ========================================================================== */

const PORTAL_STEP_LEN = 13;

class PortalEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.keys = {};
    this.time = 0;
    this.config = null;
    this.player = { x: 0.5, y: 0.55, distance: 0, facing: "down", moving: false };
    this.footprints = [];
    this.shakeT = 0;
    this.activePointId = null;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  enter(portalKey) {
    this.config = PORTALS[portalKey];
    this.key = portalKey;
    this.player = { x: 0.28, y: 0.6, distance: 0, facing: "right", moving: false };
    this.footprints = [];
    this.shakeT = 1;
    this.visited = this.visited || {};
    this.visited[portalKey] = this.visited[portalKey] || new Set();
    // фиксированная, но детерминированная расстановка декора для этой локации
    this.decorLayout = (this.config.pack ? pickDecorEntries(this.config.pack, portalKey.length * 17.3, 11) : [])
      .map((pick, i) => ({
        pick,
        // равномерно по кольцу вокруг зоны ходьбы, чтобы не перекрывать центр
        angle: (i / 11) * Math.PI * 2 + hash(i * 3.1) * 0.4,
        radiusMul: 0.62 + hash(i * 5.7) * 0.5,
      }));
  }

  update(dt) {
    this.time += dt;
    if (this.shakeT > 0) this.shakeT -= dt * 2;
    const k = this.keys;
    const left = k["ArrowLeft"] || k["KeyA"];
    const right = k["ArrowRight"] || k["KeyD"];
    const up = k["ArrowUp"] || k["KeyW"];
    const down = k["ArrowDown"] || k["KeyS"];
    const speed = 0.22 * dt; // бодрая скорость в портале
    let dx = 0, dy = 0;
    if (left) { dx -= speed; this.player.facing = "left"; }
    if (right) { dx += speed; this.player.facing = "right"; }
    if (up) { dy -= speed * 0.7; if (!left && !right) this.player.facing = "up"; }
    if (down) { dy += speed * 0.7; if (!left && !right) this.player.facing = "down"; }
    this.player.moving = !!(dx || dy);

    const cx = 0.5, cy = 0.58, rx = 0.34, ry = 0.3;
    let nx = this.player.x + dx, ny = this.player.y + dy;
    const norm = ((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2;
    if (norm <= 1) { this.player.x = nx; this.player.y = ny; }
    else {
      if (((nx - cx) / rx) ** 2 + ((this.player.y - cy) / ry) ** 2 <= 1) this.player.x = nx;
      if (((this.player.x - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2 <= 1) this.player.y = ny;
    }

    if (this.player.moving) {
      this.player.distance += Math.hypot(dx, dy) * this.canvas.width;
      if (this.time % 0.14 < dt) {
        this.footprints.push({ x: this.player.x, y: this.player.y, t: this.time, side: this.footprints.length % 2 });
        if (this.footprints.length > 40) this.footprints.shift();
      }
    }

    let nearest = null, nearestD = 9999;
    (this.config.points || []).forEach(pt => {
      const d = Math.hypot(pt.x / 100 - this.player.x, pt.y / 100 - this.player.y);
      if (d < nearestD) { nearestD = d; nearest = pt; }
    });
    this.activePointId = nearestD < 0.07 ? nearest.id : null;
  }

  drawBackdrop() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const [c1, c2, c3] = this.config.colors;
    const grad = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.5, W * 0.8);
    grad.addColorStop(0, c1);
    grad.addColorStop(0.55, c2);
    grad.addColorStop(1, c3);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    drawBiomeSilhouette(ctx, W, H, this.config.biome, H * 0.46, c3, (this.player.x - 0.5) * -60);

    // тёплые парящие искры — тот самый "приятный" акцент
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const t = this.time * 0.5 + i * 1.7;
      const sx = ((i * 97) % W + Math.sin(t) * 30 + W) % W;
      const sy = (H * 0.15 + (i * 53) % (H * 0.6) + Math.sin(t * 1.3) * 14);
      ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 2);
      ctx.fillStyle = "#fff8e6";
      ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // зона ходьбы (эллипс — "протоптанная дорожка")
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.58, W * 0.34, H * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // декор локации по кольцу вокруг зоны ходьбы — придаёт стиль конкретного места
    (this.decorLayout || []).forEach((d, i) => {
      const cx = W * 0.5 + Math.cos(d.angle) * W * 0.46 * d.radiusMul;
      const cy = H * 0.56 + Math.sin(d.angle) * H * 0.42 * d.radiusMul;
      drawDecorObject(ctx, d.pick, cx, cy + 30, CHAR_H_PORTAL, i * 11.1);
    });
  }

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    if (this.shakeT > 0) {
      const s = this.shakeT * 10;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    this.drawBackdrop();

    // следы
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    this.footprints.forEach(f => {
      const age = this.time - f.t;
      ctx.globalAlpha = Math.max(0, 0.5 - age * 0.1);
      ctx.beginPath();
      ctx.ellipse(f.x * W + (f.side ? 4 : -4), f.y * H + 14, 3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // интерактивные точки
    (this.config.points || []).forEach(pt => {
      const px = pt.x / 100 * W, py = pt.y / 100 * H;
      const done = this.visited && this.visited[this.key] && this.visited[this.key].has(pt.id);
      ctx.save();
      ctx.translate(px, py);
      const pulse = 0.7 + Math.sin(this.time * 3) * 0.12;
      ctx.fillStyle = done ? "rgba(122,209,201,0.85)" : `rgba(255,179,122,${pulse})`;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });

    // игрок (топ-даун: используем кадр ходьбы, зеркалим для лево/право)
    const img = CHAR_SPRITES.nikita;
    if (img.complete && img.naturalWidth) {
      const frame = Math.floor(this.player.distance / PORTAL_STEP_LEN) % 8;
      const col = frame % 4, row = Math.floor(frame / 4);
      const scale = 1.5;
      const w = SPRITE_FRAME * scale, h = SPRITE_FRAME * scale;
      const px = this.player.x * W, py = this.player.y * H;
      const bob = this.player.moving ? Math.sin(this.time * 9) * 2.4 : 0;
      ctx.save();
      ctx.translate(px, py + bob);
      const dustAlpha = this.player.moving ? 0.35 : 0;
      ctx.fillStyle = `rgba(255,255,255,${dustAlpha})`;
      ctx.beginPath(); ctx.ellipse(0, 14, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
      if (this.player.facing === "left") ctx.scale(-1, 1);
      ctx.drawImage(img, col * SPRITE_FRAME, row * SPRITE_FRAME, SPRITE_FRAME, SPRITE_FRAME, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    ctx.restore();
  }
}
