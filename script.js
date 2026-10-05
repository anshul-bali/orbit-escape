/* ============================================================
   ORBIT ESCAPE
   Neon arcade survival: orbit -> fight -> launch -> survive.
   Vanilla JS + HTML5 Canvas. No frameworks, no backend.

   Modules: Game · Ship · Planet · Turret · Enemy · Bullet
            Asteroid · Fireball · Meteor · Pickup · PowerUp
            Particle · ParticleSystem · Camera · Sfx · Radar
   ============================================================ */
(() => {
'use strict';

/* ------------------------------------------------------------
   0. math / storage helpers
   ------------------------------------------------------------ */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[(Math.random() * a.length) | 0];
const chance = (p) => Math.random() < p;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const mod = (n, m) => ((n % m) + m) % m;
const hyp = Math.hypot;
const d2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const dst = (ax, ay, bx, by) => hyp(ax - bx, ay - by);
function angLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return a + d * t;
}
function angDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
}
/* squared distance from point (px,py) to segment (ax,ay)->(bx,by) */
function segPointDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};

/* ------------------------------------------------------------
   1. world + balance constants
   ------------------------------------------------------------ */
const ARENA = { w: 3000, h: 2000 };        // bounded play field
const CELLS = { cols: 6, rows: 3 };        // 18 planet slots -> always reachable
const PLANET_COUNT = CELLS.cols * CELLS.rows;

const CFG = {
  shipR: 10,
  launchMul: 1.8,
  thrust: 360,          // WASD acceleration in free flight
  boostAccel: 1150,
  boostMul: 1.55,
  boostRecharge: 0.55,
  maxSpeed: 780,
  orbitGap: 22,
  gravK: 430,           // pull inside a capture well
  catchBase: 88,
  catchMin: 56,
  orbitSlow: 162,
  orbitFast: 252,
  fuelIdle: 0.9,        // % per second while flying unpowered
  fuelThrust: 7.5,
  fuelBoost: 26,
  fuelOrbit: 0.25,      // minimal drain while safely orbiting
  shieldRegen: 9,
  shieldDelay: 3.4,
  hullMax: 100,
  shieldMax: 50,
  ammoMax: 90,
  ammoStart: 44,
  mslMax: 5,
  mslStart: 3,
  cannonCd: 0.115,
  cannonSpeed: 940,
  cannonDmg: 11,
  mslCd: 1.15,
  lockTime: 0.55,
  bulletLife: 1.25,
  maxEnemies: 8,
  maxAsteroids: 22,
  maxFireballs: 6,
  maxMeteors: 16,
  maxBullets: 220,
  maxParticles: 900,
  maxPickups: 26,
  grazePad: 40,
};

const SCORE = {
  planet: 100, scout: 50, fighter: 100, heavy: 250, missileShip: 150,
  drone: 75, turret: 75, enemyMissile: 25, dodge: 15, shower: 200, rare: 120,
};

const FACTION = {
  friendly: { hue: 186, sat: 92, label: 'FRIENDLY', symbol: '+', reward: 1 },
  neutral:  { hue: 262, sat: 80, label: 'NEUTRAL',  symbol: 'o', reward: 1 },
  enemy:    { hue: 18,  sat: 95, label: 'ENEMY',    symbol: 'x', reward: 1.6 },
  supply:   { hue: 46,  sat: 96, label: 'SUPPLY',   symbol: '$', reward: 1.3 },
  danger:   { hue: 344, sat: 96, label: 'DANGER',   symbol: '!', reward: 2.4 },
};

const KIND = {
  normal:  { label: '' },
  fast:    { label: 'FAST ORBIT' },
  gravity: { label: 'GRAVITY WELL' },
  boost:   { label: 'BOOST' },
};

const NAMES_A = ['Kepler', 'Vesper', 'Nova', 'Aeon', 'Cinder', 'Halcyon', 'Lumen', 'Pyra',
  'Thule', 'Ymir', 'Zephyr', 'Orris', 'Kessel', 'Duna', 'Erebus', 'Nyx', 'Tycho', 'Vantaa',
  'Aster', 'Cobalt', 'Draco', 'Ember', 'Ferro', 'Gliese', 'Hyperion', 'Jackal', 'Kairos',
  'Lacerta', 'Mira', 'Nibel', 'Castor', 'Rhea'];
const NAMES_B = ['Prime', 'Minor', 'Beta', 'Secundus', 'Echo', 'Rift', 'Vale', 'Drift',
  'Hollow', 'Crown', 'Deep', 'Ash', 'Bloom', 'Gate', 'Reach', 'IX', 'IV', 'VII', 'XII', '42'];

/* ------------------------------------------------------------
   2. DOM
   ------------------------------------------------------------ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const $ = (id) => document.getElementById(id);
const dom = {
  vignette: $('vignette'), edgeWarn: $('edgeWarn'), flash: $('flash'), banner: $('banner'),
  hud: $('hud'), score: $('score'), best: $('best'), combo: $('combo'), comboVal: $('comboVal'),
  hullFill: $('hullFill'), hullVal: $('hullVal'), shieldFill: $('shieldFill'), shieldVal: $('shieldVal'),
  fuelFill: $('fuelFill'), fuelVal: $('fuelVal'), fuelBar: document.querySelector('.gauge.fuel'),
  threat: $('threat'), threatVal: $('threatVal'), threatPips: $('threatPips'), target: $('target'),
  ammoVal: $('ammoVal'), ammoMax: $('ammoMax'), mslVal: $('mslVal'), mslMax: $('mslMax'),
  mods: $('mods'), tip: $('tip'),
  pauseBtn: $('pauseBtn'), muteBtn: $('muteBtn'),
  touch: $('touch'), tLaunch: $('tLaunch'), tFire: $('tFire'), tMsl: $('tMsl'), tBoost: $('tBoost'),
  startScreen: $('startScreen'), pauseScreen: $('pauseScreen'), overScreen: $('overScreen'),
  startBtn: $('startBtn'), resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'), restartBtn: $('restartBtn'),
  finalScore: $('finalScore'), finalBest: $('finalBest'), finalPlanets: $('finalPlanets'),
  finalKills: $('finalKills'), newBest: $('newBest'), overReason: $('overReason'),
};

/* ------------------------------------------------------------
   3. input
   ------------------------------------------------------------ */
const IN = {
  keys: Object.create(null),
  mx: 0, my: 0, cx: 0, cy: 0, mouseSeen: false,
  fire: false, missile: false, boost: false,
  touch: false,
};

/* ------------------------------------------------------------
   4. Sfx — Web Audio synth, no assets
   ------------------------------------------------------------ */
class Sfx {
  constructor() {
    this.ac = null; this.master = null;
    this.muted = store.get('oe.muted', false);
  }
  ready() {
    if (this.ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(this.ac.destination);
    } catch (e) { return false; }
    return true;
  }
  resume() { if (this.ready() && this.ac.state === 'suspended') this.ac.resume(); }
  tone(o) {
    if (this.muted || !this.ready()) return;
    const ac = this.ac, t = ac.currentTime + (o.at || 0), dur = o.dur || 0.15;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(24, o.to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.18, t + (o.att || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.03);
  }
  noise(dur, vol, from, to, type) {
    if (this.muted || !this.ready()) return;
    const ac = this.ac, t = ac.currentTime;
    const n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }
  launch() { this.tone({ freq: 360, to: 780, type: 'triangle', dur: 0.12, vol: 0.15 }); }
  capture(step) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5];
    const f = scale[clamp(step, 0, scale.length - 1)];
    this.tone({ freq: f, type: 'sine', dur: 0.26, vol: 0.19 });
    this.tone({ freq: f * 1.5, type: 'sine', dur: 0.2, vol: 0.08, at: 0.04 });
  }
  shoot() { this.tone({ freq: 900, to: 320, type: 'square', dur: 0.05, vol: 0.05 }); }
  missile() { this.noise(0.3, 0.16, 900, 200); this.tone({ freq: 220, to: 640, type: 'sawtooth', dur: 0.28, vol: 0.1 }); }
  lock() { this.tone({ freq: 1320, type: 'square', dur: 0.05, vol: 0.06 }); }
  hit() { this.noise(0.09, 0.18, 2600, 500, 'bandpass'); }
  shieldHit() { this.tone({ freq: 620, to: 1450, type: 'sine', dur: 0.16, vol: 0.13 }); }
  kill(step) {
    this.noise(0.34, 0.26, 1500, 120);
    this.tone({ freq: 300 + step * 40, to: 60, type: 'sawtooth', dur: 0.3, vol: 0.14 });
  }
  impact() { this.noise(0.5, 0.34, 1200, 80); this.tone({ freq: 170, to: 40, type: 'sawtooth', dur: 0.42, vol: 0.2 }); }
  fireball() { this.noise(0.5, 0.12, 700, 160); }
  warn() {
    this.tone({ freq: 740, to: 500, type: 'square', dur: 0.14, vol: 0.14 });
    this.tone({ freq: 740, to: 500, type: 'square', dur: 0.14, vol: 0.14, at: 0.22 });
  }
  pickup() { this.tone({ freq: 1180, to: 1820, type: 'sine', dur: 0.11, vol: 0.12 }); }
  score() { this.tone({ freq: 1560, type: 'sine', dur: 0.07, vol: 0.07 }); }
  over() {
    this.tone({ freq: 300, to: 60, type: 'sawtooth', dur: 1.1, vol: 0.2 });
    this.tone({ freq: 150, to: 40, type: 'square', dur: 1.2, vol: 0.1, at: 0.1 });
  }
  ui() { this.tone({ freq: 620, to: 940, type: 'triangle', dur: 0.09, vol: 0.11 }); }
  boost() { this.noise(0.24, 0.1, 400, 1600, 'highpass'); }
}

/* ------------------------------------------------------------
   5. ParticleSystem — pooled, additive
   ------------------------------------------------------------ */
class ParticleSystem {
  constructor(max) {
    this.pool = new Array(max);
    this.head = 0;
    this.count = 0;
    for (let i = 0; i < max; i++) {
      this.pool[i] = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, hue: 200, sat: 100, lit: 70, drag: 0.985, glow: 1, spin: 0 };
    }
  }
  clear() { for (const p of this.pool) p.on = false; this.count = 0; }
  add(x, y, vx, vy, life, size, hue, sat, lit, drag) {
    let p = null;
    for (let i = 0; i < this.pool.length; i++) {
      const c = this.pool[(this.head + i) % this.pool.length];
      if (!c.on) { p = c; this.head = (this.head + i + 1) % this.pool.length; break; }
    }
    if (!p) { p = this.pool[this.head]; this.head = (this.head + 1) % this.pool.length; }
    else this.count++;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = p.max = life; p.size = size;
    p.hue = hue; p.sat = sat === undefined ? 100 : sat; p.lit = lit === undefined ? 72 : lit;
    p.drag = drag === undefined ? 0.985 : drag;
    return p;
  }
  burst(x, y, n, o) {
    const c = o || {};
    const speed = c.speed === undefined ? 110 : c.speed;
    const dir = c.dir === undefined ? 0 : c.dir;
    const spread = c.spread === undefined ? TAU : c.spread;
    const life = c.life === undefined ? 0.5 : c.life;
    const size = c.size === undefined ? 2.6 : c.size;
    const hue = c.hue === undefined ? 200 : c.hue;
    const sat = c.sat === undefined ? 100 : c.sat;
    const lit = c.lit === undefined ? 74 : c.lit;
    const jit = c.jitter === undefined ? 0.5 : c.jitter;
    for (let i = 0; i < n; i++) {
      const a = dir + rand(-spread / 2, spread / 2) * jit;
      const s = speed * rand(0.3, 1.3);
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.6, 1.35),
        size * rand(0.55, 1.5), hue + rand(-14, 14), sat, lit, c.drag);
    }
  }
  update(dt) {
    this.count = 0;
    for (const p of this.pool) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      this.count++;
    }
  }
  draw(g) {
    g.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.on) continue;
      const t = p.life / p.max;
      const r = p.size * (0.3 + t * 0.95);
      g.fillStyle = 'hsla(' + p.hue + ',' + p.sat + '%,' + p.lit + '%,' + (t * t * 0.82).toFixed(3) + ')';
      g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
}

/* ------------------------------------------------------------
   6. Camera — follows inside the arena, shake + zoom punch
   ------------------------------------------------------------ */
class Camera {
  constructor() {
    this.x = ARENA.w / 2; this.y = ARENA.h / 2;
    this.base = 1; this.zoom = 1; this.punch = 0;
    this.shake = 0; this.kx = 0; this.ky = 0;
    this.viewW = 0; this.viewH = 0;
  }
  snap(x, y) { this.x = x; this.y = y; }
  kick(m) { this.shake = Math.min(40, this.shake + m); }
  punchZoom(v) { this.punch = clamp(this.punch + v, -0.12, 0.16); }
  follow(x, y, smoothing, dt) {
    const t = 1 - Math.exp(-dt * smoothing);
    this.x += (x - this.x) * t;
    this.y += (y - this.y) * t;
    const hw = this.viewW / 2, hh = this.viewH / 2;
    this.x = ARENA.w <= hw * 2 ? ARENA.w / 2 : clamp(this.x, hw, ARENA.w - hw);
    this.y = ARENA.h <= hh * 2 ? ARENA.h / 2 : clamp(this.y, hh, ARENA.h - hh);
  }
  update(dt) {
    this.shake *= Math.pow(0.004, dt);
    if (this.shake < 0.15) this.shake = 0;
    const m = this.shake, k = 1 - Math.exp(-dt * 34);
    this.kx = lerp(this.kx, rand(-m, m), k);
    this.ky = lerp(this.ky, rand(-m, m), k);
    this.punch *= Math.pow(0.00002, dt);
    this.zoom = this.base * (1 + this.punch);
    this.viewW = canvas.clientWidth / this.zoom;
    this.viewH = canvas.clientHeight / this.zoom;
  }
  /* world <-> screen */
  toScreenX(wx) { return (wx - this.x) * this.zoom + canvas.clientWidth / 2; }
  toScreenY(wy) { return (wy - this.y) * this.zoom + canvas.clientHeight / 2; }
  toWorldX(sx) { return (sx - canvas.clientWidth / 2) / this.zoom + this.x; }
  toWorldY(sy) { return (sy - canvas.clientHeight / 2) / this.zoom + this.y; }
}

/* ------------------------------------------------------------
   7. shared entity helpers
   ------------------------------------------------------------ */
function inArena(x, y, pad) {
  const p = pad || 0;
  return x > p && x < ARENA.w - p && y > p && y < ARENA.h - p;
}
function glow(g, x, y, r, hue, sat, lit, a) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, 'hsla(' + hue + ',' + sat + '%,' + lit + '%,' + a + ')');
  grad.addColorStop(0.45, 'hsla(' + hue + ',' + sat + '%,' + (lit - 8) + '%,' + (a * 0.28).toFixed(3) + ')');
  grad.addColorStop(1, 'hsla(' + hue + ',' + sat + '%,' + lit + '%,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function shipPath(g, scale, wings) {
  const s = scale;
  g.beginPath();
  g.moveTo(11 * s, 0);
  g.lineTo(3 * s, 3.4 * s);
  g.lineTo(-2 * s, 3 * s);
  if (wings) { g.lineTo(-4 * s, 8 * s); g.lineTo(-8 * s, 7.2 * s); g.lineTo(-7 * s, 2.6 * s); }
  g.lineTo(-8.4 * s, 2.2 * s);
  g.lineTo(-8.4 * s, -2.2 * s);
  if (wings) { g.lineTo(-7 * s, -2.6 * s); g.lineTo(-8 * s, -7.2 * s); g.lineTo(-4 * s, -8 * s); g.lineTo(-2 * s, -3 * s); }
  g.lineTo(3 * s, -3.4 * s);
  g.closePath();
}
/* ------------------------------------------------------------
   8. Planet + Turret
   ------------------------------------------------------------ */
let uid = 0;
class Turret {
  constructor(planet, ang) {
    this.planet = planet;
    this.ang = ang;
    this.r = 9;
    this.hp = this.max = 34;
    this.cd = rand(0.4, 2.2);
    this.rot = ang;
    this.flash = 0;
    this.alive = true;
    this.x = 0; this.y = 0;
    this.track();
  }
  track() {
    const p = this.planet;
    this.x = p.x + Math.cos(this.ang) * (p.r + 6);
    this.y = p.y + Math.sin(this.ang) * (p.r + 6);
  }
  update(dt, game) {
    this.track();
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    const s = game.ship;
    const fighting = game.state === 'play';
    const d = (s.alive && fighting) ? dst(this.x, this.y, s.x, s.y) : 1e9;
    const want = Math.atan2(s.y - this.y, s.x - this.x);
    this.rot = angLerp(this.rot, want, Math.min(1, dt * 2.6));
    this.cd -= dt;
    if (fighting && d < 640 && this.cd <= 0 && game.lineOfSight(this.x, this.y, s.x, s.y)) {
      this.cd = rand(1.5, 2.4);
      const err = rand(-0.09, 0.09);
      const a = this.rot + err;
      game.bullets.spawn({
        team: 1, kind: 'bolt', x: this.x + Math.cos(a) * 12, y: this.y + Math.sin(a) * 12,
        vx: Math.cos(a) * 470, vy: Math.sin(a) * 470, r: 3.4, dmg: 7, hue: 22, life: 1.9,
      });
      game.parts.add(this.x + Math.cos(a) * 12, this.y + Math.sin(a) * 12, Math.cos(a) * 40, Math.sin(a) * 40, 0.12, 3, 24, 100, 76);
      game.sfx.shoot();
    }
  }
  hurt(dmg, game) {
    this.hp -= dmg; this.flash = 1;
    game.parts.burst(this.x, this.y, 4, { speed: 90, life: 0.25, size: 2, hue: 30 });
    if (this.hp <= 0) {
      this.alive = false;
      game.parts.burst(this.x, this.y, 20, { speed: 190, life: 0.5, size: 2.8, hue: 28 });
      game.cam.kick(4);
      game.sfx.kill(1);
      game.addScore(SCORE.turret, this.x, this.y, '+' + SCORE.turret, 30);
      game.planetClearedCheck(this.planet);
    }
  }
  draw(g) {
    const p = this.planet;
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.ang);
    g.fillStyle = this.flash > 0 ? '#fff' : '#3a2230';
    g.strokeStyle = 'hsl(18,95%,62%)';
    g.lineWidth = 1.6;
    g.beginPath(); g.arc(0, 0, 8, -1.5, 1.5); g.lineTo(0, 0); g.closePath();
    g.fill(); g.stroke();
    g.rotate(this.rot - this.ang);
    g.fillStyle = this.flash > 0 ? '#fff' : 'hsl(18,95%,64%)';
    g.fillRect(0, -2.4, 14, 4.8);
    g.restore();
    if (this.hp < this.max) {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(this.x - 10, this.y - 16, 20, 3);
      g.fillStyle = 'hsl(18,95%,60%)'; g.fillRect(this.x - 10, this.y - 16, 20 * (this.hp / this.max), 3);
    }
  }
}

