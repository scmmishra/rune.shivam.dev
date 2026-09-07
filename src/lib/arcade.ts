import { ENEMY_TYPES, SECTORS, sectorMaxScore, type EnemyKind } from "./arcade-level";
import { createArcadeAudio } from "./arcade-audio";

const WIDTH = 400;
const HEIGHT = 520;
const SAVE_KEY = "rune-patrol-v1";
const PLAYER_SPEED = 230;
const FIRE_INTERVAL = .2;
const MAX_HEARTS = 5;
const ITEM_DROP_CHANCE = .05;
const HEAVY_ITEM_DROP_CHANCE = .25;
const HEART_FALL_SPEED = 55;
const MISSILE_INTERVAL = 5;
const MISSILE_SPEED = 260;
const MISSILE_DAMAGE = 5;
const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
const UPGRADE = ["0001000", "0011100", "0111110", "1101011", "0001000", "0001000", "0001000"];
const MISSILE = ["00100", "01110", "01110", "01110", "11111", "10101"];
const SHIP = ["000010000", "000111000", "000111000", "010111010", "111111111", "111010111", "010010010"];
const ENEMY = ["000101000", "000111000", "000010000", "000111000", "011111110", "111111111", "000111000", "000010000", "000010000"];
type Save = { version: 3; stage: number; score: number; best: number; status: "won" };
type Bullet = { x: number; y: number; vx: number; vy: number; hostile: boolean };
type Enemy = { id: number; kind: EnemyKind; health: number; x: number; y: number; age: number; fire: number };
type Pickup = { x: number; y: number; kind: "heart" | "upgrade" };
type Missile = { x: number; y: number; targetId: number; angle: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number };

export function rollDrops(kind: EnemyKind, upgradesAllowed: boolean, random = Math.random): Pickup["kind"][] {
  const chance = kind === "heavy" ? HEAVY_ITEM_DROP_CHANCE : ITEM_DROP_CHANCE;
  if (kind === "boss" || random() >= chance) return [];
  const pool: Pickup["kind"][] = upgradesAllowed ? ["upgrade", "heart"] : ["heart"];
  return Array.from({ length: kind === "heavy" ? 2 : 1 }, () => pool.length === 1 ? pool[0] : pool[Math.floor(random() * pool.length)]);
}

