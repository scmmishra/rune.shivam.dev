const WIDTH = 400;
const HEIGHT = 520;
const ENEMY_COUNT = 12;
const POINTS_PER_ENEMY = 100;
const SAVE_KEY = "rune-patrol-v1";
const PLAYER_SPEED = 230;
const FIRE_INTERVAL = .16;
const MAX_HEARTS = 5;
const HEART_DROP_CHANCE = .05;
const ENEMY_FIRE_INTERVAL = 6;
const HEART_FALL_SPEED = 55;
const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
const SHIP = ["000010000", "000111000", "000111000", "010111010", "111111111", "111010111", "010010010"];
const ENEMY = ["010000010", "001000100", "011111110", "110111011", "111111111", "100101001", "001000100"];
type Save = { version: 1; stage: 1; score: number; best: number; hearts: number; defeated: number[]; status: "playing" | "won" | "lost" };
type Bullet = { x: number; y: number; vx: number; vy: number; hostile: boolean };
type Enemy = { id: number; x: number; y: number; age: number; fire: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number };

function readSave(): Save | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!s || s.version !== 1 || s.stage !== 1 || !["playing", "won", "lost"].includes(s.status)) return null;
    s.hearts ??= s.shields;
    if (!Array.isArray(s.defeated) || s.defeated.some((id: number) => !Number.isInteger(id) || id < 0 || id >= ENEMY_COUNT)) return null;
    if (new Set(s.defeated).size !== s.defeated.length || s.score !== s.defeated.length * POINTS_PER_ENEMY) return null;
    if (!Number.isInteger(s.hearts) || s.hearts < 0 || s.hearts > MAX_HEARTS || !Number.isInteger(s.best) || s.best < s.score || s.best > ENEMY_COUNT * POINTS_PER_ENEMY) return null;
    if (s.status === "playing" && (s.hearts === 0 || s.defeated.length === ENEMY_COUNT)) return null;
    if (s.status === "won" && s.defeated.length !== ENEMY_COUNT) return null;
    if (s.status === "lost" && s.hearts !== 0) return null;
    return s;
  } catch { return null; }
}