class Planet {
  constructor(cell) {
    this.uid = ++uid;
    this.cell = cell;
    this.name = pick(NAMES_A) + ' ' + pick(NAMES_B);
    this.time = rand(0, 40);
    this.pulse = rand(0, TAU);
    this.flash = 0;
    this.spawnT = 0;
    this.visited = false;
    this.resupplied = false;
    this.ring = chance(0.3) ? { tilt: rand(-0.8, 0.8), w: rand(0.16, 0.32) } : null;
    this.turrets = [];
  }
  configure(game) {
    const D = game.diff();
    const f = game.rollFaction();
    this.faction = f;
    const F = FACTION[f];
    this.kind = f === 'danger' ? 'normal' : pick(game.rollKinds());
    this.r = rand(D.rMin, D.rMax) * (f === 'supply' ? 1.18 : f === 'danger' ? 0.92 : 1);
    this.hue = F.hue + rand(-9, 9);
    this.sat = F.sat;
    this.orbitLinear = D.orbit * (this.kind === 'fast' ? 1.6 : 1) * rand(0.94, 1.06);
    this.spinDir = chance(0.5) ? 1 : -1;
    const gap = f === 'danger' ? CFG.orbitGap * 0.42 : CFG.orbitGap + this.r * 0.42;
    this.orbitR = this.r + gap;
    let win = lerp(CFG.catchBase, CFG.catchMin, D.d) * rand(0.92, 1.08);
    if (this.kind === 'gravity') win *= 1.55;
    if (f === 'danger') win *= 1.7;
    if (f === 'supply') win *= 1.2;
    this.captureR = this.orbitR + win;
    this.rewardMul = F.reward * (this.kind === 'gravity' ? 1.2 : 1);
    this.symbol = F.symbol;
    this.label = F.label;
    /* place inside its grid cell, clear of every other planet and of the walls */
    const cw = ARENA.w / CELLS.cols, ch = ARENA.h / CELLS.rows;
    const pad = this.captureR + 84;
    const lo_x = pad, hi_x = ARENA.w - pad, lo_y = pad, hi_y = ARENA.h - pad;
    let best = null;
    for (let tries = 0; tries < 26; tries++) {
      const x = clamp(this.cell.cx * cw + rand(cw * 0.16, cw * 0.84), lo_x, hi_x);
      const y = clamp(this.cell.cy * ch + rand(ch * 0.16, ch * 0.84), lo_y, hi_y);
      let min = 1e9;
      for (const q of game.planets) {
        if (q === this) continue;
        min = Math.min(min, dst(x, y, q.x, q.y) - q.r - q.captureR);
      }
      if (!best || min > best.min) best = { x, y, min };
      if (min > 40) break;
    }
    this.x = this.baseX = best.x;
    this.y = this.baseY = best.y;
    this.visited = false;
    this.resupplied = false;
    this.spawnT = 0;
    this.name = pick(NAMES_A) + ' ' + pick(NAMES_B);
    this.turrets.length = 0;
    if (f === 'enemy') {
      const n = clamp(2 + Math.floor(game.threat / 2), 2, 4);
      for (let i = 0; i < n; i++) this.turrets.push(new Turret(this, (i / n) * TAU + rand(-0.4, 0.4)));
    }
    this.enemySpawnCd = rand(1.5, 4);
    /* a new world displaces any rock that ends up inside its footprint */
    for (let i = game.asteroids.length - 1; i >= 0; i--) {
      const a = game.asteroids[i];
      if (dst(this.x, this.y, a.x, a.y) < this.captureR + a.r) game.asteroids.splice(i, 1);
    }
    return this;
  }
  get hostile() { return this.faction === 'enemy'; }
  update(dt, game) {
    this.time += dt;
    this.pulse += dt * 2.1;
    if (this.spawnT < 1) this.spawnT = Math.min(1, this.spawnT + dt * 2.4);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4);
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.update(dt, game);
      if (!t.alive) this.turrets.splice(i, 1);
    }
    if (this.hostile && this.turrets.length === 0) this.cleared = true;
  }
  /* enemy worlds put ships into the field when the player closes in */
  spawnLogic(dt, game) {
    if (game.state !== 'play') return;
    if (!this.hostile || game.enemies.length >= game.enemyCap()) return;
    const d = dst(this.x, this.y, game.ship.x, game.ship.y);
    this.enemySpawnCd -= dt;
    if (this.enemySpawnCd <= 0 && d < 1050) {
      this.enemySpawnCd = rand(3.4, 6.2) / (0.6 + game.threat * 0.2);
      game.spawnEnemy(this);
    }
  }
}

/* ------------------------------------------------------------
   9. Hazards: asteroid · fireball · meteor
   ------------------------------------------------------------ */
class Asteroid {
  constructor(x, y, r, speed) {
    this.x = x; this.y = y; this.r = r;
    const a = rand(0, TAU), s = rand(0.4, 1) * speed;
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
    this.rot = rand(0, TAU); this.vrot = rand(-0.7, 0.7);
    this.hp = this.max = r * 2.4;
    this.flash = 0;
    this.n = 8 + randi(0, 4);
    this.shape = [];
    for (let i = 0; i < this.n; i++) this.shape.push(rand(0.7, 1.14));
    this.dmg = clamp(20 + r * 0.8, 22, 40);
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.rot += this.vrot * dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    const m = this.r;
    if (this.x < m) { this.x = m; this.vx = Math.abs(this.vx); }
    if (this.x > ARENA.w - m) { this.x = ARENA.w - m; this.vx = -Math.abs(this.vx); }
    if (this.y < m) { this.y = m; this.vy = Math.abs(this.vy); }
    if (this.y > ARENA.h - m) { this.y = ARENA.h - m; this.vy = -Math.abs(this.vy); }
  }
  path(g) {
    g.beginPath();
    for (let i = 0; i < this.n; i++) {
      const a = (i / this.n) * TAU, rr = this.r * this.shape[i];
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  }
  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.rot);
    this.path(g);
    const grad = g.createRadialGradient(-this.r * 0.35, -this.r * 0.35, this.r * 0.1, 0, 0, this.r * 1.2);
    if (this.flash > 0) { grad.addColorStop(0, '#fff'); grad.addColorStop(1, 'hsl(20,60%,60%)'); }
    else { grad.addColorStop(0, '#6d6577'); grad.addColorStop(0.55, '#3a3546'); grad.addColorStop(1, '#191722'); }
    g.fillStyle = grad; g.fill();
    g.strokeStyle = 'rgba(255,160,140,0.34)'; g.lineWidth = 1.3; g.stroke();
    g.restore();
    /* drop shadow on the floor of the arena for depth */
    g.globalCompositeOperation = 'lighter';
    glow(g, this.x + this.r * 0.5, this.y + this.r * 0.6, this.r * 2.1, 340, 60, 40, 0.05);
    g.globalCompositeOperation = 'source-over';
  }
}

class Fireball {
  constructor(x, y, vx, vy, r) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = r; this.life = rand(9, 15); this.trail = 0; this.dmg = 28;
    this.pulse = rand(0, TAU);
  }
  update(dt, game) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt; this.pulse += dt * 9;
    this.trail += dt;
    while (this.trail > 0.018) {
      this.trail -= 0.018;
      game.parts.add(this.x + rand(-4, 4), this.y + rand(-4, 4), rand(-26, 26), rand(-26, 26),
        rand(0.24, 0.5), rand(2.6, 5.2), rand(12, 42), 100, rand(56, 74), 0.93);
    }
  }
  dead() { return this.life <= 0 || !inArena(this.x, this.y, -60); }
  draw(g) {
    const r = this.r * (1 + Math.sin(this.pulse) * 0.08);
    g.globalCompositeOperation = 'lighter';
    glow(g, this.x, this.y, r * 3.4, 26, 100, 58, 0.5);
    g.globalCompositeOperation = 'source-over';
    const grad = g.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    grad.addColorStop(0, '#fffbe8');
    grad.addColorStop(0.4, '#ffb545');
    grad.addColorStop(1, '#e2431c');
    g.fillStyle = grad;
    g.beginPath(); g.arc(this.x, this.y, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,220,150,0.5)'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(this.x, this.y, r * 1.35, this.pulse, this.pulse + 2.2); g.stroke();
  }
}

class Meteor {
  constructor(x, y, vx, vy, r) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = r; this.dmg = 40; this.trail = 0; this.life = 12;
  }
  update(dt, game) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt; this.trail += dt;
    while (this.trail > 0.014) {
      this.trail -= 0.014;
      game.parts.add(this.x, this.y, rand(-30, 30), rand(-30, 30), rand(0.3, 0.7),
        rand(3, 6.4), rand(18, 46), 100, rand(60, 80), 0.94);
    }
  }
  dead() { return this.life <= 0 || !inArena(this.x, this.y, -80); }
  draw(g) {
    g.globalCompositeOperation = 'lighter';
    glow(g, this.x, this.y, this.r * 3.6, 34, 100, 60, 0.45);
    g.globalCompositeOperation = 'source-over';
    const a = Math.atan2(this.vy, this.vx);
    g.save(); g.translate(this.x, this.y); g.rotate(a);
    const grad = g.createRadialGradient(-this.r * 0.2, 0, this.r * 0.1, 0, 0, this.r);
    grad.addColorStop(0, '#fff3d0'); grad.addColorStop(0.5, '#ff9a3c'); grad.addColorStop(1, '#5a2a18');
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, this.r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,190,120,0.35)';
    g.beginPath();
    g.moveTo(-this.r * 0.6, -this.r * 0.7);
    g.lineTo(-this.r * 4.2, 0);
    g.lineTo(-this.r * 0.6, this.r * 0.7);
    g.closePath(); g.fill();
    g.restore();
  }
}

/* ------------------------------------------------------------
   10. Pickup / PowerUp drops
   ------------------------------------------------------------ */
const DROP = {
  fuel:   { hue: 46,  glyph: 'F', label: 'FUEL' },
  ammo:   { hue: 190, glyph: 'A', label: 'AMMO' },
  msl:    { hue: 276, glyph: 'M', label: 'MISSILE' },
  shield: { hue: 210, glyph: 'S', label: 'SHIELD' },
  repair: { hue: 150, glyph: '+', label: 'REPAIR' },
  score:  { hue: 52,  glyph: '*', label: 'BONUS' },
  power:  { hue: 320, glyph: 'P', label: 'POWER' },
};
class Pickup {
  constructor(x, y, kind, power) {
    this.x = x; this.y = y; this.kind = kind; this.power = power || null;
    const a = rand(0, TAU), s = rand(20, 70);
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
    this.r = 12; this.life = 17; this.max = 17; this.phase = rand(0, TAU); this.t = 0;
    this.taken = false;
  }
  update(dt, game) {
    this.t += dt; this.life -= dt; this.phase += dt * 3;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= Math.pow(0.4, dt); this.vy *= Math.pow(0.4, dt);
    const s = game.ship;
    const d = dst(this.x, this.y, s.x, s.y);
    if (d < 130 && s.alive) {           /* soft magnet */
      const pull = 240 * (1 - d / 130);
      this.vx += (s.x - this.x) / d * pull * dt;
      this.vy += (s.y - this.y) / d * pull * dt;
    }
    this.x = clamp(this.x, 20, ARENA.w - 20);
    this.y = clamp(this.y, 20, ARENA.h - 20);
  }
  draw(g) {
    const D = DROP[this.kind];
    const blink = this.life < 3.4 ? (Math.sin(this.life * 16) > 0 ? 1 : 0.25) : 1;
    const y = this.y + Math.sin(this.phase) * 2.4;
    g.globalCompositeOperation = 'lighter';
    glow(g, this.x, y, 30, D.hue, 100, 62, 0.42 * blink);
    g.globalCompositeOperation = 'source-over';
    g.save();
    g.translate(this.x, y);
    g.rotate(Math.sin(this.phase * 0.5) * 0.22);
    g.strokeStyle = 'hsla(' + D.hue + ',100%,78%,' + (0.95 * blink) + ')';
    g.fillStyle = 'hsla(' + D.hue + ',90%,22%,' + (0.9 * blink) + ')';
    g.lineWidth = 1.6;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU - Math.PI / 2;
      const rr = this.r * (i % 2 ? 0.72 : 1);
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'hsla(' + D.hue + ',100%,88%,' + blink + ')';
    g.font = '700 11px ' + FONT;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(this.power ? this.power[0] : D.glyph, 0, 0.5);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.restore();
  }
}

/* ------------------------------------------------------------
   11. Bullet pool — player + enemy projectiles
   ------------------------------------------------------------ */
class BulletPool {
  constructor(max) {
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ active: false, team: 0, kind: 'shot', x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
        r: 3, dmg: 1, life: 0, hue: 190, homing: 0, turn: 0, speed: 0, target: null, smoke: 0, trail: 0, lit: 70, grazed: false });
    }
  }
  clear() { for (const b of this.items) b.active = false; }
  spawn(o) {
    for (let i = 0; i < this.items.length; i++) {
      const b = this.items[i];
      if (b.active) continue;
      b.active = true;
      b.team = o.team; b.kind = o.kind;
      b.x = b.px = o.x; b.y = b.py = o.y;
      b.vx = o.vx; b.vy = o.vy;
      b.r = o.r; b.dmg = o.dmg; b.life = o.life === undefined ? CFG.bulletLife : o.life;
      b.hue = o.hue; b.lit = o.lit === undefined ? 72 : o.lit;
      b.homing = o.homing || 0; b.turn = o.turn || 0; b.speed = o.speed || hyp(o.vx, o.vy);
      b.target = o.target || null; b.smoke = 0; b.trail = 0; b.grazed = false;
      return b;
    }
    return null;
  }
  update(dt, game) {
    for (const b of this.items) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; continue; }
      if (b.homing && b.target && (b.target.alive !== false) && b.target.hp > 0) {
        const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angDelta(cur, want), -b.turn * dt, b.turn * dt);
        b.speed = Math.min(b.speed + 520 * dt, b.kind === 'missile' ? 760 : 620);
        b.vx = Math.cos(na) * b.speed; b.vy = Math.sin(na) * b.speed;
      }
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (!inArena(b.x, b.y, -6)) { b.active = false; continue; }
      if (b.kind === 'missile') {
        b.smoke += dt;
        while (b.smoke > 0.02) {
          b.smoke -= 0.02;
          game.parts.add(b.x, b.y, rand(-22, 22), rand(-22, 22), rand(0.3, 0.75),
            rand(2.4, 4.6), b.team ? 22 : 30, 100, b.team ? 62 : 78, 0.94);
        }
      }
    }
  }
  draw(g) {
    g.globalCompositeOperation = 'lighter';
    for (const b of this.items) {
      if (!b.active) continue;
      const len = b.kind === 'missile' ? 10 : b.kind === 'plasma' ? 0 : 16;
      const a = Math.atan2(b.vy, b.vx);
      if (len) {
        g.strokeStyle = 'hsla(' + b.hue + ',100%,72%,0.5)';
        g.lineWidth = b.r * 1.5;
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - Math.cos(a) * len, b.y - Math.sin(a) * len);
        g.stroke();
      }
      glow(g, b.x, b.y, b.r * (b.kind === 'plasma' ? 4.4 : 3.2), b.hue, 100, b.lit, 0.8);
      g.fillStyle = b.kind === 'missile' ? '#ffe9c0' : 'hsl(' + b.hue + ',100%,' + (b.lit + 16) + '%)';
      g.beginPath(); g.arc(b.x, b.y, b.r * (b.kind === 'plasma' ? 1.5 : 0.9), 0, TAU); g.fill();
      if (b.kind === 'missile') {
        g.save(); g.translate(b.x, b.y); g.rotate(a);
        g.fillStyle = '#d8e6ff';
        g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, 3.4); g.lineTo(-5, -3.4); g.closePath(); g.fill();
        g.restore();
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
}

/* ------------------------------------------------------------
   12. Enemy ships
   ------------------------------------------------------------ */
