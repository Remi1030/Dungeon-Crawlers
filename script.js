/* Dungeon Crawlers — vanilla JS game loop and UI. */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const mapData = {
  meadow: { name: 'SUNNY MEADOW', short: 'Sunny Meadow', theme: 'meadow', blurb: 'Warm light · gentle first crawl', accent: '#f4bb67', bg: '#417060', boss: 'MEADOW WARDEN', objective: 'CLEAR THE MEADOW' },
  moon: { name: 'MOONLIT VALLEYS', short: 'Moonlit Valleys', theme: 'moon', blurb: 'Quiet woods · watch the shadows', accent: '#91b8d4', bg: '#263d5c', boss: 'VALLEY WATCHER', objective: 'CLEAR THE VALLEY' },
  snow: { name: 'SNOWY TUNDRA', short: 'Snowy Tundra', theme: 'snow', blurb: 'Cold air · nowhere to hide', accent: '#d8eff0', bg: '#70929a', boss: 'FROST ANCIENT', objective: 'CLEAR THE TUNDRA' }
};
const weapons = {
  bow: { name: 'LONGBOW', glyph: '⌁', detail: 'Fast & far', damage: 18, cooldown: 310, speed: 7.5 },
  sword: { name: 'MOON SWORD', glyph: '╱', detail: 'Close & mighty', damage: 30, cooldown: 540, speed: 5.6 },
  katana: { name: 'STAR KATANA', glyph: '✧', detail: 'Sharp & steady', damage: 24, cooldown: 400, speed: 6.5 }
};
const abilities = {
  freeze: { name: 'FREEZE-ENEMY', short: 'FREEZE', glyph: '❄', detail: 'Slow every foe', color: '#99d6d5' },
  ink: { name: 'SQUID-INK', short: 'INK', glyph: '●', detail: 'Hide in a cloud', color: '#aab3ec' },
  force: { name: 'FORCE-FIELD', short: 'FIELD', glyph: '◉', detail: 'Block one hit', color: '#efb778' }
};
const defaultProfile = { coins: 150, highest: 1, history: [], shop: { lantern: false, heart: false, freeze: false } };
let profile = loadProfile();
let selection = { weapon: 'bow', ability: 'freeze', map: 'meadow' };
let game = null;
let loopId = null;
let lastFrame = 0;
let joystickVector = { x: 0, y: 0 };
let keys = {};
let soundOn = true;
let shakeOn = true;
let confettiCleanup = null;
let textScale = window.innerWidth <= 600 ? 1.35 : 2;
let baseTextSizes = new WeakMap();