export function mountArcade(root: HTMLElement) {
  const canvas = root.querySelector("canvas")!;
  const context = canvas.getContext("2d");
  if (!context) return;
  const ctx = context;
  const menu = root.querySelector<HTMLElement>(".arcade-menu")!;
  const start = root.querySelector<HTMLButtonElement>("[data-start]")!;
  const pauseButton = root.querySelector<HTMLButtonElement>("[data-pause]")!;
  const title = root.querySelector<HTMLElement>("[data-title]")!;
  const message = root.querySelector<HTMLElement>("[data-message]")!;
  const scoreLabel = root.querySelector<HTMLElement>("[data-score]")!;
  const heartsLabel = root.querySelector<HTMLElement>("[data-hearts]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const record = root.querySelector<HTMLElement>("[data-record]")!;
  let saved = readSave();
  let score = saved?.score ?? 0;
  let best = saved?.best ?? 0;
  let hearts = saved?.hearts ?? MAX_HEARTS;
  let defeated = new Set<number>(saved?.defeated ?? []);
  let mode: "ready" | "playing" | "paused" | "won" | "lost" = "ready";
  let enemies: Enemy[] = [];
  let bullets: Bullet[] = [];
  let particles: Particle[] = [];
  let pickups: { x: number; y: number }[] = [];
  let player = { x: WIDTH / 2, y: HEIGHT - 65 };
  let clock = 0;
  let fireCooldown = 0;
  let invulnerable = 0;
  let pointer: { x: number; y: number } | null = null;
  const stars = Array.from({ length: 65 }, () => ({ x: Math.random() * WIDTH, y: Math.random() * HEIGHT, depth: .3 + Math.random() * .7 }));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function hud() {
    scoreLabel.textContent = String(score).padStart(5, "0");
    heartsLabel.textContent = Array.from({ length: MAX_HEARTS }, (_, i) => i < hearts ? "♥" : "♡").join(" ");
    heartsLabel.setAttribute("aria-label", `${hearts} hearts remaining`);
    record.textContent = best ? `PERSONAL BEST / ${String(best).padStart(5, "0")}` : "LEVEL 01 / SINGLE WAVE";
  }
  function persist(result: Save["status"] = "playing") {
    best = Math.max(best, score);
    saved = { version: 1, stage: 1, score, best, hearts, defeated: [...defeated], status: result };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); }
    catch { status.textContent = "Local saving unavailable. You can still play."; }
    hud();
  }
  function populate() {
    enemies = Array.from({ length: ENEMY_COUNT }, (_, id) => ({ id, x: 0, y: -100, age: -id * .32, fire: ENEMY_FIRE_INTERVAL + (id % 4) * .6 })).filter(e => !defeated.has(e.id));
    bullets = [];
    particles = [];
    pickups = [];
    player = { x: WIDTH / 2, y: HEIGHT - 65 };
    invulnerable = 1.5;
    fireCooldown = 0;
  }
  function play() {
    if (mode !== "paused") {
      if (!saved || saved.status !== "playing") { score = 0; hearts = MAX_HEARTS; defeated.clear(); }
      populate();
    }
    mode = "playing";
    menu.hidden = true;
    pauseButton.hidden = false;
    pointer = null;
    status.textContent = `Level 1 · ${ENEMY_COUNT - defeated.size} hostiles remaining`;
    persist();
    canvas.focus({ preventScroll: true });
  }
  function pause() {
    if (mode !== "playing") return;
    mode = "paused";
    pointer = null;
    menu.hidden = false;
    pauseButton.hidden = true;
    title.textContent = "holding_";
    message.textContent = "Take your time. Your progress is saved.";
    start.textContent = "[ resume ]";
    status.textContent = "Level 1 · paused";
    persist();
  }
  function finish(won: boolean) {
    mode = won ? "won" : "lost";
    pointer = null;
    menu.hidden = false;
    pauseButton.hidden = true;
    title.textContent = won ? "sector_clear" : "signal_lost";
    message.textContent = won ? "All hostiles cleared. That's the whole mission." : "Your ship is down. Ready for another flight?";
    start.textContent = "[ fly again ]";
    status.textContent = `Level 1 ${won ? "complete" : "failed"} · score ${score}`;
    persist(won ? "won" : "lost");
    start.focus({ preventScroll: true });
  }
  function burst(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 90;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .45 });
    }
  }
  function damage() {
    if (invulnerable > 0) return;
    hearts--;
    invulnerable = 1.8;
    burst(player.x, player.y);
    if (hearts === 0) finish(false);
    else { status.textContent = `Ship hit · ${hearts} hearts remaining`; persist(); }
  }
  function update(dt: number) {
    clock += dt;
    invulnerable = Math.max(0, invulnerable - dt);
    if (pointer) {
      const distance = Math.hypot(pointer.x - player.x, pointer.y - player.y);
      const step = Math.min(1, PLAYER_SPEED * 1.5 * dt / (distance || 1));
      player.x += (pointer.x - player.x) * step;
      player.y += (pointer.y - player.y) * step;
    }
    player.x = Math.max(16, Math.min(WIDTH - 16, player.x));
    player.y = Math.max(HEIGHT * .4, Math.min(HEIGHT - 18, player.y));
    fireCooldown -= dt;
    if (fireCooldown <= 0) {
      bullets.push({ x: player.x, y: player.y - 14, vx: 0, vy: -420, hostile: false });
      fireCooldown = FIRE_INTERVAL;
    }
    for (const enemy of enemies) {
      enemy.age += dt;
      if (enemy.age < 0) continue;
      const column = enemy.id % 4;
      const row = Math.floor(enemy.id / 4);
      enemy.x = 65 + column * 88 + Math.sin(enemy.age * 1.6 + row) * 26;
      const entry = Math.min(1, enemy.age / 1.5);
      enemy.y = -30 + entry * (95 + row * 48);
      enemy.fire -= dt;
      if (enemy.fire <= 0 && enemy.y > 0 && enemy.y < player.y - 45) {
        const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        bullets.push({ x: enemy.x, y: enemy.y + 12, vx: Math.cos(angle) * 105, vy: Math.sin(angle) * 105, hostile: true });
        enemy.fire = ENEMY_FIRE_INTERVAL + (enemy.id % 3) * .6;
      }
      if (Math.abs(enemy.x - player.x) < 21 && Math.abs(enemy.y - player.y) < 20) damage();
      if (mode !== "playing") return;
    }
    for (const bullet of bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.hostile) {
        if (Math.abs(bullet.x - player.x) < 10 && Math.abs(bullet.y - player.y) < 12) { bullet.y = HEIGHT + 40; damage(); }
      } else {
        const hit = enemies.find(e => e.age >= 0 && !defeated.has(e.id) && Math.abs(e.x - bullet.x) < 16 && Math.abs(e.y - bullet.y) < 15);
        if (hit) {
          defeated.add(hit.id);
          score += POINTS_PER_ENEMY;
          burst(hit.x, hit.y);
          if (Math.random() < HEART_DROP_CHANCE) pickups.push({ x: hit.x, y: hit.y });
          bullet.y = -40;
          status.textContent = `Level 1 · ${ENEMY_COUNT - defeated.size} hostiles remaining`;
          if (defeated.size === ENEMY_COUNT) { finish(true); return; }
          persist();
        }
      }
      if (mode !== "playing") return;
    }
    enemies = enemies.filter(e => !defeated.has(e.id));
    bullets = bullets.filter(b => b.y > -20 && b.y < HEIGHT + 20 && b.x > -20 && b.x < WIDTH + 20);
    pickups = pickups.filter(heart => {
      heart.y += HEART_FALL_SPEED * dt;
      if (Math.abs(heart.x - player.x) < 20 && Math.abs(heart.y - player.y) < 22) {
        hearts = Math.min(MAX_HEARTS, hearts + 1);
        status.textContent = `Heart collected · ${hearts} hearts remaining`;
        persist();
        return false;
      }
      return heart.y < HEIGHT + 15;
    });
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
  }
  function sprite(pattern: string[], x: number, y: number, scale = 3) {
    pattern.forEach((row, iy) => [...row].forEach((pixel, ix) => {
      if (pixel === "1") ctx.fillRect(Math.round(x + (ix - row.length / 2) * scale), Math.round(y + (iy - pattern.length / 2) * scale), scale, scale);
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#4de07a";
    for (const star of stars) {
      ctx.globalAlpha = star.depth * .45;
      ctx.fillRect(star.x, (star.y + (reducedMotion.matches ? 0 : clock * 18 * star.depth)) % HEIGHT, 1, star.depth > .8 ? 2 : 1);
    }
    ctx.globalAlpha = mode === "playing" ? 1 : .16;
    ctx.shadowColor = "#4de07a";
    ctx.shadowBlur = 7;
    if (mode === "ready" && !saved) {
      for (let i = 0; i < 8; i++) sprite(ENEMY, 68 + i % 4 * 88, 65 + Math.floor(i / 4) * 53);
    } else for (const e of enemies) if (e.age >= 0 && !defeated.has(e.id)) sprite(ENEMY, e.x, e.y);
    ctx.fillStyle = "#b8ffcb";
    for (const heart of pickups) sprite(HEART, heart.x, heart.y, 2);
    if (invulnerable <= 0 || Math.floor(clock * 10) % 2 === 0 || reducedMotion.matches) sprite(SHIP, player.x, player.y);
    ctx.fillStyle = "#4de07a";
    ctx.fillRect(player.x - 2, player.y + 12, 4, 6 + Math.sin(clock * 24) * 3);
    for (const b of bullets) {
      ctx.fillStyle = b.hostile ? "#4de07a" : "#b8ffcb";
      if (b.hostile) { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.strokeStyle = "#b8ffcb"; ctx.stroke(); }
      else ctx.fillRect(b.x - 1, b.y - 5, 2, 10);
    }
    for (const p of particles) { ctx.globalAlpha = p.life / .45; ctx.fillRect(p.x, p.y, 2, 2); }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  start.disabled = false;
  hud();
  if (saved) {
    title.textContent = saved.status === "won" ? "sector_clear" : saved.status === "lost" ? "signal_lost" : "welcome_back";
    message.textContent = saved.status === "playing" ? "Your ship is waiting. Finish the patrol." : `Level 1 ${saved.status === "won" ? "complete" : "ended"}. Score: ${score}.`;
    start.textContent = saved.status === "playing" ? "[ continue ]" : "[ fly again ]";
  }
  start.addEventListener("click", play);
  pauseButton.addEventListener("click", pause);
  canvas.addEventListener("keydown", e => {
    if (e.code !== "Escape" || mode !== "playing") return;
    e.preventDefault();
    pause();
    start.focus({ preventScroll: true });
  });
  canvas.addEventListener("blur", pause);
  function point(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
    return { x: (e.clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale, y: (e.clientY - rect.top - (rect.height - HEIGHT * scale) / 2) / scale };
  }
  canvas.addEventListener("pointermove", e => {
    if (mode === "playing") pointer = point(e);
  });
  for (const event of ["pointerleave", "pointercancel"]) canvas.addEventListener(event, () => { pointer = null; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("blur", pause);
  window.addEventListener("pagehide", pause);
  let last = 0;
  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, .04);
    last = now;
    if (mode === "playing") update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