const ETYPES = {
  scout:     { hp: 22,  r: 11, speed: 262, turn: 3.6, sense: 640, range: 250, rate: 0.85, dmg: 6,  shot: 'bolt',    hue: 152, score: SCORE.scout,       fuel: 0,   ammo: 0 },
  fighter:   { hp: 48,  r: 13, speed: 214, turn: 2.7, sense: 740, range: 320, rate: 0.72, dmg: 9,  shot: 'bolt',    hue: 44,  score: SCORE.fighter,      fuel: 6,   ammo: 6 },
  heavy:     { hp: 130, r: 19, speed: 122, turn: 1.5, sense: 820, range: 470, rate: 1.55, dmg: 18, shot: 'plasma',  hue: 16,  score: SCORE.heavy,        fuel: 10,  ammo: 10 },
  missileCar:{ hp: 66,  r: 15, speed: 176, turn: 2.1, sense: 900, range: 560, rate: 2.3,  dmg: 15, shot: 'missile', hue: 282, score: SCORE.missileShip,  fuel: 8,   ammo: 0 },
  drone:     { hp: 16,  r: 10, speed: 300, turn: 4.4, sense: 780, range: 0,   rate: 0,    dmg: 45, shot: null,      hue: 348, score: SCORE.drone,        fuel: 0,   ammo: 0 },
  destroyer: { hp: 540, r: 30, speed: 106, turn: 1.2, sense: 1100, range: 520, rate: 1.1, dmg: 14, shot: 'plasma',  hue: 8,   score: 900,                fuel: 22,  ammo: 20, boss: 1 },
  carrier:   { hp: 660, r: 34, speed: 88,  turn: 1.0, sense: 1200, range: 620, rate: 1.6, dmg: 10, shot: 'bolt',    hue: 268, score: 1200,               fuel: 26,  ammo: 24, boss: 1 },
  hunter:    { hp: 400, r: 22, speed: 300, turn: 3.2, sense: 1300, range: 300, rate: 0.9, dmg: 12, shot: 'bolt',    hue: 320, score: 800,                fuel: 18,  ammo: 14, boss: 1 },
};
const THREAT_ROSTER = [
  ['scout'],
  ['scout', 'fighter'],
  ['scout', 'fighter', 'missileCar'],
  ['scout', 'fighter', 'missileCar', 'heavy'],
  ['fighter', 'missileCar', 'heavy', 'drone'],
];

class Enemy {
  constructor(type, x, y, home, game) {
    const T = ETYPES[type];
    this.type = type;
    this.T = T;
    this.boss = !!T.boss;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.rot = 0;
    this.hp = this.max = T.hp * (1 + game.threat * 0.06);
    this.r = T.r;
    this.speed = T.speed * rand(0.92, 1.08);
    this.turn = T.turn;
    this.sense = T.sense;
    this.range = T.range;
    this.hue = T.hue;
    this.state = 'patrol';
    this.home = home;
    this.orbitAng = rand(0, TAU);
    this.patrolR = home ? home.orbitR + rand(50, 90) : 200;
    this.fireCd = rand(0.5, 1.6);
    this.flash = 0;
    this.age = 0;
    this.alive = true;
    this.charge = 0;
    this.dashCd = 3;
    this.launchCd = 5.5;
    this.strafe = chance(0.5) ? 1 : -1;
    this.name = type.toUpperCase();
    this.lockable = true;
  }
  pickState(game) {
    const s = game.ship;
    const dp = s.alive ? dst(this.x, this.y, s.x, s.y) : 1e9;
    const dh = this.home ? dst(this.x, this.y, this.home.x, this.home.y) : 0;
    if (this.type === 'drone') {
      if (this.state !== 'charge' && this.state !== 'dash') this.state = dp < this.sense ? 'chase' : 'return';
      if (this.state === 'chase' && dp < 300) { this.state = 'charge'; this.charge = 0.75; game.sfx.warn(); }
      return;
    }
    switch (this.state) {
      case 'patrol':
        if (dp < this.sense) this.state = 'chase';
        break;
      case 'chase':
        if (dp > this.sense * 1.7) this.state = 'return';
        else if (dp < this.range * 1.2) this.state = 'attack';
        break;
      case 'attack':
        if (dp > this.range * 1.7) this.state = 'chase';
        else if (dp > this.sense * 1.7) this.state = 'return';
        break;
      case 'return':
        if (dh < this.patrolR + 60) this.state = 'patrol';
        break;
    }
    if (!this.boss && this.hp < this.max * 0.22 && dh < 900) this.state = 'return';
  }
  steer(dt, tx, ty, mul) {
    const a = Math.atan2(ty - this.y, tx - this.x);
    const want = this.speed * (mul || 1);
    const cur = hyp(this.vx, this.vy);
    const na = angLerp(Math.atan2(this.vy, this.vx) || a, a, Math.min(1, this.turn * dt));
    const sp = lerp(cur, want, Math.min(1, dt * 2.2));
    this.vx = Math.cos(na) * sp;
    this.vy = Math.sin(na) * sp;
  }
  update(dt, game) {
    this.age += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
    const s = game.ship;
    const dp = s.alive ? dst(this.x, this.y, s.x, s.y) : 1e9;
    this.pickState(game);

    if (this.state === 'patrol' && this.home) {
      this.orbitAng += dt * (this.type === 'hunter' ? 1.1 : 0.55) * this.strafe;
      const rr = this.patrolR;
      this.steer(dt, this.home.x + Math.cos(this.orbitAng) * rr, this.home.y + Math.sin(this.orbitAng) * rr, 0.6);
    } else if (this.state === 'return' && this.home) {
      this.steer(dt, this.home.x + Math.cos(this.orbitAng) * this.patrolR, this.home.y + Math.sin(this.orbitAng) * this.patrolR, 1);
    } else if (this.state === 'charge') {
      this.charge -= dt;
      this.vx *= Math.pow(0.2, dt); this.vy *= Math.pow(0.2, dt);
      if (this.charge <= 0) {
        const a = Math.atan2(s.y - this.y, s.x - this.x);
        this.vx = Math.cos(a) * 560; this.vy = Math.sin(a) * 560;
        this.state = 'dash'; this.charge = 1.7;
        game.parts.burst(this.x, this.y, 14, { speed: 200, life: 0.4, size: 3, hue: this.hue });
      }
    } else if (this.state === 'dash') {
      this.charge -= dt;
      if (this.charge <= 0) this.state = 'chase';
    } else {
      /* chase / attack: hold a stand-off ring and strafe */
      const keep = this.range * (this.state === 'attack' ? 0.9 : 1.35);
      const a = Math.atan2(s.y - this.y, s.x - this.x);
      const tang = a + Math.PI / 2 * this.strafe;
      const tx = s.x - Math.cos(a) * keep + Math.cos(tang) * keep * 0.45;
      const ty = s.y - Math.sin(a) * keep + Math.sin(tang) * keep * 0.45;
      this.steer(dt, tx, ty, this.type === 'hunter' ? 1 : 0.92);
      if (this.type === 'hunter') {
        this.dashCd -= dt;
        if (this.dashCd <= 0 && dp < 620) {
          this.dashCd = rand(4.5, 7);
          this.vx = Math.cos(a) * 620; this.vy = Math.sin(a) * 620;
          game.parts.burst(this.x, this.y, 12, { speed: 160, life: 0.35, size: 2.6, hue: this.hue });
          game.sfx.boost();
        }
      }
      if (this.state === 'attack') this.fire(dt, game, a, dp);
    }

    /* carrier keeps feeding the fight */
    if (this.type === 'carrier') {
      this.launchCd -= dt;
      if (this.launchCd <= 0 && dp < 1100 && game.state === 'play') {
        this.launchCd = rand(5, 8);
        if (game.enemies.length < game.enemyCap() + 2) {
          const e = game.spawnEnemy(this.home || null, 'scout', this.x, this.y);
          if (e) game.popup(this.x, this.y - 26, 'LAUNCHED', this.hue, 12, 0.9);
        }
      }
    }

    const sp = hyp(this.vx, this.vy);
    this.rot = sp > 8 ? angLerp(this.rot, Math.atan2(this.vy, this.vx), Math.min(1, dt * 9)) : this.rot;
    this.x = clamp(this.x + this.vx * dt, this.r, ARENA.w - this.r);
    this.y = clamp(this.y + this.vy * dt, this.r, ARENA.h - this.r);
    /* engine trail */
    if (sp > 60 && Math.random() < dt * 34) {
      game.parts.add(this.x - Math.cos(this.rot) * this.r, this.y - Math.sin(this.rot) * this.r,
        -this.vx * 0.1 + rand(-12, 12), -this.vy * 0.1 + rand(-12, 12),
        rand(0.18, 0.4), rand(1.6, 3), this.hue, 100, 70, 0.92);
    }
  }
  fire(dt, game, a, dp) {
    if (!this.T.shot || game.state !== 'play') return;
    this.fireCd -= dt;
    if (this.fireCd > 0 || dp > this.range * 1.5) return;
    this.fireCd = this.T.rate * rand(0.8, 1.25);
    /* imperfect lead: enemies under-predict the player's drift so shots stay dodgeable */
    const bulletSpeed = this.T.shot === 'plasma' ? 330 : this.T.shot === 'missile' ? 250 : 540;
    const tof = dp / bulletSpeed;
    const lead = rand(0.35, 0.8);
    const px = game.ship.x + game.ship.vx * tof * lead;
    const py = game.ship.y + game.ship.vy * tof * lead;
    const err = (0.13 - game.threat * 0.012) * rand(-1, 1);
    const ang = Math.atan2(py - this.y, px - this.x) + err;
    const mx = this.x + Math.cos(ang) * (this.r + 6), my = this.y + Math.sin(ang) * (this.r + 6);
    if (this.T.shot === 'plasma') {
      game.bullets.spawn({ team: 1, kind: 'plasma', x: mx, y: my, vx: Math.cos(ang) * 330, vy: Math.sin(ang) * 330, r: 7, dmg: this.T.dmg, hue: 14, life: 3.4, lit: 62 });
    } else if (this.T.shot === 'missile') {
      game.bullets.spawn({ team: 1, kind: 'missile', x: mx, y: my, vx: Math.cos(ang) * 200, vy: Math.sin(ang) * 200, speed: 200, r: 5, dmg: this.T.dmg, hue: 22, life: 5.4, homing: 1, turn: 1.9, target: game.ship });
      game.banner('INCOMING', 268, 0.7);
    } else {
      game.bullets.spawn({ team: 1, kind: 'bolt', x: mx, y: my, vx: Math.cos(ang) * 540, vy: Math.sin(ang) * 540, r: 3.2, dmg: this.T.dmg, hue: this.hue, life: 1.9 });
    }
    game.parts.add(mx, my, Math.cos(ang) * 60, Math.sin(ang) * 60, 0.12, 3.4, this.hue, 100, 80);
    game.sfx.shoot();
    /* heavy destroyers add a second gun */
    if (this.boss && this.type !== 'carrier') {
      for (const off of [-0.3, 0.3]) {
        const a2 = ang + off;
        game.bullets.spawn({ team: 1, kind: 'bolt', x: this.x + Math.cos(a2) * this.r, y: this.y + Math.sin(a2) * this.r,
          vx: Math.cos(a2) * 500, vy: Math.sin(a2) * 500, r: 3, dmg: 7, hue: this.hue, life: 2 });
      }
    }
  }
  hurt(dmg, game) {
    this.hp -= dmg;
    this.flash = 1;
    game.parts.burst(this.x, this.y, 3, { speed: 110, life: 0.2, size: 2, hue: this.hue });
    if (this.hp <= 0 && this.alive) this.die(game);
  }
  die(game) {
    if (!this.alive) return;
    this.alive = false;
    game.kills++;
    game.threatPts += this.boss ? 5 : 1;
    game.parts.burst(this.x, this.y, this.boss ? 90 : 30, { speed: this.boss ? 320 : 210, life: this.boss ? 1 : 0.6, size: this.boss ? 4 : 2.8, hue: this.hue, lit: 76 });
    game.parts.burst(this.x, this.y, this.boss ? 40 : 14, { speed: 150, life: 0.8, size: 3, hue: 30, sat: 100, lit: 66 });
    game.cam.kick(this.boss ? 16 : 5);
    game.sfx.kill(this.boss ? 4 : 2);
    game.addScore(this.T.score, this.x, this.y - 20, '+' + this.T.score, this.hue);
    game.dropLoot(this);
    if (this.boss) { game.sfx.over(); game.banner(this.name + ' DESTROYED', 52, 1.2); }
  }
  draw(g, game) {
    const T = this.r;
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.rot);
    /* engine */
    g.globalCompositeOperation = 'lighter';
    glow(g, -T * 0.9, 0, T * 1.5, this.hue, 100, 62, 0.35);
    g.globalCompositeOperation = 'source-over';
    const body = this.flash > 0.2 ? '#ffffff' : 'hsl(' + this.hue + ',70%,38%)';
    const edge = 'hsl(' + this.hue + ',100%,70%)';
    g.fillStyle = body;
    g.strokeStyle = edge;
    g.lineWidth = 1.4;
    g.beginPath();
    switch (this.type) {
      case 'scout':
        g.moveTo(T * 1.15, 0); g.lineTo(-T * 0.7, T * 0.75); g.lineTo(-T * 0.35, 0); g.lineTo(-T * 0.7, -T * 0.75);
        break;
      case 'fighter':
        g.moveTo(T * 1.1, 0); g.lineTo(-T * 0.2, T * 0.5); g.lineTo(-T * 0.9, T * 1.0); g.lineTo(-T * 0.6, 0);
        g.lineTo(-T * 0.9, -T * 1.0); g.lineTo(-T * 0.2, -T * 0.5);
        break;
      case 'heavy':
      case 'destroyer':
        g.moveTo(T * 1.0, -T * 0.4); g.lineTo(T * 1.25, T * 0.1); g.lineTo(T * 0.4, T * 0.8);
        g.lineTo(-T * 1.0, T * 0.7); g.lineTo(-T * 0.8, -T * 0.7); g.lineTo(T * 0.4, -T * 0.8);
        break;
      case 'carrier':
        g.moveTo(T * 1.1, 0); g.lineTo(T * 0.2, T * 0.7); g.lineTo(-T * 1.05, T * 0.55);
        g.lineTo(-T * 1.05, -T * 0.55); g.lineTo(T * 0.2, -T * 0.7);
        break;
      case 'missileCar':
        g.moveTo(T, 0); g.lineTo(T * 0.1, T * 0.62); g.lineTo(-T * 0.95, T * 0.5);
        g.lineTo(-T * 0.55, 0); g.lineTo(-T * 0.95, -T * 0.5); g.lineTo(T * 0.1, -T * 0.62);
        break;
      case 'drone':
        g.moveTo(T * 1.2, 0); g.lineTo(-T * 0.5, T * 0.9); g.lineTo(-T * 0.5, -T * 0.9);
        break;
      default:
        g.moveTo(T * 1.2, 0); g.lineTo(-T * 0.4, T * 0.85); g.lineTo(-T * 0.8, 0); g.lineTo(-T * 0.4, -T * 0.85);
    }
    g.closePath(); g.fill(); g.stroke();
    /* cockpit / core */
    g.fillStyle = this.state === 'charge' ? '#fff' : 'hsla(' + this.hue + ',100%,72%,0.9)';
    g.beginPath(); g.arc(T * 0.15, 0, T * 0.24, 0, TAU); g.fill();
    g.restore();

    /* kamikaze telegraph */
    if (this.type === 'drone' && this.state === 'charge') {
      const k = 1 - this.charge / 0.75;
      g.strokeStyle = 'hsla(348,100%,66%,' + (0.35 + 0.5 * Math.abs(Math.sin(this.age * 22))) + ')';
      g.lineWidth = 2;
      g.beginPath(); g.arc(this.x, this.y, this.r + 8 + k * 12, 0, TAU); g.stroke();
    }
    /* health bar for damaged ships and bosses */
    if (this.hp < this.max && (this.boss || this.hp < this.max * 0.75)) {
      const w = this.boss ? 90 : 30, h = this.boss ? 6 : 3;
      const x = this.x - w / 2, y = this.y - this.r - (this.boss ? 26 : 14);
      g.fillStyle = 'rgba(4,6,14,0.75)'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = 'hsl(' + (this.boss ? 340 : 20) + ',95%,58%)';
      g.fillRect(x, y, w * clamp(this.hp / this.max, 0, 1), h);
      if (this.boss) {
        g.font = '600 10px ' + FONT;
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.textAlign = 'center';
        g.fillText(this.name, this.x, y - 5);
        g.textAlign = 'left';
      }
    }
  }
}
/* ------------------------------------------------------------
   13. Ship — the player: orbit flight + combat + resources
   ------------------------------------------------------------ */
