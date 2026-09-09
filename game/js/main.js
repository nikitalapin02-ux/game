/* ==========================================================================
   Наш Путь — главный контроллер (стейт-машина road / portal / finale)
   ========================================================================== */

const canvas = document.getElementById("game");
const road = new RoadEngine(canvas);
const portal = new PortalEngine(canvas);

let state = "start"; // start | road | portal | finale
let lastT = performance.now();
let lastVisitedPointId = null;
let visitedPortals = new Set();
let konamiBuf = [];
const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","KeyB","KeyA"];

/* ---------------- audio ---------------- */
const music = new Audio("assets/audio/theme.mp3");
music.loop = true;
music.volume = 0;
let musicOn = false;
let musicFadeTarget = 0;
function fadeMusic(dt) {
  if (music.volume < musicFadeTarget) music.volume = Math.min(musicFadeTarget, music.volume + dt * 0.15);
  else if (music.volume > musicFadeTarget) music.volume = Math.max(musicFadeTarget, music.volume - dt * 0.15);
}
document.getElementById("musicBtn").addEventListener("click", () => {
  musicOn = !musicOn;
  document.getElementById("musicBtn").classList.toggle("active", musicOn);
  if (musicOn) { music.play().catch(() => {}); musicFadeTarget = 0.55; }
  else musicFadeTarget = 0;
});

/* ---------------- input ---------------- */
window.addEventListener("keydown", (e) => {
  const active = state === "road" ? road : state === "portal" ? portal : null;
  if (active) active.keys[e.code] = true;

  konamiBuf.push(e.code);
  if (konamiBuf.length > KONAMI.length) konamiBuf.shift();
  if (konamiBuf.join(",") === KONAMI.join(",")) {
    unlockAchievement("Секретный код найден — как в Дагестане, всегда до конца 😉");
  }

  if (e.code === "KeyE") handleInteract();
  if (e.code === "Escape") {
    if (state === "portal") exitPortal();
    if (!document.getElementById("comicModal").classList.contains("hidden")) advanceComic();
  }
  if (e.code === "Space" && !document.getElementById("comicModal").classList.contains("hidden")) {
    advanceComic();
  }
});
window.addEventListener("keyup", (e) => {
  const active = state === "road" ? road : state === "portal" ? portal : null;
  if (active) active.keys[e.code] = false;
});

function handleInteract() {
  if (state === "road") {
    const pt = road.activePoint;
    if (!pt) {
      // пасхалка: погладить Макса/Шемрока рядом
      const near = road.followers.find(f => Math.abs(f.worldX - road.player.worldX) < 45 && (f.sprite === "max" || f.sprite === "shemrok"));
      if (near) {
        showToast(near.sprite === "max" ? "Макс радостно машет хвостом 🐾" : "Шемрок пищит и убегает в траву 🐭");
      }
      return;
    }
    const burstX = pt.worldX - road.camX, burstY = canvas.height * GROUND_Y_FRAC - 80;
    spawnSparkleBurst(burstX, burstY, pt.portal ? "#ffb37a" : "#7ad1c9");
    if (pt.portal) {
      enterPortal(pt.portal);
    } else if (lastVisitedPointId !== pt.id) {
      lastVisitedPointId = pt.id;
      showToast(`${pt.date} — ${pt.title}`);
    }
    if (pt.id === 71) {
      // последняя точка — намёк, что дальше ворота
      showToast("Дорога почти пройдена… впереди что-то важное.");
    }
  } else if (state === "portal") {
    const id = portal.activePointId;
    if (!id) return;
    const pt = portal.config.points.find(p => p.id === id);
    const firstVisit = !portal.visited[portal.key].has(id);
    portal.visited[portal.key].add(id);
    spawnSparkleBurst(pt.x / 100 * canvas.width, pt.y / 100 * canvas.height, firstVisit ? "#ffd27a" : "#7ad1c9");
    openComic(`${portal.config.title} · ${pt.label}`, pt.comic, () => {
      if (pt.easterEgg && pt.easterEgg.startsWith("achievement:")) {
        unlockAchievement(pt.easterEgg.slice("achievement:".length));
      }
    });
  }
}