function applyLargeText() {
  const textElements = [...document.querySelectorAll('*')].filter(element => !element.matches('.icon-button, .history-details-button, .coin-icon, .brand-mark, .rank-sigil, .rank-arrow, .summary-icon, .option-glyph, .shop-glyph, .end-sigil, .joy-arrow, .exit-objective, .exit-objective *, .pickup-toast, #game-objective') && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
  textElements.forEach(element => {
    if (!baseTextSizes.has(element)) baseTextSizes.set(element, parseFloat(getComputedStyle(element).fontSize));
    element.style.fontSize = `${baseTextSizes.get(element) * textScale}px`;
  });
}
function updateTextScale() { const nextScale = window.innerWidth <= 600 ? 1.35 : 2; if (nextScale !== textScale) { textScale = nextScale; applyLargeText(); } }

function markTouchCapability() {
  const supportsTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window || window.matchMedia?.('(pointer: coarse)').matches;
  document.documentElement.classList.toggle('touch-capable', supportsTouch);
}

function loadProfile() {
  try { return { ...defaultProfile, ...JSON.parse(localStorage.getItem('dungeon-crawlers-profile') || '{}') }; }
  catch { return { ...defaultProfile }; }
}
function saveProfile() { localStorage.setItem('dungeon-crawlers-profile', JSON.stringify(profile)); }
function formatLevel(level) { return String(level).padStart(2, '0'); }
function titleForLevel(level, won = false) { return won ? `LEVEL ${level} CHALLENGER` : level >= 10 ? `LEVEL ${level} VETERAN` : level >= 5 ? `LEVEL ${level} FIGHTER` : `LEVEL ${level} ROOKIE`; }
function formatRunTime(milliseconds) { const totalSeconds = Math.max(0, Math.round(milliseconds / 1000)); return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`; }
function statusTier(level, won = false) { return won ? 4 : level >= 10 ? 3 : level >= 5 ? 2 : 1; }
function savedStatusTier() { if (Number.isFinite(profile.statusTier)) return profile.statusTier; const wonFinal = profile.history?.some(run => run.result && run.level >= 15); return statusTier(profile.highest, wonFinal); }
function random(min, max) { return Math.random() * (max - min) + min; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function showScreen(id) {
  $$('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
  $$('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.view === id.replace('-screen', '')));
  window.scrollTo(0, 0);
  if (id === 'history-screen') renderHistory();
  if (id === 'shop-screen') renderShop();
  updateProfileUi();
}
function openModal(id) { $('#modal-layer').classList.add('open'); $('#modal-layer').setAttribute('aria-hidden', 'false'); $$('.modal-card').forEach(card => card.classList.toggle('open', card.id === id)); }
function closeModal() { $('#modal-layer').classList.remove('open'); $('#modal-layer').setAttribute('aria-hidden', 'true'); $$('.modal-card').forEach(card => card.classList.remove('open')); }
function updateProfileUi() {
  const coins = profile.coins;
  ['home-coins', 'history-coins', 'shop-coins', 'game-coins'].forEach(id => { const el = $('#' + id); if (el) el.textContent = coins; });
  const rank = $('#highest-rank'); if (rank) rank.textContent = titleForLevel(profile.highest);
}

function renderOptions() {
  $('#weapon-options').innerHTML = Object.entries(weapons).map(([key, item]) => `<button class="option-card ${selection.weapon === key ? 'selected' : ''}" data-select="weapon" data-value="${key}"><span class="option-glyph">${item.glyph}</span><strong>${item.name}</strong><small>${item.detail}</small><span class="select-check">✓</span></button>`).join('');
  $('#ability-options').innerHTML = Object.entries(abilities).map(([key, item]) => `<button class="option-card ${selection.ability === key ? 'selected' : ''}" data-select="ability" data-value="${key}"><span class="option-glyph">${item.glyph}</span><strong>${item.name}</strong><small>${item.detail}</small><span class="select-check">✓</span></button>`).join('');
  $('#map-options').innerHTML = Object.entries(mapData).map(([key, item], index) => `<button class="map-card ${selection.map === key ? 'selected' : ''}" data-map="${item.theme}" data-select="map" data-value="${key}"><span class="map-no">0${index + 1}</span><div class="map-card-content"><strong>${item.name}</strong><small>${item.blurb}</small></div></button>`).join('');
  $('#loadout-summary').textContent = `${weapons[selection.weapon].name} · ${abilities[selection.ability].name} · ${mapData[selection.map].name}`;
  applyLargeText();
}

function renderHistory() {
  const list = $('#history-list');
  if (!profile.history.length) { list.innerHTML = '<div class="history-empty">NO RUNS LOGGED YET — YOUR FIRST DESCENT IS WAITING.</div>'; applyLargeText(); return; }
  list.innerHTML = profile.history.slice().reverse().map((run, index) => `<div class="history-row"><span>${run.date}</span><div><strong>${run.result ? 'GOLDEN KEYCARD' : 'DUNGEON RUN'}</strong><small>${run.map} · ${run.weapon}</small></div><div><small>REACHED</small><strong>LEVEL ${formatLevel(run.level)}</strong></div><span class="history-result ${run.result ? 'won' : 'lost'}">${run.result ? 'COMPLETE' : 'FALLEN'}</span><button class="history-details-button" data-run-details="${profile.history.length - 1 - index}" aria-label="View details for ${run.date}'s run" title="View run details">📖</button></div>`).join('');
  applyLargeText();
}
function showRunDetails(run) {
  $('#history-details-date').textContent = run.date || 'DUNGEON RECORD';
  $('#history-details-result').textContent = run.result ? 'GOLDEN KEYCARD CLAIMED' : 'RUN ENDED';
  $('#history-details-result').className = `history-details-result ${run.result ? 'won' : 'lost'}`;
  $('#history-details-rank').textContent = titleForLevel(run.level, run.result);
  $('#history-details-level').textContent = formatLevel(run.level);
  $('#history-details-enemies').textContent = Number.isFinite(Number(run.enemies)) ? run.enemies : '—';
  $('#history-details-time').textContent = Number.isFinite(Number(run.time)) ? formatRunTime(run.time) : '—';
  $('#history-details-coins').textContent = `+${Number(run.coins) || 50}`;
  $('#history-details-weapon').textContent = run.weapon || '—';
  $('#history-details-map').textContent = run.map || '—';
  openModal('history-details-modal');
}
function renderShop() {
  const items = [
    { id: 'lantern', glyph: '☼', name: 'WAYFINDER LANTERN', description: 'Your arena begins a little brighter.', cost: 75 },
    { id: 'heart', glyph: '♥', name: 'SPARE HEART', description: 'Start your next run with a fourth heart.', cost: 125 },
    { id: 'freeze', glyph: '❄', name: 'FREEZE BONUS', description: 'Start your next run with one extra ability charge.', cost: 100 }
  ];
  $('#shop-list').innerHTML = items.map(item => { const owned = profile.shop[item.id]; return `<article class="shop-card"><span class="shop-glyph">${item.glyph}</span><strong>${item.name}</strong><p>${item.description}</p><button data-buy="${item.id}" data-cost="${item.cost}" ${owned ? 'disabled' : ''}>${owned ? 'OWNED' : `${item.cost} COINS · BUY`}</button></article>`; }).join(''); applyLargeText();
}

function bindUi() {
  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { const view = viewButton.dataset.view; showScreen(`${view}-screen`); return; }
    const action = event.target.closest('[data-action]');
    const select = event.target.closest('[data-select]');
    if (select) { selection[select.dataset.select] = select.dataset.value; renderOptions(); return; }
    const buy = event.target.closest('[data-buy]');
    if (buy && !buy.disabled) { const cost = Number(buy.dataset.cost); if (profile.coins >= cost) { profile.coins -= cost; profile.shop[buy.dataset.buy] = true; saveProfile(); renderShop(); updateProfileUi(); showPickup(`${buy.dataset.buy.toUpperCase()} ADDED TO YOUR KIT`); } return; }
    const detailsButton = event.target.closest('[data-run-details]');
    if (detailsButton) { const run = profile.history[Number(detailsButton.dataset.runDetails)]; if (run) showRunDetails(run); return; }
    if (event.target.closest('[data-close-modal]')) closeModal();
  });
  $('#home-start-button').addEventListener('click', () => { showScreen('loadout-screen'); renderOptions(); });
  $('#begin-run-button').addEventListener('click', startRun);
  $('#tutorial-button').addEventListener('click', () => openModal('tutorial-modal'));
  $('#quit-run-button').addEventListener('click', () => { if (game) finishRun(false, 'RUN ABANDONED'); });
  $('#end-home-button').addEventListener('click', () => { closeModal(); showScreen('home-screen'); });
  $('#end-primary-button').addEventListener('click', () => { closeModal(); showScreen('loadout-screen'); renderOptions(); });
  window.addEventListener('keydown', event => { keys[event.key.toLowerCase()] = true; if (event.key === 'Shift' && !event.repeat) { event.preventDefault(); useAbility(); } if (event.code === 'Space') { event.preventDefault(); shoot(); } });
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#modal-layer').classList.contains('open')) { event.preventDefault(); closeModal(); } });
  window.addEventListener('keyup', event => { keys[event.key.toLowerCase()] = false; });
  $('#fire-button').addEventListener('pointerdown', event => { event.preventDefault(); shoot(); });
  $('#ability-button').addEventListener('pointerdown', event => { event.preventDefault(); useAbility(); });
  setupJoystick();
}

function setupJoystick() {
  const joystick = $('#joystick'); const knob = $('#joystick-knob'); let active = false;
  const move = event => { if (!active) return; const rect = joystick.getBoundingClientRect(); const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; const max = 36; const dx = event.clientX - center.x; const dy = event.clientY - center.y; const distance = Math.hypot(dx, dy) || 1; const scale = Math.min(1, max / distance); const x = dx * scale; const y = dy * scale; knob.style.transform = `translate(${x}px, ${y}px)`; joystickVector = { x: x / max, y: y / max }; };
  const reset = () => { active = false; joystickVector = { x: 0, y: 0 }; knob.style.transform = ''; };
  joystick.addEventListener('pointerdown', event => { active = true; joystick.setPointerCapture(event.pointerId); move(event); }); joystick.addEventListener('pointermove', move); joystick.addEventListener('pointerup', reset); joystick.addEventListener('pointercancel', reset);
}

function startRun() {
  closeModal(); showScreen('game-screen');
  game = { level: 1, map: selection.map, weapon: selection.weapon, ability: selection.ability, hearts: profile.shop.heart ? 4 : 3, maxHearts: profile.shop.heart ? 4 : 3, coinsAtStart: profile.coins, world: { width: 0, height: 0 }, camera: { x: 0, y: 0 }, player: { x: 0, y: 0, radius: 13, invuln: 0, speed: 2.5 }, aim: { x: 1, y: 0 }, enemies: [], bullets: [], chests: [], walls: [], particles: [], boss: null, exit: null, abilityCharges: profile.shop.freeze ? 2 : 1, elapsed: 0, enemiesDefeated: 0, clear: false, complete: false, damageTimer: 0 };
  const arena = $('#arena-wrap'); arena.className = `arena-wrap theme-${mapData[game.map].theme}`; $('#exit-objective').classList.remove('show'); $('#ability-button').disabled = false; $('#ability-count').textContent = game.abilityCharges; $('#game-weapon').textContent = weapons[game.weapon].name; $('#ability-glyph').textContent = abilities[game.ability].glyph; $('#ability-label').textContent = abilities[game.ability].short; $('#game-coins').textContent = profile.coins; $('#game-objective').textContent = mapData[game.map].objective; $('#game-hint').innerHTML = 'MOVE WITH <strong>WASD</strong> OR THE JOYSTICK <span>·</span> FIRE WITH <strong>SPACE</strong> <span>·</span> ABILITY WITH <strong>SHIFT</strong>';
  resizeCanvas(); setupLevel(); showLevelToast(); cancelAnimationFrame(loopId); lastFrame = performance.now(); loopId = requestAnimationFrame(gameLoop);
}
function resizeCanvas() { const canvas = $('#game-canvas'); const rect = canvas.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
window.addEventListener('resize', () => { if (game) resizeCanvas(); updateTextScale(); });

function setupLevel() {
  const canvas = $('#game-canvas'); const w = canvas.clientWidth; const h = canvas.clientHeight;
  game.dungeon = makeDungeon(w, h); game.world = game.dungeon.world;
  game.player.x = game.dungeon.start.x; game.player.y = game.dungeon.start.y; game.player.invuln = 1200; game.bullets = []; game.particles = []; game.clear = false; game.exit = null;
  game.walls = game.dungeon.walls; game.enemies = []; $('#arena-wrap').classList.remove('exit-searching'); $('#exit-objective').classList.remove('show'); $('#game-objective').textContent = mapData[game.map].objective;
  const count = Math.min(5 + Math.floor(game.level * .9), 25);
  for (let i = 0; i < count; i++) game.enemies.push(makeEnemy(i, false));
  game.boss = makeEnemy(90, true); game.enemies.push(game.boss);
  game.chests = []; for (let i = 0; i < Math.min(3 + Math.floor(game.level / 3), 8); i++) { const point = randomDungeonPoint(100); game.chests.push({ x: point.x, y: point.y, opened: false, kind: Math.random() > .5 ? 'ability' : Math.random() > .55 ? 'heart' : 'nothing' }); }
  updateCamera();
  $('#boss-name').textContent = mapData[game.map].boss; $('#boss-health-bar').style.width = '100%'; updateHud();
}
function makeDungeon(viewWidth, viewHeight) {
  const tile = 86; const cols = 17 + Math.min(4, Math.floor(game.level / 4) * 2); const rows = 11 + Math.min(4, Math.floor(game.level / 4) * 2); const margin = 54; const world = { width: cols * tile + margin * 2, height: rows * tile + margin * 2 }; const grid = Array.from({ length: rows }, () => Array(cols).fill(false)); const directions = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  const shuffleDirections = () => directions.slice().sort(() => Math.random() - .5);
  const carve = (x, y) => { grid[y][x] = true; shuffleDirections().forEach(([dx, dy]) => { const nx = x + dx; const ny = y + dy; if (nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1 && !grid[ny][nx]) { grid[y + dy / 2][x + dx / 2] = true; carve(nx, ny); } }); };
  carve(1, 1);
  const roomCount = Math.min(4 + Math.floor(game.level * .55), 12); const rooms = []; const roomCandidates = [];
  for (let y = 1; y < rows - 1; y += 2) for (let x = 1; x < cols - 1; x += 2) if (grid[y][x]) roomCandidates.push({ x, y });
  roomCandidates.sort(() => Math.random() - .5); roomCandidates.slice(0, roomCount).forEach((cell, index) => { const radiusX = index % 3 === 0 ? 2 : 1; const radiusY = index % 2 === 0 ? 1 : 2; for (let y = Math.max(1, cell.y - radiusY); y <= Math.min(rows - 2, cell.y + radiusY); y++) for (let x = Math.max(1, cell.x - radiusX); x <= Math.min(cols - 2, cell.x + radiusX); x++) grid[y][x] = true; rooms.push({ x: margin + cell.x * tile - radiusX * tile + 12, y: margin + cell.y * tile - radiusY * tile + 12, width: (radiusX * 2 + 1) * tile - 24, height: (radiusY * 2 + 1) * tile - 24, tilt: random(-.018, .018) }); });
  const spawnPoints = []; for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) if (grid[y][x]) spawnPoints.push({ x: margin + x * tile + tile / 2, y: margin + y * tile + tile / 2 });
  const farthest = findFarthestDungeonCell(grid, { x: 1, y: 1 }); const start = { x: margin + tile * 1.5, y: margin + tile * 1.5 }; const exit = { x: margin + farthest.x * tile + tile / 2, y: margin + farthest.y * tile + tile / 2 }; const walls = makeMazeWalls(grid, margin, tile, world.width, world.height);
  return { world, grid, rooms, spawnPoints, start, exit, walls, viewWidth, viewHeight };
}
function findFarthestDungeonCell(grid, start) { const queue = [{ ...start, distance: 0 }]; const visited = new Set([`${start.x},${start.y}`]); let farthest = queue[0]; while (queue.length) { const current = queue.shift(); if (current.distance > farthest.distance) farthest = current; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const x = current.x + dx; const y = current.y + dy; const key = `${x},${y}`; if (grid[y]?.[x] && !visited.has(key)) { visited.add(key); queue.push({ x, y, distance: current.distance + 1 }); } }); } return farthest; }
function makeMazeWalls(grid, margin, tile, width, height) { const rows = grid.length; const cols = grid[0].length; const thickness = 14; const walls = []; const add = (x, y, wallWidth, wallHeight) => { if (wallWidth > 6 && wallHeight > 6) walls.push({ x, y, width: wallWidth, height: wallHeight }); }; add(margin, margin, width - margin * 2, thickness); add(margin, height - margin - thickness, width - margin * 2, thickness); add(margin, margin, thickness, height - margin * 2); add(width - margin - thickness, margin, thickness, height - margin * 2); for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) if (grid[y][x]) { const left = !grid[y][x - 1]; const right = !grid[y][x + 1]; const top = !grid[y - 1][x]; const bottom = !grid[y + 1][x]; const px = margin + x * tile; const py = margin + y * tile; if (left) add(px - thickness / 2, py, thickness, tile); if (right) add(px + tile - thickness / 2, py, thickness, tile); if (top) add(px, py - thickness / 2, tile, thickness); if (bottom) add(px, py + tile - thickness / 2, tile, thickness); } return walls; }
function randomDungeonPoint(minDistance = 0) { const points = game.dungeon?.spawnPoints || [{ x: game.world.width / 2, y: game.world.height / 2 }]; let point = points[Math.floor(Math.random() * points.length)]; let tries = 0; while (Math.hypot(point.x - game.player.x, point.y - game.player.y) < minDistance && tries < 80) { point = points[Math.floor(Math.random() * points.length)]; tries++; } return point; }
function makeEnemy(index, boss) { const point = randomDungeonPoint(boss ? 480 : 260); const scale = 1 + (game.level - 1) * .075; return { x: point.x, y: point.y, radius: boss ? 27 : 15, boss, health: (boss ? 250 : 40) * scale, maxHealth: (boss ? 250 : 40) * scale, speed: (boss ? .38 + game.level * .008 : .45 + game.level * .028), hit: 0, angle: random(0, Math.PI * 2), wander: random(0, 4), color: boss ? '#e28b61' : '#a4cfaa', dead: false, index }; }
function updateCamera() { if (!game) return; const canvas = $('#game-canvas'); game.camera.x = clamp(game.player.x - canvas.clientWidth / 2, 0, Math.max(0, game.world.width - canvas.clientWidth)); game.camera.y = clamp(game.player.y - canvas.clientHeight / 2, 0, Math.max(0, game.world.height - canvas.clientHeight)); }

function gameLoop(time) {
  if (!game) return; const dt = Math.min(34, time - lastFrame); lastFrame = time; if (!$('#modal-layer').classList.contains('open')) { game.elapsed += dt; updateGame(dt); } drawGame(); loopId = requestAnimationFrame(gameLoop);
}
function inputVector() { let x = joystickVector.x, y = joystickVector.y; if (keys.w || keys.arrowup) y -= 1; if (keys.s || keys.arrowdown) y += 1; if (keys.a || keys.arrowleft) x -= 1; if (keys.d || keys.arrowright) x += 1; const length = Math.hypot(x, y) || 1; return { x: clamp(x / length, -1, 1), y: clamp(y / length, -1, 1), active: Boolean(x || y) }; }
function updateGame(dt) {
  const input = inputVector(); const speed = game.player.speed * (dt / 16.67); const previousX = game.player.x; const previousY = game.player.y;
  if (input.active) { game.player.x += input.x * speed; game.player.y += input.y * speed; game.aim = { x: input.x, y: input.y }; }
  game.player.x = clamp(game.player.x, 55, game.world.width - 55); if (playerTouchesWall()) game.player.x = previousX;
  game.player.y = clamp(game.player.y, 78, game.world.height - 78); if (playerTouchesWall()) game.player.y = previousY;
  game.player.invuln = Math.max(0, game.player.invuln - dt); game.damageTimer = Math.max(0, game.damageTimer - dt);
  game.bullets.forEach(bullet => { bullet.x += bullet.vx * dt / 16.67; bullet.y += bullet.vy * dt / 16.67; bullet.life -= dt; }); game.bullets = game.bullets.filter(bullet => bullet.life > 0 && bullet.x > 25 && bullet.x < game.world.width - 25 && bullet.y > 60 && bullet.y < game.world.height - 40);
  game.enemies.forEach(enemy => { if (enemy.dead) return; enemy.hit = Math.max(0, enemy.hit - dt); const angle = Math.atan2(game.player.y - enemy.y, game.player.x - enemy.x); const distance = Math.hypot(game.player.x - enemy.x, game.player.y - enemy.y); if (game.frozenUntil > performance.now()) return; if (distance > (enemy.boss ? 90 : 38)) { enemy.x += Math.cos(angle) * enemy.speed * dt / 16.67; enemy.y += Math.sin(angle) * enemy.speed * dt / 16.67; } else if (game.damageTimer <= 0) { damagePlayer(enemy.boss ? 1 : 1); game.damageTimer = 900; } enemy.x = clamp(enemy.x, 65, game.world.width - 65); enemy.y = clamp(enemy.y, 88, game.world.height - 88); });
  game.bullets.forEach(bullet => { game.enemies.forEach(enemy => { if (enemy.dead) return; if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < enemy.radius + 7) { enemy.health -= bullet.damage; bullet.life = 0; enemy.hit = 130; burst(enemy.x, enemy.y, enemy.boss ? '#f4bb67' : '#8fd5b7', enemy.boss ? 8 : 4); if (enemy.health <= 0) defeatEnemy(enemy); } }); });
  game.chests.forEach(chest => { if (!chest.opened && Math.hypot(chest.x - game.player.x, chest.y - game.player.y) < 30) { chest.opened = true; if (chest.kind === 'ability') { game.abilityCharges++; $('#ability-count').textContent = game.abilityCharges; showPickup('ABILITY CHARGE FOUND'); } else if (chest.kind === 'heart') { game.hearts = Math.min(game.maxHearts, game.hearts + 1); showPickup('HEART RESTORED'); } else showPickup('AN EMPTY CHEST...'); burst(chest.x, chest.y, '#f4bb67', 12); } });
  game.particles.forEach(p => { p.x += p.vx * dt / 16.67; p.y += p.vy * dt / 16.67; p.life -= dt; p.vy += .03 * dt; }); game.particles = game.particles.filter(p => p.life > 0);
  const living = game.enemies.filter(enemy => !enemy.dead); if (!living.length && !game.clear) { game.clear = true; game.exit = { ...game.dungeon.exit }; showExitObjective(); }
  if (game.clear && game.exit && Math.hypot(game.exit.x - game.player.x, game.exit.y - game.player.y) < 55) { if (game.level >= 15) finishRun(true); else { game.level++; setupLevel(); showLevelToast(); } }
  updateCamera();
  updateHud();
}
function playerTouchesWall() { const p = game.player; return game.walls.some(wall => p.x + p.radius > wall.x && p.x - p.radius < wall.x + wall.width && p.y + p.radius > wall.y && p.y - p.radius < wall.y + wall.height); }
function defeatEnemy(enemy) { if (enemy.dead) return; enemy.dead = true; game.enemiesDefeated++; burst(enemy.x, enemy.y, enemy.boss ? '#f4bb67' : '#a4cfaa', enemy.boss ? 20 : 8); }
function damagePlayer(amount) { if (game.player.invuln > 0) return; if (game.shieldUntil > performance.now()) { game.shieldUntil = 0; showPickup('FORCE-FIELD BLOCKED THE HIT'); burst(game.player.x, game.player.y, '#efb778', 14); return; } game.hearts -= amount; game.player.invuln = 1300; burst(game.player.x, game.player.y, '#e88652', 13); if (shakeOn) $('#arena-wrap').animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 160 }); if (game.hearts <= 0) finishRun(false); }
function shoot() { if (!game || $('#modal-layer').classList.contains('open') || game.player.invuln < -1) return; const now = performance.now(); const weapon = weapons[game.weapon]; if (game.nextShot && now < game.nextShot) return; game.nextShot = now + weapon.cooldown; let aim = game.aim; const target = game.enemies.filter(e => !e.dead).sort((a, b) => Math.hypot(a.x - game.player.x, a.y - game.player.y) - Math.hypot(b.x - game.player.x, b.y - game.player.y))[0]; if (target && game.weapon !== 'sword') { const dist = Math.hypot(target.x - game.player.x, target.y - game.player.y); if (dist < 350) aim = { x: (target.x - game.player.x) / dist, y: (target.y - game.player.y) / dist }; } if (game.weapon === 'sword') { game.enemies.forEach(enemy => { if (!enemy.dead && Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) < 78) { enemy.health -= weapon.damage; enemy.hit = 170; if (enemy.health <= 0) defeatEnemy(enemy); } }); burst(game.player.x + aim.x * 35, game.player.y + aim.y * 35, '#f4bb67', 8); return; } game.bullets.push({ x: game.player.x + aim.x * 18, y: game.player.y + aim.y * 18, vx: aim.x * weapon.speed, vy: aim.y * weapon.speed, life: 1100, damage: weapon.damage }); burst(game.player.x + aim.x * 16, game.player.y + aim.y * 16, '#f4bb67', 3); }
function useAbility() { if (!game || game.abilityCharges <= 0) return; game.abilityCharges--; $('#ability-count').textContent = game.abilityCharges; const now = performance.now(); if (game.ability === 'freeze') { game.frozenUntil = now + 4500; showPickup('ALL ENEMIES FROZEN'); } else if (game.ability === 'ink') { game.hiddenUntil = now + 5000; showPickup('SQUID-INK CLOUD · HIDDEN'); } else { game.shieldUntil = now + 6000; showPickup('FORCE-FIELD ACTIVE'); } if (game.abilityCharges <= 0) $('#ability-button').disabled = true; }
function burst(x, y, color, count = 5) { for (let i = 0; i < count; i++) game.particles.push({ x, y, vx: random(-2.5, 2.5), vy: random(-2.5, 2.5), life: random(280, 660), maxLife: 660, color, size: random(1.5, 4) }); }
function updateHud() { if (!game) return; $('#game-level').textContent = formatLevel(game.level); $('#game-map-name').textContent = mapData[game.map].name; $('#heart-display').textContent = `${'♥ '.repeat(Math.max(0, game.hearts)).trim()}${game.hearts < game.maxHearts ? ` ${'♡ '.repeat(game.maxHearts - game.hearts).trim()}` : ''}`; $('#objective-progress-bar').style.width = `${Math.max(0, Math.min(100, (1 - game.enemies.filter(e => !e.dead).length / (game.enemies.length || 1)) * 100))}%`; if (game.boss) $('#boss-health-bar').style.width = `${Math.max(0, game.boss.health / game.boss.maxHealth * 100)}%`; }
function showLevelToast() { const toast = $('#level-toast'); toast.querySelector('strong').textContent = mapData[game.map].name; toast.querySelector('span').textContent = `LEVEL ${formatLevel(game.level)}`; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1700); }
function showPickup(message) { const el = $('#pickup-toast'); el.textContent = message; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1800); }
function showExitObjective() { $('#game-objective').textContent = 'FIND THE EXIT'; $('#exit-objective').classList.add('show'); $('#arena-wrap').classList.add('exit-searching'); }
function celebrateRun() { const modal = $('#end-modal'); const confetti = $('#run-confetti'); const colors = ['#f4bb67', '#4fd2bf', '#e88652', '#aab3ec', '#f3f0e7']; clearTimeout(confettiCleanup); confetti.replaceChildren(); for (let i = 0; i < 36; i++) { const piece = document.createElement('i'); piece.style.left = `${random(4, 96)}%`; piece.style.setProperty('--drift', `${random(-70, 70)}px`); piece.style.setProperty('--turn', `${random(260, 760)}deg`); piece.style.setProperty('--duration', `${random(2.4, 3.6)}s`); piece.style.animationDelay = `${random(-2.8, 0)}s`; piece.style.background = colors[i % colors.length]; piece.style.width = `${random(5, 9)}px`; piece.style.height = `${random(7, 13)}px`; confetti.append(piece); } confetti.classList.remove('active'); void confetti.offsetWidth; confetti.classList.add('active'); modal.classList.remove('celebrating'); void modal.offsetWidth; modal.classList.add('celebrating'); confettiCleanup = setTimeout(() => { confetti.classList.remove('active'); confetti.replaceChildren(); modal.classList.remove('celebrating'); }, 5000); }

function drawGame() {
  const canvas = $('#game-canvas'); const ctx = canvas.getContext('2d'); const w = canvas.clientWidth; const h = canvas.clientHeight; const map = mapData[game.map]; ctx.clearRect(0, 0, w, h); ctx.fillStyle = map.bg; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.translate(-game.camera.x, -game.camera.y); drawBackdrop(ctx); drawRooms(ctx); drawWalls(ctx); game.chests.forEach(chest => drawChest(ctx, chest)); if (game.exit) drawExit(ctx, game.exit); game.particles.forEach(p => { ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1; game.enemies.filter(e => !e.dead).forEach(enemy => drawEnemy(ctx, enemy)); game.bullets.forEach(bullet => drawBullet(ctx, bullet)); drawPlayer(ctx); ctx.restore(); }
function drawBackdrop(ctx) { const w = game.world.width; const h = game.world.height; ctx.fillStyle = mapData[game.map].bg; ctx.fillRect(0, 0, w, h); ctx.save(); ctx.globalAlpha = .17; ctx.strokeStyle = game.map === 'snow' ? '#e9fbef' : game.map === 'moon' ? '#8fb0cb' : '#d5ecad'; ctx.lineWidth = 1; for (let i = 0; i < Math.ceil(w / 110); i++) { const x = (i * 113 + 37) % w, y = 90 + ((i * 79) % Math.max(1, h - 160)); ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = .08; for (let x = 0; x < w; x += 95) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h * .7, h); ctx.stroke(); } ctx.restore(); }
function drawRooms(ctx) { const roomColor = game.map === 'snow' ? 'rgba(225,246,240,.10)' : game.map === 'moon' ? 'rgba(137,171,207,.11)' : 'rgba(210,237,174,.10)'; const roomLine = game.map === 'snow' ? 'rgba(225,246,240,.27)' : game.map === 'moon' ? 'rgba(137,171,207,.25)' : 'rgba(210,237,174,.23)'; game.dungeon.rooms.forEach(room => { ctx.save(); ctx.translate(room.x + room.width / 2, room.y + room.height / 2); ctx.rotate(room.tilt); ctx.fillStyle = roomColor; ctx.strokeStyle = roomLine; ctx.lineWidth = 2; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-room.width / 2, -room.height / 2, room.width, room.height, 18); else ctx.rect(-room.width / 2, -room.height / 2, room.width, room.height); ctx.fill(); ctx.stroke(); ctx.restore(); }); }
function drawWalls(ctx) { game.walls.forEach(wall => { ctx.fillStyle = 'rgba(6, 22, 25, .52)'; ctx.fillRect(wall.x + 4, wall.y + 5, wall.width, wall.height); ctx.fillStyle = game.map === 'snow' ? '#425f64' : game.map === 'moon' ? '#1c3045' : '#275546'; ctx.fillRect(wall.x, wall.y, wall.width, wall.height); ctx.strokeStyle = game.map === 'snow' ? 'rgba(216,239,240,.25)' : 'rgba(190,233,188,.2)'; ctx.strokeRect(wall.x, wall.y, wall.width, wall.height); }); }
function drawChest(ctx, chest) { ctx.save(); ctx.translate(chest.x, chest.y); ctx.globalAlpha = chest.opened ? .37 : 1; ctx.fillStyle = '#b47742'; ctx.fillRect(-13, -9, 26, 19); ctx.fillStyle = '#f3c06c'; ctx.fillRect(-13, -10, 26, 5); ctx.fillStyle = '#6a3d2e'; ctx.fillRect(-2, -8, 4, 17); ctx.strokeStyle = '#f3c06c'; ctx.strokeRect(-13, -9, 26, 19); if (!chest.opened) { ctx.shadowColor = '#f3c06c'; ctx.shadowBlur = 14; ctx.fillStyle = '#f3c06c'; ctx.beginPath(); ctx.arc(0, -14, 2, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
function drawExit(ctx, exit) { ctx.save(); ctx.translate(exit.x, exit.y); ctx.rotate(Math.PI / 4); ctx.strokeStyle = '#e4ca75'; ctx.lineWidth = 3; ctx.shadowColor = '#f4bb67'; ctx.shadowBlur = 20; ctx.strokeRect(-18, -18, 36, 36); ctx.rotate(-Math.PI / 4); ctx.fillStyle = '#f4bb67'; ctx.font = '16px DM Mono'; ctx.textAlign = 'center'; ctx.fillText('EXIT', 0, 35); ctx.restore(); }
function drawEnemy(ctx, enemy) { ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(enemy.angle); if (enemy.boss) { ctx.shadowColor = enemy.color; ctx.shadowBlur = 18; ctx.strokeStyle = enemy.hit ? '#fff4bf' : enemy.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(18,26,29,.8)'; ctx.fill(); ctx.fillStyle = enemy.color; ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(8, -7); ctx.lineTo(21, -6); ctx.lineTo(11, 5); ctx.lineTo(15, 19); ctx.lineTo(0, 11); ctx.lineTo(-15, 19); ctx.lineTo(-11, 5); ctx.lineTo(-21, -6); ctx.lineTo(-8, -7); ctx.closePath(); ctx.fill(); } else { ctx.fillStyle = enemy.hit ? '#fff2b6' : enemy.color; ctx.beginPath(); ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#193a36'; ctx.beginPath(); ctx.arc(5, -4, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(-5, -4, 2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#244d45'; ctx.beginPath(); ctx.moveTo(-10, 9); ctx.lineTo(-16, 15); ctx.moveTo(10, 9); ctx.lineTo(16, 15); ctx.stroke(); } ctx.restore(); }
function drawBullet(ctx, bullet) { ctx.save(); ctx.strokeStyle = '#f4d18a'; ctx.lineWidth = 3; ctx.shadowColor = '#f4bb67'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(bullet.x - bullet.vx * 1.5, bullet.y - bullet.vy * 1.5); ctx.lineTo(bullet.x, bullet.y); ctx.stroke(); ctx.restore(); }
function drawPlayer(ctx) { const p = game.player; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(game.aim.y, game.aim.x)); ctx.globalAlpha = p.invuln > 0 && Math.floor(performance.now() / 100) % 2 ? .42 : 1; ctx.fillStyle = '#e9ecdc'; ctx.shadowColor = '#f4bb67'; ctx.shadowBlur = 15; ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#173039'; ctx.beginPath(); ctx.arc(3, -4, 2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#f4bb67'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, 3); ctx.lineTo(25, 3); ctx.stroke(); ctx.fillStyle = '#f4bb67'; ctx.beginPath(); ctx.moveTo(26, 3); ctx.lineTo(19, -2); ctx.lineTo(19, 8); ctx.closePath(); ctx.fill(); if (game.shieldUntil > performance.now()) { ctx.strokeStyle = '#efb778'; ctx.globalAlpha = .55; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke(); } if (game.hiddenUntil > performance.now()) { ctx.strokeStyle = '#abb6ea'; ctx.globalAlpha = .25; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); }

function finishRun(won, overrideMessage) { if (!game || game.complete) return; game.complete = true; cancelAnimationFrame(loopId); const reached = game.level; const earned = 50; const pastBestFloor = Math.max(profile.highest || 1, ...profile.history.map(run => Number(run.level) || 0)); const pastBestEnemies = Math.max(0, ...profile.history.map(run => Number(run.enemies) || 0)); const previousStatusTier = savedStatusTier(); const currentStatusTier = statusTier(reached, won); const newStatus = currentStatusTier > previousStatusTier; profile.statusTier = Math.max(previousStatusTier, currentStatusTier); profile.coins += earned; profile.highest = Math.max(profile.highest, reached); profile.history.push({ date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase(), level: reached, enemies: game.enemiesDefeated, time: game.elapsed, coins: earned, map: mapData[game.map].short, weapon: weapons[game.weapon].name, result: won }); profile.history = profile.history.slice(-20); saveProfile(); $('#end-kicker').textContent = won ? 'THE GOLDEN KEYCARD IS YOURS' : overrideMessage || 'THE RUN ENDS HERE'; $('#end-sigil').textContent = won ? '✦' : '×'; $('#end-title').innerHTML = won ? `LEVEL ${reached}<br><em>CHALLENGER.</em>` : `LEVEL ${formatLevel(reached)}<br><em>FIGHTER.</em>`; $('#end-message').textContent = won ? 'Fifteen floors. One golden keycard. The dungeon knows your name now.' : 'The dungeon keeps its secrets. Your next run can go deeper.'; $('#end-status-achievement').hidden = !newStatus; $('#end-rank').textContent = titleForLevel(reached, won); $('#end-level').textContent = formatLevel(reached); $('#end-level-best').textContent = `PAST BEST: ${formatLevel(pastBestFloor)}`; $('#end-enemies').textContent = game.enemiesDefeated; $('#end-enemies-best').textContent = `PAST BEST: ${pastBestEnemies}`; $('#end-time').textContent = formatRunTime(game.elapsed); $('#end-coins').textContent = `+${earned}`; $('#end-weapon').textContent = weapons[game.weapon].name; $('#end-map').textContent = mapData[game.map].short; $('#end-primary-button').textContent = won ? 'START ANOTHER RUN ↗' : 'TRY AGAIN ↗'; openModal('end-modal'); celebrateRun(); updateProfileUi(); }

markTouchCapability(); renderOptions(); updateProfileUi(); bindUi();