class Ship {
  constructor(game) {
    this.game = game;
    this.reset();
  }
  reset() {
    this.alive = true;
    this.state = 'orbit';
    this.planet = null;
    this.capPlanet = null;
    this.locked = new Set();
    this.x = this.lastX = 0; this.y = this.lastY = 0;
    this.vx = this.vy = 0;
    this.angle = 0; this.dir = 1; this.orbitR = 60; this.orbitLinear = 170;
    this.rot = 0; this.aim = 0;
    this.hull = CFG.hullMax;
    this.shield = CFG.shieldMax;
    this.hitT = 99;
    this.invuln = 0;
    this.fuel = 100;
    this.ammo = CFG.ammoStart;
    this.msl = CFG.mslStart;
    this.fireCd = 0; this.mslCd = 0;
    this.lockT = 0; this.lockTarget = null; this.lockReady = false;
    this.boosting = false; this.boostCd = 0;
    this.dash = 0;
    this.shieldGuard = 0;
    this.gravityT = 0; this.slowT = 0; this.boostT = 0;
    this.trailAcc = 0; this.orbitStart = 0; this.linger = 0; this.launchTime = 0;
    this.capT = 0; this.capDur = 0.3; this.capElapsed = 0;
    this.capEntry = 0; this.capAngle = 0; this.capDir = 1; this.capTargetR = 60;
    this.freeX = 0; this.freeY = 0; this.entrySpeed = 0; this.entryB = 0;
    this.thrusting = 0;
  }
  attach(planet, angle, dir) {
    this.state = 'orbit';
    this.planet = planet;
    this.capPlanet = null;
    this.locked.clear();
    this.angle = angle === undefined ? rand(0, TAU) : angle;
    this.dir = dir === undefined ? (planet.spinDir || 1) : dir;
    this.orbitR = planet.orbitR;
    this.orbitLinear = planet.orbitLinear;
    this.orbitStart = this.game.time;
    this.syncToOrbit();
    this.lastX = this.x; this.lastY = this.y;
    this.rot = this.angle + this.dir * Math.PI / 2;
    this.aim = this.rot;
  }
  syncToOrbit() {
    const p = this.planet;
    this.x = p.x + Math.cos(this.angle) * this.orbitR;
    this.y = p.y + Math.sin(this.angle) * this.orbitR;
    const t = this.angle + this.dir * Math.PI / 2;
    this.vx = Math.cos(t) * this.orbitLinear;
    this.vy = Math.sin(t) * this.orbitLinear;
  }
  get speed() { return hyp(this.vx, this.vy); }

  launch() {
    if (this.state !== 'orbit' || !this.alive) return;
    const g = this.game, p = this.planet;
    const boosted = this.boostT > 0;
    const s = this.orbitLinear * CFG.launchMul * (boosted ? 1.34 : 1);
    const t = this.angle + this.dir * Math.PI / 2;
    this.vx = Math.cos(t) * s; this.vy = Math.sin(t) * s;
    this.rot = t; this.aim = t;
    this.state = 'fly';
    this.linger = g.time - this.orbitStart;
    this.launchTime = g.time;
    this.freeX = this.x; this.freeY = this.y;
    /* Every well that already contains the ship — including the one we are
       leaving — must be flown clear of before it can capture us again. */
    this.launchPlanet = p;
    this.locked.clear();
    for (const q of g.planets) {
      if (dst(this.x, this.y, q.x, q.y) < q.captureR * (this.gravityT > 0 ? 1.45 : 1)) this.locked.add(q);
    }
    this.planet = null;
    g.onLaunch(this, s, boosted);
  }
  beginCapture(p) {
    const g = this.game;
    const dx = this.x - p.x, dy = this.y - p.y;
    const entry = Math.atan2(dy, dx);
    const cross = dx * this.vy - dy * this.vx;
    const dir = cross >= 0 ? 1 : -1;
    this.state = 'capture';
    this.capPlanet = p;
    this.capT = 0; this.capElapsed = 0; this.capDur = 0.3;
    this.capEntry = entry; this.capAngle = entry; this.capDir = dir;
    this.capTargetR = p.orbitR;
    this.freeX = this.x; this.freeY = this.y;
    this.entrySpeed = this.speed || 1;
    this.entryB = Math.abs(cross) / this.entrySpeed;
    this.locked.clear();
    g.onCapture(this, p, dir);
  }
  updateOrbit(dt) {
    const p = this.planet, g = this.game;
    if (!p) { this.state = 'fly'; this.freeX = this.x; this.freeY = this.y; return; }
    this.orbitLinear = lerp(this.orbitLinear, p.orbitLinear, 1 - Math.exp(-dt * 2.4));
    this.orbitR = lerp(this.orbitR, p.orbitR, 1 - Math.exp(-dt * 3.2));
    /* A/D scrubs the orbit so launch timing is controllable */
    const scrub = (IN.keys.KeyD ? 1 : 0) - (IN.keys.KeyA ? 1 : 0);
    this.angle += (this.dir * (this.orbitLinear / this.orbitR) + scrub * 1.5) * dt;
    /* W/S edge in and out along the ring, but never into the planet body */
    const rad = (IN.keys.KeyS ? 1 : 0) - (IN.keys.KeyW ? 1 : 0);
    if (rad) this.orbitR = clamp(this.orbitR + rad * 70 * dt, p.r + 26, p.orbitR * 1.22);
    this.syncToOrbit();
    this.fuel = clamp(this.fuel - CFG.fuelIdle * dt, 0, 100);
    if (p.faction === 'danger') this.hurt(6 * dt, 'radiation', this.x, this.y, true);
  }
  updateCapture(dt) {
    const p = this.capPlanet;
    this.capElapsed += dt;
    this.capT = Math.min(1, this.capElapsed / this.capDur);
    const w = smooth(this.capT);
    const dx = p.x - this.freeX, dy = p.y - this.freeY;
    const d = hyp(dx, dy) || 1;
    const a = CFG.gravK * 1.35;
    this.vx += (dx / d) * a * dt;
    this.vy += (dy / d) * a * dt;
    this.freeX += this.vx * dt;
    this.freeY += this.vy * dt;
    const omega = (this.entrySpeed * 0.92) / this.capTargetR;
    this.capAngle = this.capEntry + this.capDir * omega * this.capElapsed;
    const ox = p.x + Math.cos(this.capAngle) * this.capTargetR;
    const oy = p.y + Math.sin(this.capAngle) * this.capTargetR;
    this.x = lerp(this.freeX, ox, w);
    this.y = lerp(this.freeY, oy, w);
    this.fuel = clamp(this.fuel - CFG.fuelIdle * 0.4 * dt, 0, 100);
    if (this.capT >= 1) {
      this.state = 'orbit';
      this.planet = p;
      this.capPlanet = null;
      this.angle = this.capAngle;
      this.dir = this.capDir;
      this.orbitR = this.capTargetR;
      this.orbitLinear = clamp(this.entrySpeed * 0.78, p.orbitLinear * 0.8, p.orbitLinear * 1.3);
      this.orbitStart = this.game.time;
      this.syncToOrbit();
    }
  }
  updateFly(dt) {
    const g = this.game, planets = g.planets;
    const empty = this.fuel <= 0.5;

    /* WASD thrust — momentum still dominates, so orbiting stays the core loop */
    let tx = (IN.keys.KeyD ? 1 : 0) - (IN.keys.KeyA ? 1 : 0);
    let ty = (IN.keys.KeyS ? 1 : 0) - (IN.keys.KeyW ? 1 : 0);
    this.thrusting = 0;
    if (tx || ty) {
      const m = hyp(tx, ty), acc = CFG.thrust * (empty ? 0.3 : 1);
      this.vx += (tx / m) * acc * dt;
      this.vy += (ty / m) * acc * dt;
      this.thrusting = 1;
      if (!empty) this.fuel = clamp(this.fuel - CFG.fuelThrust * dt, 0, 100);
    }
    /* boost */
    this.boosting = false;
    if (this.boostCd > 0) this.boostCd -= dt;
    if (IN.boost && !empty && this.boostCd <= 0) {
      const a = this.aim;
      this.vx += Math.cos(a) * CFG.boostAccel * dt;
      this.vy += Math.sin(a) * CFG.boostAccel * dt;
      this.fuel = clamp(this.fuel - CFG.fuelBoost * dt, 0, 100);
      this.boosting = true;
      if (Math.random() < dt * 60) {
        g.parts.add(this.x - Math.cos(a) * 10, this.y - Math.sin(a) * 10, -Math.cos(a) * rand(60, 160), -Math.sin(a) * rand(60, 160),
          rand(0.16, 0.34), rand(2.4, 4.4), 190, 100, 78, 0.9);
      }
    } else if (IN.boost && this.dash > 0 && this.boostCd <= 0) {
      this.useDash();
    }
    if (this.boosting && this.fuel <= 0.5) this.boostCd = CFG.boostRecharge;

    const sp = this.speed;
    if (sp > CFG.maxSpeed) { this.vx *= CFG.maxSpeed / sp; this.vy *= CFG.maxSpeed / sp; }
    this.fuel = clamp(this.fuel - CFG.fuelIdle * 0.5 * dt, 0, 100);

    /* gravity wells only bite near the capture band: flight stays straight */
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const cr = p.captureR * (this.gravityT > 0 ? 1.45 : 1);
      const dx = p.x - this.x, dy = p.y - this.y;
      const d = hyp(dx, dy);
      const inf = cr * 1.5;
      if (d < inf && d > 1) {
        const a = CFG.gravK * (1 - d / inf);
        this.vx += (dx / d) * a * dt;
        this.vy += (dy / d) * a * dt;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    /* arena walls are lethal */
    const R = CFG.shipR;
    if (this.x < R || this.y < R || this.x > ARENA.w - R || this.y > ARENA.h - R) {
      this.x = clamp(this.x, R, ARENA.w - R);
      this.y = clamp(this.y, R, ARENA.h - R);
      g.hitWall(this);
      return;
    }
    /* planets + capture */
    let best = null, bestD = Infinity, near = false;
    const since = g.time - this.launchTime;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const cr = p.captureR * (this.gravityT > 0 ? 1.45 : 1);
      const d = dst(this.x, this.y, p.x, p.y);
      if (d < cr * 1.5) near = true;
      if (d < p.r + R * 0.55) { g.hitCore(this, p); return; }
      if (this.locked.has(p)) {
        /* flown clear of the well -> it can capture again. The world we launched
           from only re-arms once we are actually out of it. */
        if (d > cr || (since > 1.4 && p !== this.launchPlanet)) this.locked.delete(p);
        else continue;
      }
      if (d < cr && d < bestD) { best = p; bestD = d; }
    }
    if (best) this.beginCapture(best);
  }
  useDash() {
    const g = this.game;
    if (this.dash <= 0) return;
    this.dash--;
    const a = this.aim;
    this.vx = Math.cos(a) * 720; this.vy = Math.sin(a) * 720;
    this.invuln = Math.max(this.invuln, 0.4);
    this.boostCd = 0.9;
    g.parts.burst(this.x, this.y, 26, { speed: 260, dir: a + Math.PI, spread: 1.4, life: 0.4, size: 3.2, hue: 190 });
    g.cam.kick(5);
    g.sfx.boost();
    g.popup(this.x, this.y - 22, 'DASH', 190, 15, 0.7);
  }
  updateAim(dt) {
    const g = this.game;
    if (IN.touch) {
      const t = this.lockTarget || g.nearestEnemy(this.x, this.y, 1200);
      this.aim = t ? Math.atan2(t.y - this.y, t.x - this.x)
                   : (this.speed > 20 ? Math.atan2(this.vy, this.vx) : this.rot);
    } else {
      const wx = g.cam.toWorldX(IN.mx), wy = g.cam.toWorldY(IN.my);
      this.aim = Math.atan2(wy - this.y, wx - this.x);
    }
  }
  updateWeapons(dt) {
    const g = this.game;
    if (g.state !== 'play') { this.lockT = 0; this.lockReady = false; return; }
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.mslCd > 0) this.mslCd -= dt;
    /* primary cannon */
    if (IN.fire && this.fireCd <= 0) {
      if (this.ammo > 0) {
        this.fireCd = CFG.cannonCd;
        this.ammo--;
        const a = this.aim + rand(-0.022, 0.022);
        const mx = this.x + Math.cos(a) * 13, my = this.y + Math.sin(a) * 13;
        g.bullets.spawn({ team: 0, kind: 'shot', x: mx, y: my,
          vx: Math.cos(a) * CFG.cannonSpeed + this.vx * 0.35, vy: Math.sin(a) * CFG.cannonSpeed + this.vy * 0.35,
          r: 3, dmg: CFG.cannonDmg, hue: 186, life: CFG.bulletLife });
        g.parts.add(mx, my, Math.cos(a) * 90, Math.sin(a) * 90, 0.1, 4, 190, 100, 88);
        g.parts.add(mx, my, Math.cos(a + 2) * 40, Math.sin(a + 2) * 40, 0.14, 2.6, 40, 100, 80);
        g.sfx.shoot();
      } else {
        this.fireCd = 0.4;
        g.sfx.ui();
        if (g.time - (this._dry || 0) > 1) { this._dry = g.time; g.popup(this.x, this.y - 24, 'NO AMMO', 348, 13, 0.8); }
      }
    }
    /* missile: hold to lock, release to fire */
    if (IN.missile) {
      const t = g.nearestEnemy(this.x, this.y, 1000, this.aim);
      this.lockTarget = t;
      if (t) {
        this.lockT += dt;
        if (!this.lockReady && this.lockT >= CFG.lockTime) {
          this.lockReady = true;
          g.sfx.lock();
          g.popup(t.x, t.y - t.r - 20, 'LOCKED', 52, 12, 0.7);
        }
      } else this.lockT = Math.max(0, this.lockT - dt);
    }
  }
  fireMissile() {
    const g = this.game;
    if (!this.alive || this.mslCd > 0) { this.lockT = 0; this.lockReady = false; return; }
    if (this.msl <= 0) { g.popup(this.x, this.y - 24, 'NO MISSILES', 348, 13, 0.8); g.sfx.ui(); this.lockT = 0; this.lockReady = false; return; }
    this.msl--; this.mslCd = CFG.mslCd;
    const a = this.aim;
    const locked = this.lockReady && this.lockTarget && this.lockTarget.alive;
    const t = locked ? this.lockTarget : null;
    g.bullets.spawn({ team: 0, kind: 'missile', x: this.x + Math.cos(a) * 12, y: this.y + Math.sin(a) * 12,
      vx: Math.cos(a) * 300 + this.vx * 0.5, vy: Math.sin(a) * 300 + this.vy * 0.5, speed: 300,
      r: 5, dmg: 64, hue: 34, life: 3.2, homing: 1, turn: locked ? 3.1 : 1.05, target: t });
    g.parts.burst(this.x, this.y, 12, { speed: 170, dir: a + Math.PI, spread: 1.2, life: 0.3, size: 2.6, hue: 34 });
    g.cam.kick(3);
    g.sfx.missile();
    this.lockT = 0; this.lockReady = false;
  }
  /* returns true when the hit was absorbed by shields */
  hurt(dmg, kind, x, y, silent) {
    if (!this.alive) return false;
    const g = this.game;
    if (this.invuln > 0 && !silent) return false;
    if (this.shieldGuard > 0 && kind !== 'wall' && kind !== 'core') {
      this.shieldGuard--;
      this.invuln = 0.6;
      g.parts.burst(this.x, this.y, 22, { speed: 200, life: 0.4, size: 3, hue: 200 });
      g.popup(this.x, this.y - 26, 'GUARD', 200, 14, 0.8);
      g.sfx.shieldHit();
      return true;
    }
    let left = dmg;
    if (this.shield > 0) {
      const use = Math.min(this.shield, left);
      this.shield -= use; left -= use;
      g.parts.burst(x || this.x, y || this.y, 8, { speed: 150, life: 0.3, size: 2.4, hue: 210 });
      if (!silent) g.sfx.shieldHit();
    }
    if (left > 0) {
      this.hull -= left;
      if (!silent) { g.sfx.hit(); g.cam.kick(Math.min(9, 2 + left * 0.25)); }
    }
    this.hitT = 0;
    if (!silent) this.invuln = Math.max(this.invuln, 0.3);
    g.parts.burst(this.x, this.y, 10, { speed: 170, life: 0.34, size: 2.6, hue: 18, lit: 70 });
    if (this.hull <= 0) { this.hull = 0; g.gameOver(kind === 'asteroid' ? 'asteroid' : kind === 'meteor' ? 'meteor' : kind === 'fireball' ? 'fireball' : 'hull', null); }
    return true;
  }
  resupply(fuel, ammo, msl, repair, shield, label) {
    const g = this.game;
    let msg = [];
    if (fuel) { this.fuel = clamp(this.fuel + fuel, 0, 100); msg.push('FUEL+' + fuel); }
    if (ammo) { this.ammo = clamp(this.ammo + ammo, 0, CFG.ammoMax); msg.push('AMMO+' + ammo); }
    if (msl) { this.msl = clamp(this.msl + msl, 0, CFG.mslMax); msg.push('MSL+' + msl); }
    if (repair) { this.hull = clamp(this.hull + repair, 0, CFG.hullMax); msg.push('HULL+' + repair); }
    if (shield) { this.shield = clamp(this.shield + shield, 0, CFG.shieldMax); msg.push('SHLD+' + shield); }
    if (msg.length) {
      g.popup(this.x, this.y - 34, msg.join(' '), 150, 13, 1.3);
      g.sfx.pickup();
    }
    if (label) g.popup(this.x, this.y - 52, label, 150, 11, 1.4);
  }
  update(dt) {
    if (!this.alive) return;
    const g = this.game;
    if (this.invuln > 0) this.invuln -= dt;
    for (const k of ['gravityT', 'slowT', 'boostT']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    this.hitT += dt;
    if (this.hitT > CFG.shieldDelay && this.shield < CFG.shieldMax) {
      const rate = CFG.shieldRegen * (this.planet && this.planet.faction === 'friendly' ? 2 : 1);
      this.shield = Math.min(CFG.shieldMax, this.shield + rate * dt);
    }
    if (this.state === 'orbit') this.updateOrbit(dt);
    else if (this.state === 'capture') this.updateCapture(dt);
    else this.updateFly(dt);
    if (!this.alive) return;

    if (this.state !== 'orbit') {
      const mx = this.x - this.lastX, my = this.y - this.lastY;
      if (mx * mx + my * my > 0.4) this.rot = angLerp(this.rot, Math.atan2(my, mx), Math.min(1, dt * 15));
    } else {
      this.rot = angLerp(this.rot, this.angle + this.dir * Math.PI / 2, Math.min(1, dt * 14));
    }
    this.lastX = this.x; this.lastY = this.y;
    this.updateAim(dt);
    this.updateWeapons(dt);
    this.emitTrail(dt);
  }
  emitTrail(dt) {
    const g = this.game;
    const free = this.state !== 'orbit';
    this.trailAcc += dt;
    const step = free ? 0.013 : 0.05;
    let guard = 0;
    while (this.trailAcc >= step && guard++ < 5) {
      this.trailAcc -= step;
      const back = free ? Math.atan2(this.vy, this.vx) + Math.PI : this.angle - this.dir * Math.PI / 2;
      const hue = this.boostT > 0 ? 150 : this.boosting ? 30 : 192;
      const s = free ? rand(30, 80) : rand(6, 22);
      const a = back + rand(-0.3, 0.3);
      g.parts.add(this.x - Math.cos(back) * 7, this.y - Math.sin(back) * 7,
        Math.cos(a) * s, Math.sin(a) * s,
        free ? rand(0.3, 0.55) : rand(0.22, 0.4),
        (free ? rand(2, 3.6) : rand(1.2, 2.2)) * (this.boosting ? 1.5 : 1),
        hue, 100, free ? 72 : 80, 0.9);
    }
  }
  draw(g, game) {
    if (!this.alive) return;
    const s = this;
    const blink = s.invuln > 0 && Math.sin(game.time * 40) < 0;

    /* orbit sweep */
    if (s.state === 'orbit' && s.planet) {
      const a0 = s.angle - s.dir * 0.85;
      const grad = g.createLinearGradient(
        s.planet.x + Math.cos(a0) * s.orbitR, s.planet.y + Math.sin(a0) * s.orbitR, s.x, s.y);
      const hue = s.boostT > 0 ? 150 : 190;
      grad.addColorStop(0, 'hsla(' + hue + ',100%,70%,0)');
      grad.addColorStop(1, 'hsla(' + hue + ',100%,84%,0.7)');
      g.strokeStyle = grad; g.lineWidth = 3;
      g.beginPath();
      if (s.dir > 0) g.arc(s.planet.x, s.planet.y, s.orbitR, a0, s.angle);
      else g.arc(s.planet.x, s.planet.y, s.orbitR, s.angle, a0);
      g.stroke();
    }

    const hue = s.boostT > 0 ? 150 : 192;
    g.globalCompositeOperation = 'lighter';
    glow(g, s.x, s.y, 28, hue, 100, 68, blink ? 0.2 : 0.42);
    g.globalCompositeOperation = 'source-over';

    g.save();
    g.translate(s.x, s.y);
    g.rotate(s.rot);
    /* engine flame */
    const free = s.state !== 'orbit';
    const flame = (free ? 1 : 0.35) * (s.boosting ? 2.5 : 1) * (s.thrusting ? 1.5 : 1);
    if (flame > 0.2) {
      const len = 12 + flame * 16 + rand(0, 5);
      const fg = g.createLinearGradient(-8, 0, -8 - len, 0);
      fg.addColorStop(0, 'rgba(255,255,255,0.95)');
      fg.addColorStop(0.35, s.boosting ? 'rgba(120,240,255,0.8)' : 'rgba(120,220,255,0.7)');
      fg.addColorStop(1, 'rgba(90,140,255,0)');
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(-7, 3.4); g.lineTo(-8 - len, 0); g.lineTo(-7, -3.4);
      g.closePath(); g.fill();
    }
    /* hull */
    g.globalAlpha = blink ? 0.45 : 1;
    g.shadowBlur = 12; g.shadowColor = 'hsla(' + hue + ',100%,70%,0.9)';
    g.fillStyle = '#eef8ff';
    shipPath(g, 1, true);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(90,200,255,0.7)'; g.lineWidth = 1;
    shipPath(g, 1, true); g.stroke();
    /* wing tips + cockpit */
    g.fillStyle = 'hsla(' + hue + ',100%,62%,0.95)';
    g.beginPath(); g.arc(2.4, 0, 2.4, 0, TAU); g.fill();
    g.fillStyle = 'rgba(120,220,255,0.85)';
    g.fillRect(-7.6, -8.4, 2.2, 2);
    g.fillRect(-7.6, 6.4, 2.2, 2);
    g.globalAlpha = 1;
    g.restore();

    /* aim + turret line while orbiting */
    if (s.state === 'orbit') {
      g.strokeStyle = 'rgba(120,220,255,0.25)';
      g.lineWidth = 1;
      g.setLineDash([3, 6]);
      g.beginPath();
      g.moveTo(s.x + Math.cos(s.aim) * 14, s.y + Math.sin(s.aim) * 14);
      g.lineTo(s.x + Math.cos(s.aim) * 46, s.y + Math.sin(s.aim) * 46);
      g.stroke();
      g.setLineDash([]);
    }
    /* shield bubble */
    if (s.shield > 1 || s.shieldGuard > 0) {
      const k = s.shield / CFG.shieldMax;
      g.strokeStyle = 'hsla(200,100%,74%,' + (0.1 + k * 0.22 + (s.hitT < 0.5 ? 0.4 : 0)).toFixed(3) + ')';
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(s.x, s.y, CFG.shipR + 7, 0, TAU); g.stroke();
      if (s.shieldGuard > 0) {
        g.strokeStyle = 'hsla(150,100%,74%,0.55)';
        g.setLineDash([4, 5]);
        g.beginPath(); g.arc(s.x, s.y, CFG.shipR + 12, game.time * 2, game.time * 2 + 5); g.stroke();
        g.setLineDash([]);
      }
    }
    /* lock reticle */
    if (IN.missile && s.lockTarget && s.lockTarget.alive) {
      const t = s.lockTarget;
      const k = clamp(s.lockT / CFG.lockTime, 0, 1);
      g.strokeStyle = k >= 1 ? 'hsla(52,100%,70%,0.95)' : 'hsla(52,100%,70%,0.45)';
      g.lineWidth = 2;
      const rr = t.r + 12 - k * 4;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4 + game.time * (k >= 1 ? 2.2 : 0.7);
        g.beginPath();
        g.arc(t.x, t.y, rr, a - 0.28, a + 0.28);
        g.stroke();
      }
    }
  }
}
/* ------------------------------------------------------------
   14. Game
   ------------------------------------------------------------ */
