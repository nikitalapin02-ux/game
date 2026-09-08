/* ==========================================================================
   Наш Путь — UI helpers (toasts, comic modal, HUD, finale)
   ========================================================================== */

const CHAPTER_NAMES = {
  1: "Глава 1 · Искра",
  2: "Глава 2 · Большой мир",
  3: "Глава 3 · Свобода",
  4: "Глава 4 · Через трудности",
  5: "Глава 5 · Новая жизнь",
  6: "Глава 6 · Кругосветка",
  7: "Глава 7 · Дорога домой",
};

function showToast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .4s"; }, 3200);
  setTimeout(() => el.remove(), 3700);
}

const seenAchievements = new Set();
function unlockAchievement(text) {
  if (seenAchievements.has(text)) return;
  seenAchievements.add(text);
  showToast("Пасхалка: " + text);
}

/* ---------------- comic modal ---------------- */
const PORTRAIT_BG = {
  "Никита": ["nikita", "#3a2f22"],
  "Ксюша": ["ksyusha", "#2a2033"],
};

let comicQueue = [];
let comicIndex = 0;
let comicOnClose = null;

function openComic(title, lines, onClose) {
  comicQueue = lines;
  comicIndex = 0;
  comicOnClose = onClose;
  document.getElementById("comicHeader").textContent = title;
  document.getElementById("comicModal").classList.remove("hidden");
  renderComicLine();
}

function portraitStyle(name) {
  const [sprite] = PORTRAIT_BG[name] || ["nikita"];
  const img = CHAR_SPRITES[sprite];
  return `background-image:url(${img.src}); background-position: 0% 0%;`;
}

function renderComicLine() {
  const [speaker, line] = comicQueue[comicIndex];
  document.getElementById("comicSpeaker").textContent = speaker;
  document.getElementById("comicLine").textContent = line;
  const left = document.getElementById("comicPortraitLeft");
  const right = document.getElementById("comicPortraitRight");
  left.setAttribute("style", portraitStyle("Никита"));
  right.setAttribute("style", portraitStyle("Ксюша"));
  left.classList.toggle("speaking", speaker === "Никита");
  right.classList.toggle("speaking", speaker === "Ксюша");
  left.classList.toggle("dim", speaker !== "Никита");
  right.classList.toggle("dim", speaker !== "Ксюша");
}

function advanceComic() {
  comicIndex++;
  if (comicIndex >= comicQueue.length) {
    document.getElementById("comicModal").classList.add("hidden");
    if (comicOnClose) comicOnClose();
    return;
  }
  renderComicLine();
}

document.addEventListener("click", (e) => {
  if (!document.getElementById("comicModal").classList.contains("hidden") &&
      e.target.closest("#comicModal")) {
    advanceComic();
  }
});

/* ---------------- finale ---------------- */
function initFinale() {
  const noBtn = document.getElementById("finaleNo");
  const yesBtn = document.getElementById("finaleYes");
  const buttons = document.querySelector(".finale-buttons");
  noBtn.addEventListener("mouseenter", () => {
    const rect = buttons.getBoundingClientRect();
    const maxX = rect.width - noBtn.offsetWidth - 20;
    const maxY = 30;
    const nx = Math.random() * maxX - maxX / 2;
    const ny = (Math.random() - 0.5) * maxY;
    noBtn.style.transform = `translate(${nx}px, ${ny}px)`;
  });
  yesBtn.addEventListener("click", () => {
    document.getElementById("finaleCelebration").classList.remove("hidden");
    launchConfetti();
  });
}

function launchConfetti() {
  const canvas = document.getElementById("finaleParticles");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height,
    r: 3 + Math.random() * 4,
    vy: 2 + Math.random() * 3,
    vx: (Math.random() - 0.5) * 1.4,
    color: ["#ffd27a", "#ff8fab", "#7ad1c9", "#fff"][Math.floor(Math.random() * 4)],
  }));
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.y > canvas.height + 20) p.y = -20;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    });
    requestAnimationFrame(tick);
  }
  tick();
}