function readSave(): Save | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!s || ![2, 3].includes(s.version) || s.status !== "won") return null;
    if (!Number.isInteger(s.stage) || s.stage < 1 || s.stage > SECTORS.length || (s.version === 2 && s.stage !== 1)) return null;
    const maxScore = SECTORS.slice(0, s.stage).reduce((sum, sector) => sum + sectorMaxScore(sector), 0);
    const maxBest = SECTORS.reduce((sum, sector) => sum + sectorMaxScore(sector), 0);
    if (!Number.isInteger(s.score) || s.score < 0 || s.score > maxScore || s.score % 100 !== 0) return null;
    if (!Number.isInteger(s.best) || s.best < s.score || s.best > maxBest || s.best % 100 !== 0) return null;
    return { version: 3, stage: s.stage, score: s.score, best: s.best, status: "won" };
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
  const waveLabel = root.querySelector<HTMLElement>("[data-wave]")!;
  const waveBanner = root.querySelector<HTMLElement>("[data-wave-banner]")!;
  const sectorLabel = root.querySelector<HTMLElement>("[data-sector]")!;
  const weaponLabel = root.querySelector<HTMLElement>("[data-weapon]")!;
  const bossLabel = root.querySelector<HTMLElement>("[data-boss]")!;
  const soundButton = root.querySelector<HTMLButtonElement>("[data-sound]")!;
  const audio = createArcadeAudio();
  let saved = readSave();
  let sectorIndex = (saved?.stage ?? 0) % SECTORS.length;
  let entryScore = saved && saved.stage < SECTORS.length ? saved.score : 0;
  let score = saved?.score ?? 0;
  let best = saved?.best ?? 0;
  let hearts = MAX_HEARTS;
  let weapon = 1;
  let hasMissiles = false;
  let missileCooldown = MISSILE_INTERVAL;
  let missiles: Missile[] = [];
  const defeated = new Set<number>();
  let mode: "ready" | "playing" | "paused" | "won" | "lost" = "ready";
  let enemies: Enemy[] = [];
  let bullets: Bullet[] = [];
  let particles: Particle[] = [];
  let pickups: Pickup[] = [];
  let player = { x: WIDTH / 2, y: HEIGHT - 65 };
  let clock = 0;
  let nextWave = 0;
  let nextEnemyId = 0;
  let bannerUntil = 0;
  let escaped = 0;
  let finishDelay = 0;
  let fireCooldown = 0;
  let invulnerable = 0;
  let invincible = false;
  let pointer: { x: number; y: number } | null = null;
  const stars = Array.from({ length: 65 }, () => ({ x: Math.random() * WIDTH, y: Math.random() * HEIGHT, depth: .3 + Math.random() * .7 }));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function hud() {
    scoreLabel.textContent = String(score).padStart(5, "0");
    heartsLabel.textContent = Array.from({ length: MAX_HEARTS }, (_, i) => i < hearts ? "♥" : "♡").join(" ");
    heartsLabel.setAttribute("aria-label", `${hearts} hearts remaining`);
    record.textContent = best ? `PERSONAL BEST / ${String(best).padStart(5, "0")}` : `SECTOR ${sectorIndex + 1} / ${SECTORS[sectorIndex].waves.length} WAVES`;
    waveLabel.textContent = `WAVE ${Math.max(1, nextWave)}/${SECTORS[sectorIndex].waves.length}`;
    sectorLabel.textContent = String(sectorIndex + 1).padStart(2, "0");
    weaponLabel.textContent = `FIRE ×${weapon}${hasMissiles ? " · HOMING / 5s" : ""}`;
    const boss = enemies.find(e => e.kind === "boss" && e.health > 0);
    bossLabel.hidden = !boss || mode !== "playing";
    bossLabel.textContent = boss ? `COMMAND SHIP / ${boss.health} / ${ENEMY_TYPES.boss.health}` : "";
  }
  function saveCompletion() {
    best = Math.max(best, score);
    saved = { version: 3, stage: sectorIndex + 1, score, best, status: "won" };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); }
    catch { status.textContent = "Local saving unavailable. You can still play."; }
    hud();
  }
  function populate() {
    enemies = [];
    bullets = [];
    particles = [];
    pickups = [];
    missiles = [];
    hasMissiles = false;
    missileCooldown = MISSILE_INTERVAL;
    player = { x: WIDTH / 2, y: HEIGHT - 65 };
    invulnerable = 1.5;
    fireCooldown = 0;
    clock = 0;
    nextWave = 0;
    nextEnemyId = 0;
    escaped = 0;
    finishDelay = 0;
    bannerUntil = 0;
    waveBanner.hidden = true;
    bossLabel.hidden = true;
  }
  function play() {
    const resuming = mode === "paused";
    void audio.unlock().then(() => { if (!resuming && mode === "playing") audio.play("start"); });
    if (mode !== "paused") {
      if (mode === "won") {
        sectorIndex = (sectorIndex + 1) % SECTORS.length;
        entryScore = sectorIndex === 0 ? 0 : score;
      }
      score = entryScore;
      weapon = 1;
      hearts = MAX_HEARTS;
      defeated.clear();
      populate();
    }
    mode = "playing";
    menu.hidden = true;
    pauseButton.hidden = false;
    pointer = null;
    status.textContent = `Sector ${sectorIndex + 1} · wave ${Math.max(1, nextWave)}/${SECTORS[sectorIndex].waves.length}`;
    hud();
    canvas.focus({ preventScroll: true });
  }
  function pause() {
    if (mode !== "playing") return;
    audio.stop();
    mode = "paused";
    waveBanner.hidden = true;
    pointer = null;
    menu.hidden = false;
    pauseButton.hidden = true;
    title.textContent = "holding_";
    message.textContent = "Take your time. Reloading restarts this sector.";
    start.textContent = "[ resume ]";
    status.textContent = `Sector ${sectorIndex + 1} · paused`;
    hud();
  }
  function finish(won: boolean) {
    audio.stop();
    audio.play(won ? "win" : "lose");
    mode = won ? "won" : "lost";
    waveBanner.hidden = true;
    pointer = null;
    menu.hidden = false;
    pauseButton.hidden = true;
    const campaignComplete = won && sectorIndex === SECTORS.length - 1;
    title.textContent = won ? campaignComplete ? "patrol_complete" : "sector_clear" : "signal_lost";
    const total = SECTORS[sectorIndex].waves.reduce((sum, wave) => sum + wave.formation.length, 0);
    message.textContent = won ? `${defeated.size}/${total} aircraft down · ${escaped} escaped. ${campaignComplete ? "All sectors complete." : "Next sector ready. Weapons reset on entry."}` : "Your ship is down. Ready for another flight?";
    start.textContent = won && !campaignComplete ? `[ enter sector ${sectorIndex + 2} ]` : "[ fly again ]";
    status.textContent = `Sector ${sectorIndex + 1} ${won ? "complete" : "failed"} · score ${score}`;
    if (won) saveCompletion();
    else hud();
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
    if (import.meta.env.DEV && invincible) return;
    if (invulnerable > 0) return;
    hearts--;
    audio.play("playerHit");
    invulnerable = 1.8;
    burst(player.x, player.y);
    if (hearts === 0) finish(false);
    else { status.textContent = `Ship hit · ${hearts} hearts remaining`; hud(); }
  }
  function dropItems(enemy: Enemy) {
    const items = rollDrops(enemy.kind, SECTORS[sectorIndex].maxFire > 1);
    items.forEach((kind, i) => pickups.push({ x: enemy.x + (i - (items.length - 1) / 2) * 24, y: enemy.y, kind }));
  }
  function hitEnemy(enemy: Enemy, damage: number) {
    if (defeated.has(enemy.id)) return;
    enemy.health = Math.max(0, enemy.health - damage);
    if (enemy.health > 0) audio.play("enemyHit");
    else {
      audio.play(enemy.kind === "basic" ? "enemyDeath" : "explosion");
      defeated.add(enemy.id);
      score += ENEMY_TYPES[enemy.kind].points;
      burst(enemy.x, enemy.y);
      dropItems(enemy);
      status.textContent = `Wave ${nextWave}/${SECTORS[sectorIndex].waves.length} · ${defeated.size} aircraft down`;
    }
    hud();
  }
  function randomTarget() {
    const targets = enemies.filter(e => !defeated.has(e.id) && e.y >= 0 && e.y <= HEIGHT);
    return targets[Math.floor(Math.random() * targets.length)];
  }
  function update(dt: number) {
    clock += dt;
    const sector = SECTORS[sectorIndex];
    const wave = sector.waves[nextWave];
    if (wave && clock >= wave.at) {
      for (const [x, offsetY, kind = "basic"] of wave.formation) {
        const id = nextEnemyId++;
        const spec = ENEMY_TYPES[kind];
        enemies.push({ id, kind, health: spec.health, x, y: -35 + offsetY, age: 0, fire: spec.fireInterval * (1 + (id % 4) * .2) });
      }
      nextWave++;
      bannerUntil = clock + 2;
      waveBanner.textContent = `WAVE ${nextWave}/${sector.waves.length} / ${wave.name}`;
      status.textContent = `Wave ${nextWave} inbound · ${wave.name.toLowerCase()}`;
      hud();
    }
    waveBanner.hidden = clock >= bannerUntil;
    invulnerable = Math.max(0, invulnerable - dt);
    if (pointer) {
      const distance = Math.hypot(pointer.x - player.x, pointer.y - player.y);
      const step = Math.min(1, PLAYER_SPEED * 1.5 * dt / (distance || 1));
      player.x += (pointer.x - player.x) * step;
      player.y += (pointer.y - player.y) * step;
    }
    player.x = Math.max(16, Math.min(WIDTH - 16, player.x));
    player.y = Math.max(18, Math.min(HEIGHT - 18, player.y));
    fireCooldown -= dt;
    if (fireCooldown <= 0) {
      audio.play("shoot");
      for (let i = 0; i < weapon; i++) {
        bullets.push({ x: player.x + (i - (weapon - 1) / 2) * 10, y: player.y - 14, vx: 0, vy: -420, hostile: false });
      }
      fireCooldown = FIRE_INTERVAL;
    }
    for (const enemy of enemies) {
      enemy.age += dt;
      if (enemy.age < 0) continue;
      enemy.y += sector.enemySpeed * dt;
      if (enemy.kind === "boss") enemy.y = Math.min(100, enemy.y);
      enemy.fire -= dt;
      if (enemy.fire <= 0 && enemy.y > 0 && enemy.y < HEIGHT - 25) {
        audio.play("enemyShot");
        for (const vx of enemy.kind === "boss" ? [-40, 0, 40] : [0]) {
          bullets.push({ x: enemy.x, y: enemy.y + ENEMY_TYPES[enemy.kind].scale * 5, vx, vy: 105, hostile: true });
        }
        enemy.fire = ENEMY_TYPES[enemy.kind].fireInterval * (1 + (enemy.id % 3) * .2);
      }
      const collisionSize = ENEMY_TYPES[enemy.kind].scale * 4 + 12;
      if (Math.abs(enemy.x - player.x) < collisionSize && Math.abs(enemy.y - player.y) < collisionSize) damage();
      if (mode !== "playing") return;
    }
    for (const bullet of bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.hostile) {
        if (Math.abs(bullet.x - player.x) < 10 && Math.abs(bullet.y - player.y) < 12) { bullet.y = HEIGHT + 40; damage(); }
      } else {
        const hit = enemies.find(e => e.y > -10 && !defeated.has(e.id) && Math.abs(e.x - bullet.x) < ENEMY_TYPES[e.kind].scale * 4.5 + 2 && Math.abs(e.y - bullet.y) < ENEMY_TYPES[e.kind].scale * 4.5 + 2);
        if (hit) {
          bullet.y = -40;
          hitEnemy(hit, 1);
        }
      }
      if (mode !== "playing") return;
    }
    if (hasMissiles) {
      missileCooldown = Math.max(0, missileCooldown - dt);
      if (missileCooldown === 0) {
        const target = randomTarget();
        if (target) {
          missiles.push({ x: player.x, y: player.y - 14, targetId: target.id, angle: -Math.PI / 2 });
          missileCooldown = MISSILE_INTERVAL;
          audio.play("missile");
        }
      }
    }
    missiles = missiles.filter(missile => {
      let target = enemies.find(e => e.id === missile.targetId && !defeated.has(e.id) && e.y >= 0 && e.y <= HEIGHT);
      if (!target) target = randomTarget();
      if (!target) return false;
      missile.targetId = target.id;
      const dx = target.x - missile.x;
      const dy = target.y - missile.y;
      const distance = Math.hypot(dx, dy);
      const travel = MISSILE_SPEED * dt;
      missile.angle = Math.atan2(dy, dx);
      if (distance <= travel + ENEMY_TYPES[target.kind].scale * 4.5) {
        hitEnemy(target, MISSILE_DAMAGE);
        return false;
      }
      missile.x += dx / distance * travel;
      missile.y += dy / distance * travel;
      return true;
    });
    enemies = enemies.filter(e => {
      if (defeated.has(e.id)) return false;
      if (e.y > HEIGHT + ENEMY_TYPES[e.kind].scale * 5) { escaped++; return false; }
      return true;
    });
    bullets = bullets.filter(b => b.y > -20 && b.y < HEIGHT + 20 && b.x > -20 && b.x < WIDTH + 20);
    pickups = pickups.filter(item => {
      item.y += HEART_FALL_SPEED * dt;
      if (Math.abs(item.x - player.x) < 20 && Math.abs(item.y - player.y) < 22) {
        audio.play(item.kind === "heart" ? "heart" : "upgrade");
        if (item.kind === "heart") {
          hearts = Math.min(MAX_HEARTS, hearts + 1);
          status.textContent = `Heart collected · ${hearts} hearts remaining`;
        } else if (sectorIndex >= 2 && weapon === 3 && !hasMissiles) {
          hasMissiles = true;
          missileCooldown = MISSILE_INTERVAL;
          status.textContent = "Homing missiles online · one launch every 5 seconds";
        } else {
          weapon = Math.min(sector.maxFire, weapon + 1);
          status.textContent = `Weapon upgrade · fire ×${weapon}`;
        }
        hud();
        return false;
      }
      return item.y < HEIGHT + 15;
    });
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);
    if (nextWave === sector.waves.length && enemies.length === 0) {
      finishDelay += dt;
      if (finishDelay >= 2 && !bullets.some(b => b.hostile) && pickups.length === 0) finish(true);
    }
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
      for (const [x, y, kind = "basic"] of SECTORS[sectorIndex].waves[0].formation) sprite(ENEMY, x, y + 125, ENEMY_TYPES[kind].scale);
    } else for (const e of enemies) if (e.age >= 0 && !defeated.has(e.id)) {
      sprite(ENEMY, e.x, e.y, ENEMY_TYPES[e.kind].scale);
      if (e.kind === "heavy") {
        ctx.fillRect(e.x - 10, e.y - 25, 20 * e.health / ENEMY_TYPES.heavy.health, 2);
      }
    }
    ctx.fillStyle = "#b8ffcb";
    for (const item of pickups) {
      sprite(item.kind === "heart" ? HEART : UPGRADE, item.x, item.y, 2);
    }
    for (const missile of missiles) {
      ctx.save();
      ctx.translate(missile.x, missile.y);
      ctx.rotate(missile.angle + Math.PI / 2);
      sprite(MISSILE, 0, 0, 2);
      ctx.fillRect(-1, 7, 2, 8);
      ctx.restore();
    }
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
    title.textContent = saved.stage === SECTORS.length ? "patrol_complete" : `patrol_0${sectorIndex + 1}`;
    message.textContent = saved.stage === SECTORS.length ? `All sectors complete. Score: ${score}.` : `Sector ${saved.stage} cleared. ${SECTORS[sectorIndex].waves.length} waves ahead. ${sectorIndex >= 2 ? "Collect ↑: double fire, triple fire, then homing missiles." : "Collect ↑ pickups to upgrade your fire."}`;
    start.textContent = saved.stage === SECTORS.length ? "[ fly again ]" : `[ enter sector ${sectorIndex + 1} ]`;
    status.textContent = saved.stage === SECTORS.length ? "All sectors complete" : `Sector ${sectorIndex + 1} ready`;
  }
  start.addEventListener("click", play);
  soundButton.addEventListener("pointerdown", e => { e.preventDefault(); });
  function toggleSound() {
    const muted = audio.toggleMute();
    soundButton.textContent = muted ? "sound [off] · S" : "sound [on] · S";
    soundButton.setAttribute("aria-pressed", String(muted));
    if (!muted) void audio.unlock();
  }
  soundButton.addEventListener("click", toggleSound);
  document.addEventListener("keydown", e => {
    if (e.code !== "KeyS" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
    e.preventDefault();
    toggleSound();
  });
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
  function suspend() { audio.stop(); pause(); }
  if (import.meta.env.DEV) {
    const panel = root.querySelector<HTMLElement>("[data-dev-controls]")!;
    const devInvincible = panel.querySelector<HTMLInputElement>("[data-dev-invincible]")!;
    const devSector = panel.querySelector<HTMLSelectElement>("[data-dev-sector]")!;
    const devWave = panel.querySelector<HTMLSelectElement>("[data-dev-wave]")!;
    const devFire = panel.querySelector<HTMLSelectElement>("[data-dev-fire]")!;
    const devMissiles = panel.querySelector<HTMLInputElement>("[data-dev-missiles]")!;
    function fillWaves() {
      const selectedSector = SECTORS[Number(devSector.value)];
      devWave.replaceChildren(...selectedSector.waves.map((wave, i) => new Option(`${i + 1} · ${wave.name.toLowerCase()}`, String(i))));
    }
    devSector.value = String(sectorIndex);
    fillWaves();
    panel.addEventListener("toggle", () => {
      devSector.value = String(sectorIndex);
      fillWaves();
      devWave.value = String(Math.max(0, nextWave - 1));
      devFire.value = String(weapon);
      devMissiles.checked = hasMissiles;
    }, true);
    devSector.addEventListener("change", fillWaves);
    devInvincible.addEventListener("change", () => { invincible = devInvincible.checked; });
    devFire.addEventListener("change", () => { weapon = Number(devFire.value); hud(); });
    devMissiles.addEventListener("change", () => {
      hasMissiles = devMissiles.checked;
      missileCooldown = MISSILE_INTERVAL;
      if (!hasMissiles) missiles = [];
      hud();
    });
    panel.querySelector<HTMLButtonElement>("[data-dev-jump]")!.addEventListener("click", () => {
      sectorIndex = Number(devSector.value);
      const waveIndex = Number(devWave.value);
      entryScore = 0;
      mode = "ready";
      play();
      nextWave = waveIndex;
      nextEnemyId = SECTORS[sectorIndex].waves.slice(0, waveIndex).reduce((total, wave) => total + wave.formation.length, 0);
      escaped = nextEnemyId;
      clock = SECTORS[sectorIndex].waves[waveIndex].at;
      weapon = Number(devFire.value);
      hasMissiles = devMissiles.checked;
      hud();
    });
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) suspend(); });
  window.addEventListener("blur", suspend);
  window.addEventListener("pagehide", suspend);
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