class Game {
  constructor() {
    this.cam = new Camera();
    this.parts = new ParticleSystem(CFG.maxParticles);
    this.bullets = new BulletPool(CFG.maxBullets);
    this.sfx = new Sfx();
    this.ship = new Ship(this);
    this.planets = [];
    this.enemies = [];
    this.asteroids = [];
    this.fireballs = [];
    this.meteors = [];
    this.pickups = [];
    this.popups = [];
    this.stars = [];
    this.nebula = [];
    this.state = 'menu';
    this.time = 0; this.timeScale = 1; this.slowT = 0;
    this.score = 0; this.cleared = 0; this.kills = 0;
    this.combo = 1; this.best = store.get('oe.best', 0);
    this.threat = 1; this.threatPts = 0;
    this.overAt = 0;
    this.fireballT = 14; this.showerT = 40; this.showerWarn = 0; this.showerActive = 0;
    this.bgGrad = null;
    this.hudCache = {};
    this.bannerT = 0;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.last = performance.now();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 240));
    document.addEventListener('visibilitychange', () => {
      this.last = performance.now();
      if (document.hidden && this.state === 'play') this.setPaused(true);
    });
    this.initWorld();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  /* ---------- viewport ---------- */
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w; this.h = h; this.dpr = dpr;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    this.cam.base = clamp(Math.min(w, h) / 900, 0.62, 1.05);
    this.cam.zoom = this.cam.base;
    this.cam.update(0.001);
    if (!IN.mouseSeen) { IN.mx = IN.cx = w / 2; IN.my = IN.cy = h / 2; }
    this.buildStars();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#080b1e');
    g.addColorStop(0.5, '#05060f');
    g.addColorStop(1, '#03030a');
    this.bgGrad = g;
  }
  buildStars() {
    const w = Math.max(this.w, 320), h = Math.max(this.h, 320);
    const layers = [
      { f: 0.04, n: 96, r: [0.5, 1.2], a: 0.3 },
      { f: 0.1, n: 66, r: [0.8, 1.7], a: 0.5 },
      { f: 0.2, n: 36, r: [1.1, 2.3], a: 0.8 },
    ];
    this.stars = layers.map((L) => {
      const arr = [];
      for (let i = 0; i < L.n; i++) {
        arr.push({ x: rand(0, w), y: rand(0, h), r: rand(L.r[0], L.r[1]),
          hue: chance(0.3) ? rand(190, 300) : rand(200, 220), tw: rand(0, TAU), sp: rand(0.6, 2.4), a: L.a * rand(0.55, 1) });
      }
      return { f: L.f, w, h, arr };
    });
    this.nebula = [];
    for (let i = 0; i < 4; i++) {
      this.nebula.push({ x: rand(0, w), y: rand(0, h), r: rand(260, 520), hue: pick([258, 200, 320, 176]), f: 0.02 + i * 0.018 });
    }
  }

  /* ---------- difficulty / generation ---------- */
  diff() {
    const s = this.cleared;
    const d = clamp(s / 28, 0, 1);
    const d2 = clamp((s - 28) / 44, 0, 1);
    const dd = clamp(d + d2 * 0.6, 0, 1);
    return {
      d: dd,
      rMin: lerp(30, 19, dd), rMax: lerp(44, 27, dd),
      orbit: lerp(CFG.orbitSlow, CFG.orbitFast, dd) + d2 * 26,
      astSpeed: lerp(30, 88, dd),
      astCount: Math.round(lerp(7, CFG.maxAsteroids, clamp(s / 46, 0, 1))),
      fireballEvery: lerp(17, 6.5, dd),
      showerEvery: s < 8 ? 0 : lerp(48, 24, dd),
      quick: lerp(1.8, 1.1, dd),
    };
  }
  rollFaction() {
    const t = this.threat;
    const w = {
      friendly: 22, neutral: 26 - t, enemy: 16 + t * 7,
      supply: 5, danger: 8 + t * 2.5,
    };
    let total = 0;
    for (const k in w) { w[k] = Math.max(0.5, w[k]); total += w[k]; }
    let r = Math.random() * total;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'neutral';
  }
  rollKinds() {
    const k = ['normal', 'normal', 'normal', 'normal'];
    if (this.threat >= 2) k.push('fast', 'gravity');
    if (this.threat >= 3) k.push('boost', 'gravity');
    return k;
  }
  initWorld() {
    this.planets.length = 0;
    this.enemies.length = 0;
    this.asteroids.length = 0;
    this.fireballs.length = 0;
    this.meteors.length = 0;
    this.pickups.length = 0;
    this.popups.length = 0;
    this.parts.clear();
    this.bullets.clear();
    this.cells = [];
    for (let cy = 0; cy < CELLS.rows; cy++) for (let cx = 0; cx < CELLS.cols; cx++) this.cells.push({ cx, cy });
    for (let i = 0; i < PLANET_COUNT; i++) {
      const p = new Planet(this.cells[i]);
      p.configure(this);
      this.planets.push(p);
    }
    /* home world: friendly, dead centre */
    let home = this.planets[0], bd = Infinity;
    for (const p of this.planets) {
      const d = d2(p.x, p.y, ARENA.w / 2, ARENA.h / 2);
      if (d < bd) { bd = d; home = p; }
    }
    home.faction = 'friendly';
    home.hue = FACTION.friendly.hue; home.sat = FACTION.friendly.sat;
    home.symbol = FACTION.friendly.symbol; home.label = 'HOME';
    home.turrets.length = 0;
    home.visited = true; home.resupplied = true;
    this.home = home;
    for (const p of this.planets) p.spawnT = 1;

    this.ship.reset();
    this.ship.attach(home, rand(0, TAU), home.spinDir);
    this.cam.snap(home.x, home.y);
    for (let i = 0; i < 8; i++) this.spawnAsteroid();
  }
  /* move a used planet to a fresh cell so the arena keeps refreshing */
  relocate(p) {
    let far = null, fd = -1;
    for (const c of this.cells) {
      const cw = ARENA.w / CELLS.cols, ch = ARENA.h / CELLS.rows;
      const d = dst(c.cx * cw + cw / 2, c.cy * ch + ch / 2, this.ship.x, this.ship.y);
      const owned = p.cell === c ? -1000 : 0;
      if (d + owned > fd) { fd = d + owned; far = c; }
    }
    p.cell = far;
    p.configure(this);
  }
  inFlightPath(x, y) {
    const s = this.ship;
    if (s.state === 'orbit' || !s.alive) return dst(x, y, s.x, s.y) < 260;
    const sp = s.speed || 1;
    const ahead = Math.min(900, sp * 1.4);
    const ux = s.vx / sp, uy = s.vy / sp;
    const rel = (x - s.x) * ux + (y - s.y) * uy;
    if (rel < -60 || rel > ahead) return dst(x, y, s.x, s.y) < 200;
    const perp = Math.abs((x - s.x) * uy - (y - s.y) * ux);
    return perp < 150;
  }
  spawnAsteroid() {
    if (this.asteroids.length >= CFG.maxAsteroids) return;
    const D = this.diff();
    for (let tries = 0; tries < 22; tries++) {
      const r = rand(9, 27);
      const x = rand(70, ARENA.w - 70), y = rand(70, ARENA.h - 70);
      if (dst(x, y, this.ship.x, this.ship.y) < 430) continue;
      if (this.inFlightPath(x, y)) continue;
      let ok = true;
      for (const p of this.planets) if (dst(x, y, p.x, p.y) < p.captureR + r + 24) { ok = false; break; }
      if (!ok) continue;
      for (const a of this.asteroids) if (dst(x, y, a.x, a.y) < a.r + r + 40) { ok = false; break; }
      if (!ok) continue;
      this.asteroids.push(new Asteroid(x, y, r, D.astSpeed));
      return;
    }
  }
  /* drifting rocks must never settle on an orbit ring — orbiting has to stay safe */
  keepRocksOffOrbits() {
    for (const a of this.asteroids) {
      for (const p of this.planets) {
        let dx = a.x - p.x, dy = a.y - p.y;
        let d = hyp(dx, dy);
        if (d < 1) { dx = 1; dy = 0; d = 1; }
        const band = p.orbitR + a.r + 10;
        if (d < band) {
          const push = band - d;
          a.x += (dx / d) * push;
          a.y += (dy / d) * push;
          const vn = (a.vx * dx + a.vy * dy) / d;
          if (vn < 0) { a.vx -= (dx / d) * vn * 1.7; a.vy -= (dy / d) * vn * 1.7; }
          a.x = clamp(a.x, a.r, ARENA.w - a.r);
          a.y = clamp(a.y, a.r, ARENA.h - a.r);
        }
      }
    }
  }
  spawnFireball() {
    if (this.fireballs.length >= CFG.maxFireballs) return;
    const side = randi(0, 3);
    const sp = rand(230, 330);
    let x, y;
    if (side === 0) { x = -40; y = rand(0, ARENA.h); }
    else if (side === 1) { x = ARENA.w + 40; y = rand(0, ARENA.h); }
    else if (side === 2) { x = rand(0, ARENA.w); y = -40; }
    else { x = rand(0, ARENA.w); y = ARENA.h + 40; }
    const tx = rand(ARENA.w * 0.2, ARENA.w * 0.8), ty = rand(ARENA.h * 0.2, ARENA.h * 0.8);
    const a = Math.atan2(ty - y, tx - x);
    const f = new Fireball(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(11, 17));
    this.fireballs.push(f);
    this.sfx.fireball();
    this.banner('FIREBALL INBOUND', 26, 0.6);
  }
  startShower() {
    this.showerWarn = 1.1;
    this.sfx.warn();
    this.banner('METEOR SHOWER!', 340, 1.1);
  }
  emitShower() {
    const side = randi(0, 3);
    const n = randi(7, 10);
    this.showerActive = n;
    for (let i = 0; i < n; i++) {
      const sp = rand(360, 520);
      let x, y, a;
      if (side === 0) { x = -50 - i * 60; y = rand(0, ARENA.h); a = rand(-0.35, 0.35); }
      else if (side === 1) { x = ARENA.w + 50 + i * 60; y = rand(0, ARENA.h); a = Math.PI + rand(-0.35, 0.35); }
      else if (side === 2) { x = rand(0, ARENA.w); y = -50 - i * 60; a = Math.PI / 2 + rand(-0.35, 0.35); }
      else { x = rand(0, ARENA.w); y = ARENA.h + 50 + i * 60; a = -Math.PI / 2 + rand(-0.35, 0.35); }
      const m = new Meteor(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(11, 21));
      m.shower = true;
      this.meteors.push(m);
    }
    this.sfx.warn();
  }
  spawnEnemy(home, forced, sx, sy) {
    if (this.enemies.length >= this.enemyCap()) return null;
    const roster = THREAT_ROSTER[clamp(this.threat - 1, 0, 4)];
    const type = forced || pick(roster);
    let x, y;
    if (sx !== undefined) { x = sx; y = sy; }
    else {
      const h = home || this.farthestEnemyPlanet();
      if (!h) return null;
      const a = rand(0, TAU), rr = h.orbitR + 30;
      x = h.x + Math.cos(a) * rr; y = h.y + Math.sin(a) * rr;
    }
    if (dst(x, y, this.ship.x, this.ship.y) < 300) { x += 340; y += 200; }
    x = clamp(x, 40, ARENA.w - 40); y = clamp(y, 40, ARENA.h - 40);
    const e = new Enemy(type, x, y, home || null, this);
    this.enemies.push(e);
    this.parts.burst(x, y, 12, { speed: 140, life: 0.4, size: 2.4, hue: e.hue });
    return e;
  }
  farthestEnemyPlanet() {
    let best = null, bd = -1;
    for (const p of this.planets) {
      if (!p.hostile || p.cleared) continue;
      const d = dst(p.x, p.y, this.ship.x, this.ship.y);
      if (d > 500 && d < 1400 && d > bd) { bd = d; best = p; }
    }
    if (best) return best;
    for (const p of this.planets) if (p.hostile && !p.cleared) return p;
    return null;
  }
  enemyCap() {
    const boss = this.enemies.some((e) => e.boss) ? 2 : 0;
    return clamp(2 + this.threat, 2, CFG.maxEnemies) + boss;
  }
  bossT = 0;
  spawnBoss() {
    const type = pick(['destroyer', 'carrier', 'hunter']);
    const home = this.farthestEnemyPlanet() || this.planets[randi(0, this.planets.length - 1)];
    const a = rand(0, TAU);
    const x = clamp(home.x + Math.cos(a) * (home.orbitR + 60), 60, ARENA.w - 60);
    const y = clamp(home.y + Math.sin(a) * (home.orbitR + 60), 60, ARENA.h - 60);
    const e = new Enemy(type, x, y, home, this);
    this.enemies.push(e);
    this.banner(type.toUpperCase() + ' INBOUND', e.hue, 1.4);
    this.sfx.warn();
    this.cam.kick(6);
  }

  /* ---------- helpers used by entities ---------- */
  lineOfSight(ax, ay, bx, by) {
    const steps = 5;
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = lerp(ax, bx, t), y = lerp(ay, by, t);
      for (const p of this.planets) if (d2(x, y, p.x, p.y) < p.r * p.r) return false;
    }
    return true;
  }
  nearestEnemy(x, y, maxD, aim) {
    let best = null, bs = maxD * maxD;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = d2(x, y, e.x, e.y);
      if (d > bs) continue;
      if (aim !== undefined && Math.abs(angDelta(aim, Math.atan2(e.y - y, e.x - x))) > 1.2) {
        if (d > 260 * 260) continue;
      }
      bs = d; best = e;
    }
    return best;
  }
  addScore(n, x, y, label, hue) {
    this.score += n;
    if (label) this.popup(x, y, label, hue, 20, 1.1);
    dom.score.textContent = String(this.score);
    dom.score.classList.remove('pop');
    void dom.score.offsetWidth;
    dom.score.classList.add('pop');
  }
  popup(x, y, text, hue, size, life) {
    if (this.popups.length > 26) this.popups.shift();
    this.popups.push({ x, y, text, hue: hue === undefined ? 190 : hue, size: size || 20, life: life || 1.2, max: life || 1.2 });
  }
  banner(text, hue, dur) {
    dom.banner.innerHTML = '<b style="color:hsl(' + hue + ',100%,70%)">' + text + '</b>';
    dom.banner.classList.remove('show');
    void dom.banner.offsetWidth;
    dom.banner.classList.add('show');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => dom.banner.classList.remove('show'), (dur || 1.1) * 1000);
  }
  setCombo(v) {
    this.combo = clamp(v, 1, 8);
    if (this.combo > 1) {
      dom.comboVal.textContent = 'x' + this.combo;
      dom.combo.classList.add('on');
    } else dom.combo.classList.remove('on');
  }
  dropLoot(e) {
    const roll = Math.random();
    const kinds = [];
    if (e.T.fuel) kinds.push('fuel');
    if (e.T.ammo) kinds.push('ammo');
    if (roll < 0.16) kinds.push('msl');
    if (roll > 0.86) kinds.push('shield');
    if (roll > 0.72 && roll < 0.8) kinds.push('repair');
    if (e.boss) { kinds.push('power', 'score', 'fuel', 'ammo'); }
    else if (roll > 0.94) kinds.push('power');
    for (const k of kinds) {
      if (this.pickups.length >= CFG.maxPickups) break;
      const power = k === 'power' ? pick(['shield', 'slow', 'gravity', 'dash']) : null;
      this.pickups.push(new Pickup(e.x + rand(-14, 14), e.y + rand(-14, 14), k, power));
    }
  }
  planetClearedCheck(p) {
    if (p.turrets.length === 0 && !p.cleared) {
      p.cleared = true;
      this.addScore(200, p.x, p.y - p.r - 30, 'WORLD SECURED', 150);
      this.banner(p.name + ' SECURED', 150, 1.1);
      this.sfx.capture(4);
    }
  }

  /* ---------- gameplay events ---------- */
  onLaunch(ship, speed, boosted) {
    this.sfx.launch();
    const hue = boosted ? 150 : 192;
    this.parts.burst(ship.x, ship.y, 16, { speed: 160, dir: Math.atan2(ship.vy, ship.vx) + Math.PI, spread: 1.5, life: 0.4, size: 2.6, hue });
    this.cam.punchZoom(-0.03);
  }
  onCapture(ship, p, dir) {
    p.flash = 1;
    this.parts.burst(ship.x, ship.y, 24, { speed: 140, dir: Math.atan2(ship.y - p.y, ship.x - p.x), spread: 2.6, life: 0.5, size: 2.6, hue: p.hue, sat: p.sat });
    this.cam.punchZoom(0.055);
    this.cam.kick(3);
    if (ship.entryB < p.r + 30 || ship.entrySpeed > 470) {
      this.timeScale = 0.4; this.slowT = 0.4;
      if (ship.entryB < p.r + 30) this.popup(p.x, p.y - p.r - 58, 'THREADED', 42, 14, 0.9);
    }
    const isNew = !p.visited;
    p.visited = true;
    const quick = ship.linger < this.diff().quick;
    if (isNew) {
      this.cleared++;
      this.threatPts += 1;
      this.setCombo(quick ? this.combo + 1 : 1);
      const gained = Math.round(SCORE.planet * p.rewardMul * this.combo);
      this.addScore(gained, p.x, p.y - p.r - 32, '+' + gained, p.hue);
      if (this.combo > 1 && quick) this.popup(p.x, p.y - p.r - 58, 'COMBO x' + this.combo, 150, 15, 1);
      this.sfx.capture(clamp(this.combo - 1, 0, 7));
      dom.tip.classList.add('off');
    } else {
      this.setCombo(1);
      this.sfx.capture(0);
    }
    /* resupply: friendly and supply worlds service the ship */
    if (!p.resupplied) {
      p.resupplied = true;
      if (p.faction === 'friendly') ship.resupply(38, 30, 1, 8, 14, 'RESUPPLIED');
      else if (p.faction === 'supply') ship.resupply(85, 72, 3, 26, CFG.shieldMax, 'SUPPLY DEPOT');
      else if (p.faction === 'neutral') ship.resupply(14, 10, 0, 0, 0, null);
      else if (p.faction === 'danger') ship.resupply(0, 16, 1, 0, 0, 'SALVAGE');
      else ship.resupply(6, 6, 0, 0, 0, p.cleared ? 'CLEARED' : 'HOSTILE');
      if (p.kind === 'boost') {
        ship.boostT = 4.5;
        this.popup(p.x, p.y - p.r - 80, 'BOOST', 150, 16, 1.1);
        this.sfx.boost();
      }
    }
    if (p.faction === 'danger') this.popup(p.x, p.y - p.r - 80, 'RADIATION', 344, 12, 1.4);
    /* the arena keeps turning over: recycle a far, spent world */
    let cand = null, cd = -1;
    for (const q of this.planets) {
      if (q === p || q === ship.planet || q === ship.capPlanet) continue;
      if (!q.visited) continue;
      const d = dst(q.x, q.y, this.ship.x, this.ship.y);
      if (d > 1000 && d > cd) { cd = d; cand = q; }
    }
    if (cand) this.relocate(cand);
    else {
      for (const q of this.planets) {
        if (q === p || !q.visited) continue;
        const d = dst(q.x, q.y, this.ship.x, this.ship.y);
        if (d > 760 && d > cd) { cd = d; cand = q; }
      }
      if (cand) this.relocate(cand);
    }
  }
  hitWall(ship) {
    if (!ship.alive) return;
    this.gameOver('wall', null);
    ship.x = clamp(ship.x, CFG.shipR, ARENA.w - CFG.shipR);
    ship.y = clamp(ship.y, CFG.shipR, ARENA.h - CFG.shipR);
  }
  hitCore(ship, p) {
    this.gameOver(p.faction === 'danger' ? 'radiation' : 'planet', p);
  }

  gameOver(kind, detail) {
    if (this.state !== 'play') return;
    this.state = 'over';
    this.overAt = performance.now();
    const s = this.ship;
    s.alive = false;
    s.planet = null; s.capPlanet = null;
    this.timeScale = 0.22;
    this.slowT = 1.1;
    this.cam.kick(34);
    this.cam.punchZoom(0.1);
    this.parts.burst(s.x, s.y, 90, { speed: 340, life: 1.1, size: 3.6, hue: 26, sat: 100, lit: 66, drag: 0.974 });
    this.parts.burst(s.x, s.y, 34, { speed: 200, life: 0.8, size: 2.4, hue: 190 });
    this.bullets.clear();
    dom.flash.classList.remove('hit');
    void dom.flash.offsetWidth;
    dom.flash.classList.add('hit');
    this.sfx.impact();
    this.sfx.over();
    const reasons = {
      wall: 'Slammed the arena wall',
      planet: detail ? 'Crashed into ' + detail.name : 'Crashed into a planet',
      radiation: detail ? 'Burned up in ' + detail.name + "'s corona" : 'Vaporised',
      asteroid: 'Shredded by an asteroid',
      fireball: 'Swallowed by a fireball',
      meteor: 'Struck by a meteor',
      drone: 'Detonated by a drone',
      hull: detail || 'Hull breached',
    };
    const newBest = this.score > this.best;
    if (newBest) { this.best = this.score; store.set('oe.best', this.best); }
    dom.overReason.textContent = reasons[kind] || 'Run ended';
    dom.finalScore.textContent = String(this.score);
    dom.finalBest.textContent = String(this.best);
    dom.finalPlanets.textContent = String(this.cleared);
    dom.finalKills.textContent = String(this.kills);
    dom.newBest.classList.toggle('on', newBest);
    dom.combo.classList.remove('on');
    dom.edgeWarn.style.opacity = '0';
    dom.hud.classList.remove('on');
    document.body.classList.remove('playing');
    setTimeout(() => { if (this.state === 'over') dom.overScreen.classList.add('show'); }, 950);
  }

  setPaused(on) {
    if (on && this.state === 'play') {
      this.state = 'paused';
      dom.pauseScreen.classList.add('show');
      dom.hud.classList.remove('on');
      document.body.classList.remove('playing');
    } else if (!on && this.state === 'paused') {
      this.state = 'play';
      dom.pauseScreen.classList.remove('show');
      dom.hud.classList.add('on');
      document.body.classList.add('playing');
      this.last = performance.now();
    }
  }
  togglePause() {
    if (this.state === 'play') this.setPaused(true);
    else if (this.state === 'paused') this.setPaused(false);
  }
  start() {
    this.sfx.resume();
    this.sfx.ui();
    this.score = 0; this.cleared = 0; this.kills = 0;
    this.combo = 1; this.threat = 1; this.threatPts = 0;
    this.time = 0; this.timeScale = 1; this.slowT = 0;
    this.fireballT = 16; this.showerT = 46; this.showerWarn = 0; this.showerActive = 0;
    this.bossT = 75;
    this.initWorld();
    this.setCombo(1);
    this.state = 'play';
    dom.startScreen.classList.remove('show');
    dom.overScreen.classList.remove('show');
    dom.pauseScreen.classList.remove('show');
    dom.hud.classList.add('on');
    document.body.classList.add('playing');
    this.updateHud(true);
  }
  toMenu() {
    this.state = 'menu';
    document.body.classList.remove('playing');
    dom.hud.classList.remove('on');
    dom.pauseScreen.classList.remove('show');
    dom.overScreen.classList.remove('show');
    dom.startScreen.classList.add('show');
    this.score = 0; this.cleared = 0; this.kills = 0; this.threat = 1; this.threatPts = 0;
    this.initWorld();
    this.updateHud(true);
  }

  /* ---------- collisions ---------- */
  checkBullets() {
    const s = this.ship;
    for (const b of this.bullets.items) {
      if (!b.active) continue;
      const hitR = b.r;
      /* absorbed by planet bodies */
      for (const p of this.planets) {
        if (segPointDist2(p.x, p.y, b.px, b.py, b.x, b.y) < (p.r + hitR) * (p.r + hitR)) {
          b.active = false;
          this.parts.burst(b.x, b.y, 4, { speed: 90, life: 0.2, size: 1.8, hue: b.hue });
          break;
        }
      }
      if (!b.active) continue;
      if (b.team === 0) {
        /* player fire: enemies, turrets, rocks, incoming missiles */
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (segPointDist2(e.x, e.y, b.px, b.py, b.x, b.y) < (e.r + hitR) * (e.r + hitR)) {
            e.hurt(b.dmg, this);
            if (b.kind === 'missile') {
              this.parts.burst(b.x, b.y, 26, { speed: 240, life: 0.5, size: 3, hue: 34 });
              this.cam.kick(4);
              this.sfx.kill(1);
            }
            b.active = false;
            break;
          }
        }
        if (!b.active) continue;
        for (const p of this.planets) {
          let done = false;
          for (const t of p.turrets) {
            if (!t.alive) continue;
            if (segPointDist2(t.x, t.y, b.px, b.py, b.x, b.y) < (t.r + hitR) * (t.r + hitR)) {
              t.hurt(b.dmg, this); b.active = false; done = true; break;
            }
          }
          if (done) break;
        }
        if (!b.active) continue;
        for (const a of this.asteroids) {
          if (segPointDist2(a.x, a.y, b.px, b.py, b.x, b.y) < (a.r + hitR) * (a.r + hitR)) {
            a.hp -= b.dmg; a.flash = 1;
            this.parts.burst(b.x, b.y, 5, { speed: 120, life: 0.25, size: 2, hue: 28 });
            if (a.hp <= 0) {
              this.parts.burst(a.x, a.y, 18, { speed: 190, life: 0.5, size: 2.8, hue: 26, sat: 70, lit: 62 });
              this.sfx.kill(0);
              this.addScore(20, a.x, a.y, '+20', 28);
              this.asteroids.splice(this.asteroids.indexOf(a), 1);
            }
            b.active = false;
            break;
          }
        }
        if (!b.active) continue;
        for (const m of this.meteors) {
          if (segPointDist2(m.x, m.y, b.px, b.py, b.x, b.y) < (m.r + hitR + 6) * (m.r + hitR + 6)) {
            this.parts.burst(m.x, m.y, 22, { speed: 220, life: 0.5, size: 3, hue: 30 });
            this.sfx.kill(1);
            this.addScore(40, m.x, m.y, '+40', 34);
            this.meteors.splice(this.meteors.indexOf(m), 1);
            if (m.shower) this.showerActive = Math.max(0, this.showerActive - 1);
            b.active = false;
            break;
          }
        }
        if (!b.active) continue;
        for (const f of this.fireballs) {
          if (segPointDist2(f.x, f.y, b.px, b.py, b.x, b.y) < (f.r + hitR + 4) * (f.r + hitR + 4)) {
            this.parts.burst(f.x, f.y, 24, { speed: 220, life: 0.5, size: 3, hue: 28 });
            this.sfx.kill(0);
            this.addScore(60, f.x, f.y, '+60', 26);
            this.fireballs.splice(this.fireballs.indexOf(f), 1);
            b.active = false;
            break;
          }
        }
        if (!b.active) continue;
        /* shoot down enemy missiles */
        for (const o of this.bullets.items) {
          if (!o.active || o.team === 0 || o.kind !== 'missile') continue;
          if (segPointDist2(o.x, o.y, b.px, b.py, b.x, b.y) < (o.r + hitR + 8) * (o.r + hitR + 8)) {
            o.active = false; b.active = false;
            this.parts.burst(o.x, o.y, 20, { speed: 210, life: 0.45, size: 2.8, hue: 22 });
            this.addScore(SCORE.enemyMissile, o.x, o.y, '+' + SCORE.enemyMissile, 22);
            this.sfx.kill(0);
            break;
          }
        }
      } else if (s.alive) {
        /* enemy fire at the player */
        const rr = CFG.shipR * 0.85 + hitR;
        if (segPointDist2(s.x, s.y, b.px, b.py, b.x, b.y) < rr * rr) {
          b.active = false;
          if (s.hurt(b.dmg, 'projectile', b.x, b.y)) {
            if (b.kind === 'missile') {
              this.parts.burst(b.x, b.y, 26, { speed: 240, life: 0.5, size: 3, hue: 22 });
              this.cam.kick(8);
            }
          }
          continue;
        }
        /* close dodge: only counts while running in the open, and only for a
           genuinely near miss — otherwise orbiting in a firefight prints points */
        if (!b.grazed && s.state === 'fly') {
          const near2 = segPointDist2(s.x, s.y, b.px, b.py, b.x, b.y);
          if (near2 < 34 * 34) {
            b.grazed = true;
            this.addScore(SCORE.dodge, s.x, s.y - 26, 'CLOSE DODGE +' + SCORE.dodge, 190);
            this.sfx.score();
          }
        }
      }
    }
  }
  checkHazards(dt) {
    const s = this.ship;
    if (!s.alive) return;
    const px = s.lastX, py = s.lastY;
    const R = CFG.shipR;

    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      const d = dst(s.x, s.y, a.x, a.y);
      if (d < a.r + R * 0.8) {
        if (s.state === 'orbit') { continue; }
        if (s.hurt(a.dmg, 'asteroid', s.x, s.y)) {
          this.parts.burst(a.x, a.y, 22, { speed: 230, life: 0.5, size: 3, hue: 26, sat: 80 });
          this.cam.kick(11);
          this.sfx.impact();
          const a2 = Math.atan2(s.y - a.y, s.x - a.x);
          s.vx = Math.cos(a2) * 320; s.vy = Math.sin(a2) * 320;
          s.invuln = Math.max(s.invuln, 0.5);
        }
        continue;
      }
      if (s.state === 'fly' && !a.grazed && d < a.r + R + CFG.grazePad) {
        a.grazed = true;
        this.addScore(SCORE.dodge, s.x, s.y - 26, 'CLOSE CALL +' + SCORE.dodge, 42);
        this.sfx.score();
      }
    }
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      if (dst(s.x, s.y, f.x, f.y) < f.r + R * 0.85) {
        this.parts.burst(f.x, f.y, 34, { speed: 260, life: 0.6, size: 3.4, hue: 26 });
        this.fireballs.splice(i, 1);
        this.cam.kick(12);
        this.sfx.impact();
        s.hurt(f.dmg, 'fireball', s.x, s.y);
      }
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (dst(s.x, s.y, m.x, m.y) < m.r + R * 0.85) {
        this.parts.burst(m.x, m.y, 40, { speed: 300, life: 0.7, size: 3.6, hue: 30 });
        this.meteors.splice(i, 1);
        if (m.shower) this.showerActive = Math.max(0, this.showerActive - 1);
        this.cam.kick(14);
        this.sfx.impact();
        s.hurt(m.dmg, 'meteor', s.x, s.y);
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) { this.enemies.splice(i, 1); continue; }
      const d = dst(s.x, s.y, e.x, e.y);
      if (d < e.r + R * 0.8) {
        if (e.type === 'drone') {
          e.die(this);
          this.parts.burst(e.x, e.y, 44, { speed: 320, life: 0.7, size: 3.4, hue: 348 });
          this.cam.kick(16);
          this.sfx.impact();
          s.hurt(e.T.dmg, 'drone', s.x, s.y);
        } else {
          s.hurt(9, 'ram', s.x, s.y);
          const a = Math.atan2(s.y - e.y, s.x - e.x);
          s.vx += Math.cos(a) * 160; s.vy += Math.sin(a) * 160;
          e.hurt(12, this);
        }
      }
      if (e.home && dst(e.x, e.y, e.home.x, e.home.y) > 2200) { e.alive = false; }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const o = this.pickups[i];
      if (o.life <= 0) { this.pickups.splice(i, 1); continue; }
      if (dst(s.x, s.y, o.x, o.y) < o.r + R + 4) {
        this.pickups.splice(i, 1);
        this.collect(o);
      }
    }
  }
  collect(o) {
    const s = this.ship, D = DROP[o.kind];
    switch (o.kind) {
      case 'fuel': s.resupply(26, 0, 0, 0, 0, null); this.popup(o.x, o.y - 20, 'FUEL CELL', 46, 13, 0.9); break;
      case 'ammo': s.resupply(0, 20, 0, 0, 0, null); this.popup(o.x, o.y - 20, 'AMMO CRATE', 190, 13, 0.9); break;
      case 'msl': s.resupply(0, 0, 2, 0, 0, null); this.popup(o.x, o.y - 20, 'MISSILES', 276, 13, 0.9); break;
      case 'shield': s.resupply(0, 0, 0, 0, 30, null); this.popup(o.x, o.y - 20, 'SHIELD CELLS', 210, 13, 0.9); break;
      case 'repair': s.resupply(0, 0, 0, 24, 0, null); this.popup(o.x, o.y - 20, 'REPAIR KIT', 150, 13, 0.9); break;
      case 'score': this.addScore(SCORE.rare, o.x, o.y - 20, '+' + SCORE.rare, 52); break;
      case 'power': this.applyPower(o.power, o); break;
      default: this.sfx.pickup();
    }
    this.parts.burst(o.x, o.y, 12, { speed: 130, life: 0.4, size: 2.4, hue: D.hue });
    if (o.kind !== 'score') this.sfx.pickup();
  }
  applyPower(kind, o) {
    const s = this.ship;
    const names = { shield: 'GUARD', slow: 'CHRONO', gravity: 'TRACTOR', dash: 'DASH' };
    const hues = { shield: 200, slow: 276, gravity: 150, dash: 30 };
    if (kind === 'shield') s.shieldGuard = Math.min(3, s.shieldGuard + 1);
    else if (kind === 'slow') s.slowT = Math.max(s.slowT, 4.5);
    else if (kind === 'gravity') s.gravityT = Math.max(s.gravityT, 10);
    else if (kind === 'dash') s.dash = Math.min(3, s.dash + 1);
    this.banner(names[kind], hues[kind], 0.8);
    this.popup(o.x, o.y - 22, names[kind] + ' ONLINE', hues[kind], 14, 1.1);
    this.sfx.boost();
  }

  /* ---------- update ---------- */
  updateThreat(dt) {
    this.threatPts += dt * 0.05;
    const p = this.threatPts;
    const t = 1 + (p >= 6 ? 1 : 0) + (p >= 14 ? 1 : 0) + (p >= 26 ? 1 : 0) + (p >= 44 ? 1 : 0);
    if (t !== this.threat) {
      this.threat = clamp(t, 1, 5);
      this.banner('THREAT LEVEL ' + this.threat, 348, 1.1);
      this.sfx.warn();
    }
  }
  update(dtRaw) {
    if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - dtRaw);
    else this.timeScale += (1 - this.timeScale) * Math.min(1, dtRaw * 3.6);
    const dt = dtRaw * this.timeScale;
    this.time += dt;
    const slow = this.ship.slowT > 0 ? 0.45 : 1;
    const edt = dt * slow;

    for (const p of this.planets) { p.update(dt, this); p.spawnLogic(edt, this); }
    this.parts.update(dt);
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const q = this.popups[i];
      q.life -= dtRaw; q.y -= dtRaw * 20;
      if (q.life <= 0) this.popups.splice(i, 1);
    }

    if (this.state === 'play') {
      const s = this.ship;
      const px = s.x, py = s.y;
      const spd = s.speed;
      const steps = clamp(Math.ceil((spd * dt) / 11), 1, 4);
      for (let i = 0; i < steps && s.alive && this.state === 'play'; i++) s.update(dt / steps);
      if (s.state === 'orbit' && !inArena(s.x, s.y, CFG.shipR)) this.hitWall(s);

      this.updateThreat(dt);
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.update(edt, this);
        if (!e.alive) this.enemies.splice(i, 1);
      }
      this.bullets.update(dt, this);
      for (const a of this.asteroids) a.update(edt);
      this.keepRocksOffOrbits();
      for (let i = this.fireballs.length - 1; i >= 0; i--) {
        this.fireballs[i].update(edt, this);
        if (this.fireballs[i].dead()) this.fireballs.splice(i, 1);
      }
      for (let i = this.meteors.length - 1; i >= 0; i--) {
        const m = this.meteors[i];
        m.update(edt, this);
        if (m.dead()) { if (m.shower) this.showerActive = Math.max(0, this.showerActive - 1); this.meteors.splice(i, 1); }
      }
      for (const o of this.pickups) o.update(dt, this);

      this.checkBullets();
      this.checkHazards(dt);

      /* hazard population */
      const D = this.diff();
      const want = D.astCount;
      if (this.asteroids.length < want && Math.random() < dt * 0.9) this.spawnAsteroid();
      if (this.cleared >= 4) {
        this.fireballT -= dt;
        if (this.fireballT <= 0) { this.fireballT = D.fireballEvery * rand(0.8, 1.25); this.spawnFireball(); }
      }
      if (D.showerEvery) {
        this.showerT -= dt;
        if (this.showerT <= 0 && this.showerWarn <= 0 && this.showerActive <= 0) { this.showerT = D.showerEvery * rand(0.85, 1.3); this.startShower(); }
      }
      if (this.showerWarn > 0) {
        this.showerWarn -= dt;
        if (this.showerWarn <= 0) this.emitShower();
      } else if (this.showerActive > 0 && this.meteors.length === 0) {
        this.showerActive = 0;
        this.addScore(SCORE.shower, s.x, s.y - 40, 'SHOWER SURVIVED +' + SCORE.shower, 150);
        this.banner('SHOWER SURVIVED', 150, 1.1);
      }
      if (this.threat >= 3) {
        this.bossT -= dt;
        if (this.bossT <= 0 && !this.enemies.some((e) => e.boss)) {
          this.bossT = rand(80, 120);
          this.spawnBoss();
        }
      }
      /* camera */
      const lead = s.state === 'orbit' ? 0.06 : 0.1;
      this.cam.follow(s.x + s.vx * lead, s.y + s.vy * lead, s.state === 'orbit' ? 6 : 4.4, dt);
      /* wall proximity warning */
      const m = 340;
      const near = clamp(1 - Math.min(s.x, s.y, ARENA.w - s.x, ARENA.h - s.y) / m, 0, 1);
      dom.edgeWarn.style.opacity = (near * 0.8).toFixed(3);
      this.wallProx = near;
    } else if (this.state === 'menu') {
      this.ship.update(dt);
      this.cam.follow(this.home.x, this.home.y, 3, dt);
      this.wallProx = 0;
    } else if (this.state === 'over') {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.update(edt, this);
        if (!e.alive) this.enemies.splice(i, 1);
      }
      this.bullets.update(edt, this);
      for (const a of this.asteroids) a.update(edt);
      this.cam.follow(this.ship.x, this.ship.y, 2.6, dt);
      this.wallProx = 0;
    } else {
      this.cam.update(dtRaw);
      return;
    }
    this.cam.update(dtRaw);
    this.updateHud(false);
  }

  /* ---------- HUD ---------- */
  set(key, el, value) {
    if (this.hudCache[key] !== value) { this.hudCache[key] = value; el.textContent = value; }
  }
  updateHud(force) {
    const s = this.ship;
    this.set('score', dom.score, String(this.score));
    this.set('best', dom.best, 'BEST ' + this.best);
    const hull = clamp(s.hull / CFG.hullMax, 0, 1);
    const shld = clamp(s.shield / CFG.shieldMax, 0, 1);
    const fuel = clamp(s.fuel / 100, 0, 1);
    dom.hullFill.style.transform = 'scaleX(' + hull.toFixed(3) + ')';
    dom.shieldFill.style.transform = 'scaleX(' + shld.toFixed(3) + ')';
    dom.fuelFill.style.transform = 'scaleX(' + fuel.toFixed(3) + ')';
    this.set('hull', dom.hullVal, String(Math.ceil(s.hull)));
    this.set('shld', dom.shieldVal, String(Math.ceil(s.shield)));
    this.set('fuel', dom.fuelVal, Math.round(s.fuel) + '%');
    this.set('ammo', dom.ammoVal, String(s.ammo));
    this.set('ammomax', dom.ammoMax, String(CFG.ammoMax));
    this.set('msl', dom.mslVal, String(s.msl));
    this.set('mslmax', dom.mslMax, String(CFG.mslMax));
    dom.ammoVal.parentElement.classList.toggle('empty', s.ammo === 0);
    dom.fuelFill.parentElement.classList.toggle('low', s.fuel < 20);
    this.set('threat', dom.threatVal, String(this.threat));
    if (force || this._pips !== this.threat) {
      this._pips = this.threat;
      let html = '';
      for (let i = 0; i < 5; i++) html += '<i class="' + (i < this.threat ? 'on' : '') + '"></i>';
      dom.threatPips.innerHTML = html;
    }
    /* current target readout — built once, then only patched on change */
    const t = s.lockTarget && s.lockTarget.alive ? s.lockTarget : this.nearestEnemy(s.x, s.y, 900);
    if (t) {
      if (!this._tgtEl) {
        dom.target.innerHTML = '<span></span><i><b></b></i>';
        this._tgtEl = dom.target.querySelector('span');
        this._tgtBar = dom.target.querySelector('b');
      }
      dom.target.classList.add('on');
      const label = t.name + ' ' + Math.ceil(t.hp);
      if (this._tgt !== label) { this._tgt = label; this._tgtEl.textContent = label; }
      this._tgtBar.style.transform = 'scaleX(' + clamp(t.hp / t.max, 0, 1).toFixed(3) + ')';
    } else if (this._tgt !== '') {
      this._tgt = '';
      dom.target.classList.remove('on');
    }
    /* active power-up chips */
    const chips = [];
    if (s.shieldGuard > 0) chips.push('GUARD ' + s.shieldGuard);
    if (s.gravityT > 0) chips.push('TRACTOR ' + Math.ceil(s.gravityT) + 's');
    if (s.slowT > 0) chips.push('CHRONO ' + s.slowT.toFixed(1) + 's');
    if (s.dash > 0) chips.push('DASH ' + s.dash);
    if (s.boostT > 0) chips.push('BOOST ' + Math.ceil(s.boostT) + 's');
    const key = chips.join('|');
    if (this._chips !== key) {
      this._chips = key;
      dom.mods.innerHTML = chips.map((c) => '<b>' + c + '</b>').join('');
    }
  }

  /* ---------- draw ---------- */
  drawBackground() {
    const c = ctx, w = this.w, h = this.h;
    c.fillStyle = this.bgGrad;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    for (const n of this.nebula) {
      const x = mod(n.x - this.cam.x * n.f, w + 700) - 350;
      const y = mod(n.y - this.cam.y * n.f, h + 700) - 350;
      const g = c.createRadialGradient(x, y, 0, x, y, n.r);
      g.addColorStop(0, 'hsla(' + n.hue + ',80%,62%,0.07)');
      g.addColorStop(1, 'hsla(' + n.hue + ',80%,60%,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, n.r, 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    const zx = this.cam.x * this.cam.zoom, zy = this.cam.y * this.cam.zoom;
    for (const L of this.stars) {
      for (const s of L.arr) {
        const x = mod(s.x - zx * L.f, L.w), y = mod(s.y - zy * L.f, L.h);
        const tw = 0.7 + 0.3 * Math.sin(this.time * s.sp + s.tw);
        c.fillStyle = 'hsla(' + s.hue + ',70%,' + (76 + s.r * 5) + '%,' + (s.a * tw).toFixed(3) + ')';
        c.beginPath(); c.arc(x, y, s.r, 0, TAU); c.fill();
      }
    }
  }
  drawArena() {
    const c = ctx, W = ARENA.w, H = ARENA.h;
    const prox = this.wallProx || 0;
    const band = 150;
    const hue = prox > 0.55 ? 350 : 196;
    /* inner glow bands on each side */
    c.globalCompositeOperation = 'lighter';
    const mk = (x0, y0, x1, y1) => {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'hsla(' + hue + ',100%,64%,' + (0.05 + prox * 0.24).toFixed(3) + ')');
      g.addColorStop(1, 'hsla(200,100%,60%,0)');
      return g;
    };
    c.fillStyle = mk(0, 0, 0, band); c.fillRect(0, 0, W, band);
    c.fillStyle = mk(0, H, 0, H - band); c.fillRect(0, H - band, W, band);
    c.fillStyle = mk(0, 0, band, 0); c.fillRect(0, 0, band, H);
    c.fillStyle = mk(W, 0, W - band, 0); c.fillRect(W - band, 0, band, H);
    c.globalCompositeOperation = 'source-over';
    /* neon border */
    c.strokeStyle = 'hsla(' + hue + ',100%,' + (62 + prox * 16) + '%,' + (0.4 + prox * 0.55).toFixed(3) + ')';
    c.lineWidth = 2.5 + prox * 2.5;
    c.shadowBlur = 22 + prox * 26;
    c.shadowColor = 'hsla(' + hue + ',100%,60%,0.9)';
    c.strokeRect(0, 0, W, H);
    c.shadowBlur = 0;
    /* corner brackets */
    c.strokeStyle = 'rgba(140,200,255,0.3)';
    c.lineWidth = 3;
    const L = 90;
    const corners = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]];
    for (const q of corners) {
      c.beginPath();
      c.moveTo(q[0] + q[2] * L, q[1]);
      c.lineTo(q[0], q[1]);
      c.lineTo(q[0], q[1] + q[3] * L);
      c.stroke();
    }
    /* hazard hatch, only inside the 40px border strip */
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.rect(40, 40, W - 80, H - 80);
    c.clip('evenodd');
    c.globalAlpha = 0.1 + prox * 0.26;
    c.strokeStyle = 'hsl(200,100%,70%)';
    c.lineWidth = 1;
    for (let i = -H; i < W; i += 46) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H, H); c.stroke();
    }
    c.globalAlpha = 0.5;
    c.fillStyle = 'rgba(255,60,80,' + (0.06 + prox * 0.18).toFixed(3) + ')';
    c.fillRect(0, 0, W, H);
    c.restore();
    c.globalAlpha = 1;
  }
  drawPlanet(p) {
    const c = ctx;
    const hue = p.hue, sat = p.sat;
    const spawn = easeOut(p.spawnT);
    const ship = this.ship;
    const isCurrent = ship.planet === p || ship.capPlanet === p;
    /* atmosphere */
    c.globalCompositeOperation = 'lighter';
    glow(c, p.x, p.y, p.r * (2.75 + (p.faction === 'danger' ? 0.6 : 0)), hue, sat, 64, (0.26 + p.flash * 0.5) * spawn);
    c.globalCompositeOperation = 'source-over';
    /* capture ring: shown while flying toward it */
    if (this.state === 'play' && ship.state === 'fly' && !isCurrent) {
      const d = dst(ship.x, ship.y, p.x, p.y);
      const cr = p.captureR * (ship.gravityT > 0 ? 1.45 : 1);
      if (d < cr * 2.3) {
        const hot = clamp(1.2 - d / (cr * 2.3), 0, 1);
        const lock = ship.locked.has(p) ? 0.3 : 1;
        c.setLineDash([5, 11]);
        c.lineWidth = 1.1 + hot;
        c.strokeStyle = 'hsla(' + hue + ',' + sat + '%,74%,' + ((0.1 + hot * 0.3) * lock * spawn).toFixed(3) + ')';
        c.beginPath(); c.arc(p.x, p.y, cr, 0, TAU); c.stroke();
        c.setLineDash([]);
      }
    }
    /* orbit ring */
    c.lineWidth = isCurrent ? 1.8 : 1.1;
    c.strokeStyle = 'hsla(' + hue + ',' + sat + '%,78%,' + ((isCurrent ? 0.5 : 0.12) * spawn).toFixed(3) + ')';
    c.beginPath(); c.arc(p.x, p.y, p.orbitR, 0, TAU); c.stroke();
    if (p.ring) this.drawRing(p, 0);
    /* body */
    const r = p.r * spawn;
    let g = c.createRadialGradient(p.x - r * 0.35, p.y - r * 0.42, r * 0.08, p.x, p.y, r * 1.06);
    g.addColorStop(0, 'hsl(' + hue + ',' + sat + '%,' + (p.faction === 'danger' ? 58 : 74) + '%)');
    g.addColorStop(0.5, 'hsl(' + hue + ',' + (sat - 14) + '%,' + (p.faction === 'danger' ? 34 : 50) + '%)');
    g.addColorStop(1, 'hsl(' + (hue + 8) + ',' + (sat - 20) + '%,' + (p.faction === 'danger' ? 12 : 20) + '%)');
    c.fillStyle = g;
    c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.fill();
    /* bands */
    c.save();
    c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.clip();
    c.globalAlpha = 0.13;
    for (let i = 0; i < 3; i++) {
      const yy = p.y - r * 0.55 + i * r * 0.55 + Math.sin(p.time * 0.13 + i) * 2;
      c.fillStyle = i % 2 ? 'hsl(' + (hue + 22) + ',' + sat + '%,86%)' : 'hsl(' + (hue - 14) + ',70%,16%)';
      c.beginPath(); c.ellipse(p.x, yy, r * 1.1, r * (0.09 + i * 0.03), 0, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    /* night side */
    g = c.createRadialGradient(p.x + r * 0.8, p.y + r * 0.75, r * 0.1, p.x + r * 0.4, p.y + r * 0.4, r * 1.8);
    g.addColorStop(0, 'rgba(1,2,8,0.66)');
    g.addColorStop(1, 'rgba(1,2,8,0)');
    c.fillStyle = g;
    c.fillRect(p.x - r * 2, p.y - r * 2, r * 4, r * 4);
    c.restore();
    if (p.ring) this.drawRing(p, 1);
    /* turrets */
    for (const t of p.turrets) t.draw(c);
    /* faction identity */
    const F = FACTION[p.faction];
    c.save();
    c.strokeStyle = 'hsla(' + hue + ',' + sat + '%,72%,' + (0.35 + p.flash * 0.5).toFixed(2) + ')';
    c.lineWidth = 1.4;
    c.beginPath(); c.arc(p.x, p.y - p.orbitR - 16, 8, 0, TAU); c.stroke();
    c.fillStyle = 'hsla(' + hue + ',' + sat + '%,80%,0.95)';
    c.font = '700 10px ' + FONT;
    c.textAlign = 'center';
    c.fillText(F.symbol, p.x, p.y - p.orbitR - 12.5);
    c.font = '400 9.5px ' + FONT;
    c.fillStyle = 'hsla(' + hue + ',' + sat + '%,80%,0.5)';
    c.fillText(p.label + (p.kind !== 'normal' ? ' · ' + KIND[p.kind].label : '') + (p.cleared ? ' · SECURED' : ''), p.x, p.y + p.orbitR + 22);
    if (p.visited || this.state !== 'menu') {
      c.font = '400 10.5px ' + FONT;
      c.fillStyle = 'hsla(' + hue + ',' + sat + '%,84%,0.42)';
      c.fillText(p.name.toUpperCase(), p.x, p.y + p.orbitR + 35);
    }
    c.restore();
    if (p.kind === 'boost') {
      const t = (Math.sin(p.pulse * 0.9) + 1) / 2;
      c.strokeStyle = 'hsla(150,100%,76%,' + (0.2 + t * 0.35) + ')';
      c.lineWidth = 2 + t * 2;
      c.beginPath(); c.arc(p.x, p.y, p.orbitR + 8 + t * 6, 0, TAU); c.stroke();
    }
    if (p.kind === 'gravity') {
      c.strokeStyle = 'hsla(' + hue + ',100%,80%,0.14)';
      c.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const k = ((p.time * 0.4 + i / 3) % 1);
        c.globalAlpha = (1 - k) * 0.5;
        c.beginPath(); c.arc(p.x, p.y, p.r + k * (p.captureR - p.r), 0, TAU); c.stroke();
      }
      c.globalAlpha = 1;
    }
    if (p.faction === 'danger') {
      const t = 0.5 + 0.5 * Math.sin(p.pulse * 1.6);
      c.strokeStyle = 'hsla(350,100%,66%,' + (0.25 + t * 0.3) + ')';
      c.setLineDash([3, 7]);
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(p.x, p.y, p.r + 14 + t * 5, 0, TAU); c.stroke();
      c.setLineDash([]);
    }
    c.textAlign = 'left';
  }
  drawRing(p, front) {
    const c = ctx;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.ring.tilt);
    c.scale(1, p.ring.w);
    const rr = p.r * 1.72;
    c.strokeStyle = 'hsla(' + (p.hue + 28) + ',90%,82%,' + (front ? 0.5 : 0.26) + ')';
    c.lineWidth = 4 / p.ring.w * 0.28;
    c.beginPath(); c.arc(0, 0, rr, front ? 0 : Math.PI, front ? Math.PI : TAU); c.stroke();
    c.strokeStyle = 'hsla(' + (p.hue + 28) + ',90%,88%,0.16)';
    c.lineWidth = 1.4 / p.ring.w * 0.28;
    c.beginPath(); c.arc(0, 0, rr * 1.24, front ? 0 : Math.PI, front ? Math.PI : TAU); c.stroke();
    c.restore();
  }
  drawPopups() {
    const c = ctx;
    c.textAlign = 'center';
    for (const q of this.popups) {
      const t = clamp(q.life / q.max, 0, 1);
      const a = t > 0.8 ? (1 - t) / 0.2 : Math.min(1, t / 0.4);
      c.font = '600 ' + q.size + 'px ' + FONT;
      c.fillStyle = 'hsla(' + q.hue + ',95%,80%,' + (a * 0.95).toFixed(3) + ')';
      c.fillText(q.text, q.x, q.y);
    }
    c.textAlign = 'left';
  }
  drawRadar() {
    const c = ctx;
    const rw = IN.touch ? 108 : 152;
    const rh = rw * (ARENA.h / ARENA.w);
    const rx = IN.touch ? 12 : this.w - rw - 18;
    const ry = IN.touch ? 12 : this.h - rh - 22;
    const sx = rw / ARENA.w, sy = rh / ARENA.h;
    c.save();
    c.globalAlpha = 0.9;
    c.fillStyle = 'rgba(6,9,20,0.72)';
    c.strokeStyle = 'rgba(120,170,255,0.22)';
    c.lineWidth = 1;
    c.beginPath();
    if (c.roundRect) c.roundRect(rx, ry, rw, rh, 6); else c.rect(rx, ry, rw, rh);
    c.fill(); c.stroke();
    /* viewport box */
    c.strokeStyle = 'rgba(180,220,255,0.2)';
    c.lineWidth = 1;
    c.strokeRect(
      rx + (this.cam.x - this.cam.viewW / 2) * sx,
      ry + (this.cam.y - this.cam.viewH / 2) * sy,
      Math.min(rw, this.cam.viewW * sx),
      Math.min(rh, this.cam.viewH * sy));
    for (const p of this.planets) {
      const F = FACTION[p.faction];
      c.fillStyle = 'hsl(' + F.hue + ',' + F.sat + '%,64%)';
      const r = clamp(p.r * 0.05, 1.6, 3.4);
      c.beginPath(); c.arc(rx + p.x * sx, ry + p.y * sy, r, 0, TAU); c.fill();
    }
    for (const a of this.asteroids) {
      c.fillStyle = 'rgba(150,140,165,0.5)';
      c.fillRect(rx + a.x * sx - 0.8, ry + a.y * sy - 0.8, 1.6, 1.6);
    }
    for (const o of this.pickups) {
      c.fillStyle = 'hsl(' + DROP[o.kind].hue + ',100%,70%)';
      c.fillRect(rx + o.x * sx - 1, ry + o.y * sy - 1, 2, 2);
    }
    for (const f of this.fireballs) {
      c.fillStyle = '#ff8a3c';
      c.beginPath(); c.arc(rx + f.x * sx, ry + f.y * sy, 1.8, 0, TAU); c.fill();
    }
    for (const m of this.meteors) {
      c.fillStyle = '#ffd08a';
      c.beginPath(); c.arc(rx + m.x * sx, ry + m.y * sy, 1.6, 0, TAU); c.fill();
    }
    for (const b of this.bullets.items) {
      if (!b.active || b.team === 0) continue;
      c.fillStyle = b.kind === 'missile' ? '#ff6a4d' : '#ff9c7a';
      c.fillRect(rx + b.x * sx - 0.8, ry + b.y * sy - 0.8, 1.8, 1.8);
    }
    for (const e of this.enemies) {
      c.fillStyle = e.boss ? '#ff4d6d' : 'hsl(' + e.hue + ',100%,64%)';
      const r = e.boss ? 3.6 : 2.2;
      c.beginPath(); c.arc(rx + e.x * sx, ry + e.y * sy, r, 0, TAU); c.fill();
    }
    const s = this.ship;
    if (s.alive) {
      c.save();
      c.translate(rx + s.x * sx, ry + s.y * sy);
      c.rotate(s.rot);
      c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(4.4, 0); c.lineTo(-3, 2.6); c.lineTo(-3, -2.6); c.closePath(); c.fill();
      c.restore();
    }
    c.restore();
  }
  drawCursor() {
    if (IN.touch || !IN.mouseSeen || this.state !== 'play') return;
    const c = ctx;
    IN.cx = lerp(IN.cx || IN.mx, IN.mx, 0.45);
    IN.cy = lerp(IN.cy || IN.my, IN.my, 0.45);
    const a = Math.atan2(IN.my - IN.cy, IN.mx - IN.cx);
    const rot = hyp(IN.mx - IN.cx, IN.my - IN.cy) > 2.5 ? angLerp(this._curRot || a, a + Math.PI / 2, 0.4) : (this._curRot || a);
    this._curRot = rot;
    c.save();
    c.translate(IN.cx, IN.cy);
    c.rotate(rot - Math.PI / 2);
    c.globalCompositeOperation = 'lighter';
    glow(c, 0, 6, 16, 192, 100, 70, 0.5);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.beginPath();
    c.moveTo(0, -11); c.lineTo(4.6, 6); c.lineTo(0, 3.4); c.lineTo(-4.6, 6);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(87,232,255,0.9)';
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }
  draw() {
    const c = ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground();
    const z = this.cam.zoom;
    c.save();
    c.translate(this.w / 2 + this.cam.kx, this.h / 2 + this.cam.ky);
    c.scale(z, z);
    c.translate(-this.cam.x, -this.cam.y);
    this.drawArena();
    const hw = this.cam.viewW / 2 + 160, hh = this.cam.viewH / 2 + 160;
    const vis = (x, y, pad) => Math.abs(x - this.cam.x) < hw + (pad || 0) && Math.abs(y - this.cam.y) < hh + (pad || 0);
    for (const p of this.pickups) if (vis(p.x, p.y, 30)) p.draw(c);
    for (const p of this.planets) if (vis(p.x, p.y, p.r * 3)) this.drawPlanet(p);
    for (const a of this.asteroids) if (vis(a.x, a.y, a.r * 2)) a.draw(c);
    for (const f of this.fireballs) if (vis(f.x, f.y, 60)) f.draw(c);
    for (const m of this.meteors) if (vis(m.x, m.y, 90)) m.draw(c);
    this.parts.draw(c);
    for (const e of this.enemies) if (vis(e.x, e.y, 60)) e.draw(c, this);
    this.bullets.draw(c);
    this.ship.draw(c, this);
    this.drawPopups();
    c.restore();
    this.drawRadar();
    this.drawCursor();
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  frame(now) {
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    if (this.state !== 'paused') this.update(dt);
    this.draw();
    requestAnimationFrame(this.frame);
  }
  toggleMute() {
    this.sfx.muted = !this.sfx.muted;
    store.set('oe.muted', this.sfx.muted);
    dom.muteBtn.classList.toggle('muted', this.sfx.muted);
    if (!this.sfx.muted) { this.sfx.resume(); this.sfx.ui(); }
  }
}