/* ---------------- portal transitions ---------------- */
function enterPortal(key) {
  state = "portal";
  portal.enter(key);
  document.getElementById("portalTitle").textContent = `${portal.config.title} · ${portal.config.subtitle}`;
  document.getElementById("portalHud").classList.remove("hidden");
  document.getElementById("hud").classList.add("hidden");
  showToast(portal.config.intro);
}
function exitPortal() {
  visitedPortals.add(portal.key);
  state = "road";
  document.getElementById("portalHud").classList.add("hidden");
  document.getElementById("hud").classList.remove("hidden");
  updateHud();
}
document.getElementById("portalExitBtn").addEventListener("click", exitPortal);

/* ---------------- HUD ---------------- */
function updateHud() {
  const pt = [...TIMELINE].reverse().find(p => p.worldX <= road.player.worldX) || TIMELINE[0];
  document.getElementById("hudChapter").textContent = CHAPTER_NAMES[pt.chapter];
  const frac = Math.min(1, road.player.worldX / WORLD_END);
  document.getElementById("hudProgressBar").style.width = (frac * 100).toFixed(1) + "%";
}

/* ---------------- prompt tag / point card ---------------- */
function updatePrompt() {
  const promptEl = document.getElementById("promptTag");
  const cardEl = document.getElementById("pointCard");
  if (state === "road") {
    const pt = road.activePoint;
    if (pt) {
      const sx = pt.worldX - road.camX;
      promptEl.style.left = sx + "px";
      promptEl.style.top = (canvas.height * GROUND_Y_FRAC - 190) + "px";
      promptEl.classList.remove("hidden");
      document.getElementById("pointCardDate").textContent = pt.date;
      document.getElementById("pointCardTitle").textContent = pt.title;
      cardEl.style.left = sx + "px";
      cardEl.style.top = (canvas.height * GROUND_Y_FRAC - 220) + "px";
      cardEl.classList.remove("hidden");
    } else {
      promptEl.classList.add("hidden");
      cardEl.classList.add("hidden");
    }
  } else if (state === "portal") {
    if (portal.activePointId) {
      const pt = portal.config.points.find(p => p.id === portal.activePointId);
      promptEl.style.left = (pt.x / 100 * canvas.width) + "px";
      promptEl.style.top = (pt.y / 100 * canvas.height - 26) + "px";
      promptEl.classList.remove("hidden");
    } else {
      promptEl.classList.add("hidden");
    }
    cardEl.classList.add("hidden");
  } else {
    promptEl.classList.add("hidden");
    cardEl.classList.add("hidden");
  }
}

/* ---------------- finale ---------------- */
function maybeShowFinale() {
  if (road.player.worldX >= WORLD_END - 30 && state === "road") {
    state = "finale";
    document.getElementById("hud").classList.add("hidden");
    const overlay = document.getElementById("finaleOverlay");
    if (readyImg(FINALE_SCENE)) {
      overlay.style.backgroundImage = `linear-gradient(rgba(10,8,18,0.35), rgba(10,8,18,0.75)), url(${FINALE_SCENE.src})`;
      overlay.style.backgroundSize = "cover";
      overlay.style.backgroundPosition = "center";
    }
    overlay.classList.remove("hidden");
  }
}

/* ---------------- loop ---------------- */
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  fadeMusic(dt);

  if (state === "road") {
    road.update(dt);
    road.render();
    updateHud();
    maybeShowFinale();
  } else if (state === "portal") {
    portal.update(dt);
    portal.render();
  }
  updatePrompt();
  requestAnimationFrame(loop);
}

document.getElementById("startBtn").addEventListener("click", () => {
  document.getElementById("startScreen").classList.add("hidden");
  document.getElementById("hud").classList.remove("hidden");
  state = "road";
  musicOn = true;
  document.getElementById("musicBtn").classList.add("active");
  music.play().catch(() => {});
  musicFadeTarget = 0.55;
});

initFinale();
requestAnimationFrame(loop);