const FONT = '"Segoe UI", Inter, system-ui, -apple-system, sans-serif';

/* ------------------------------------------------------------
   15. boot + input wiring
   ------------------------------------------------------------ */
const game = new Game();
dom.muteBtn.classList.toggle('muted', game.sfx.muted);
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
  IN.touch = true;
  document.body.classList.add('touch');
}

function launchOrStart() {
  game.sfx.resume();
  if (game.state === 'menu') { game.start(); return; }
  if (game.state === 'play') { game.ship.launch(); return; }
  if (game.state === 'over' && performance.now() - game.overAt > 1000) game.start();
}

window.addEventListener('keydown', (e) => {
  const k = e.code;
  if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW' || k === 'KeyS' || k === 'KeyA' || k === 'KeyD' || k === 'Tab') e.preventDefault();
  if (e.repeat) { IN.keys[k] = true; return; }
  IN.keys[k] = true;
  switch (k) {
    case 'Space': launchOrStart(); break;
    case 'KeyE': IN.fire = true; break;
    case 'ShiftLeft': case 'ShiftRight': IN.boost = true; break;
    case 'KeyM': IN.missile = true; break;
    case 'KeyX': if (game.state === 'play') game.ship.useDash(); break;
    case 'KeyP': case 'Escape': game.togglePause(); break;
    case 'KeyR': if (game.state === 'over' && performance.now() - game.overAt > 400) game.start(); break;
  }
}, { passive: false });

window.addEventListener('keyup', (e) => {
  const k = e.code;
  IN.keys[k] = false;
  if (k === 'KeyE') IN.fire = false;
  if (k === 'ShiftLeft' || k === 'ShiftRight') IN.boost = false;
  if (k === 'KeyM') { IN.missile = false; if (game.state === 'play') game.ship.fireMissile(); }
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') {
    if (!IN.touch) { IN.touch = true; document.body.classList.add('touch'); }
    /* tap anywhere on the arena to break orbit — the one-action core of the game */
    if (game.state === 'play' && game.ship.state === 'orbit') { launchOrStart(); e.preventDefault(); return; }
    if (game.state === 'menu' || (game.state === 'over' && performance.now() - game.overAt > 1000)) { launchOrStart(); }
    e.preventDefault();
    return;
  }
  IN.mouseSeen = true; IN.mx = e.clientX; IN.my = e.clientY;
  if (e.button === 2) { IN.missile = true; }
  else { IN.fire = true; }
  e.preventDefault();
});
window.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'touch') {
    if (e.button === 2) { IN.missile = false; if (game.state === 'play') game.ship.fireMissile(); }
    else { IN.fire = false; }
  }
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  IN.mouseSeen = true; IN.mx = e.clientX; IN.my = e.clientY;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => { if (e.target === canvas) e.preventDefault(); });
document.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('blur', () => { IN.fire = IN.missile = IN.boost = false; for (const k in IN.keys) IN.keys[k] = false; });

function hold(btn, on, off) {
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.classList.add('on'); IN.touch = true; document.body.classList.add('touch'); on(); });
  const up = (e) => { if (e) e.preventDefault(); btn.classList.remove('on'); off(); };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
}
hold(dom.tFire, () => { IN.fire = true; }, () => { IN.fire = false; });
hold(dom.tBoost, () => { IN.boost = true; }, () => { IN.boost = false; });
hold(dom.tMsl, () => { IN.missile = true; }, () => { IN.missile = false; if (game.state === 'play') game.ship.fireMissile(); });
dom.tLaunch.addEventListener('pointerdown', (e) => { e.preventDefault(); dom.tLaunch.classList.add('on'); launchOrStart(); });
const tLaunchOff = () => dom.tLaunch.classList.remove('on');
dom.tLaunch.addEventListener('pointerup', tLaunchOff);
dom.tLaunch.addEventListener('pointercancel', tLaunchOff);
dom.tLaunch.addEventListener('pointerleave', tLaunchOff);

dom.startBtn.addEventListener('click', (e) => { e.stopPropagation(); game.start(); });
dom.restartBtn.addEventListener('click', (e) => { e.stopPropagation(); game.start(); });
dom.resumeBtn.addEventListener('click', (e) => { e.stopPropagation(); game.setPaused(false); });
dom.quitBtn.addEventListener('click', (e) => { e.stopPropagation(); game.toMenu(); });
dom.muteBtn.addEventListener('click', (e) => { e.stopPropagation(); game.toggleMute(); });
dom.pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); game.sfx.resume(); game.togglePause(); });

})();



