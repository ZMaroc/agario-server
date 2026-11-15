'use strict';
// Agar.io private server (FFA + bots) for the current web client (protocol 23, unencrypted).
// No dependencies:  node server.js [--port 4400] [--bots 15] [--cert cert.pem --key key.pem]

const http = require('http');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

//CONFIG
const CFG = {
  port: Number(process.env.PORT) || 4400,
  host: '0.0.0.0',
  cert: '', key: '',
  name: 'Private FFA',
  maxClients: 200, maxPerIp: 4,
  tickMs: 40,
  border: 7071,
  viewW: 1920, viewH: 1080, viewMult: 2.2,
  foodAmount: 1500, foodSpawnPerTick: 12, foodMin: 10, foodMax: 20,
  virusAmount: 30, virusMax: 60, virusSize: 100, virusFeeds: 7, virusShot: 780, virusEatMassRatio: 1.33, popMinPiece: 16,
  startSize: 223.61, botStartSize: 141.42, maxSize: 1500, maxCells: 16, minSplitSize: 59.16, minEjectSize: 59.16,
  splitBoost: 780, ejectSize: 36.06, ejectLoss: 1800, ejectBoost: 780, ejectCooldown: 2, ejectMax: 2000,
  eatRatio: 1.118, eatOverlap: 0.4,
  mergeSec: 30, mergeSizeK: 0.2,
  decayPerSec: 0.002, decayMinSize: 32,
  speedK: 2.2 * 40, speedPow: -0.439,
  bots: 15, botRespawnTicks: 50,
  leaderboardTicks: 25, nameMax: 15,
  debug: 0,
};

for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i].replace(/^--/, ''), v = process.argv[i + 1];
  if (!(k in CFG) || v === undefined) { console.error('Unknown option ' + process.argv[i]); process.exit(1); }
  CFG[k] = typeof CFG[k] === 'number' ? Number(v) : v;
}

const B = CFG.border;
const BOT_NAMES = ['Nova', 'Pixel', 'Rex', 'Luna', 'Kiwi', 'Turbo', 'Mango', 'Zed', 'Coco', 'Blitz', 'Echo', 'Fizz', 'Gizmo', 'Halo', 'Indy',
  'Jinx', 'Koda', 'Lynx', 'Momo', 'Nix', 'Onyx', 'Pogo', 'Quill', 'Rolo', 'Sumo', 'Taco', 'Uno', 'Vex', 'Wasp', 'Yeti'];

//WEBSOCKET
class Conn {
  constructor(sock, req) {
    this.sock = sock; this.req = req; this.buf = Buffer.alloc(0); this.frag = []; this.open = true;
    this.onmessage = null; this.onclose = null;
    sock.on('data', (d) => this.data(d));
    sock.on('close', () => this.end());
    sock.on('error', () => this.end());
  }
  end(why) {
    if (!this.open) return;
    this.open = false;
    this.why = why || this.why || 'closed by client';
    try { this.sock.destroy(); } catch (e) { }
    if (this.onclose) this.onclose();
  }
  data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 15, masked = b[1] & 0x80;
      let len = b[1] & 127, o = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); o = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); o = 10; }
      if (len > 1 << 20 || !masked) return this.end('bad frame ' + len);
      const mo = o; o += 4;
      if (b.length < o + len) return;
      const p = Buffer.from(b.subarray(o, o + len));
      for (let i = 0; i < len; i++) p[i] ^= b[mo + (i & 3)];
      this.buf = b.subarray(o + len);
      if (op === 8) return this.end('client close ' + (p.length >= 2 ? p.readUInt16BE(0) : ''));
      if (op === 9) { this.raw(10, p); continue; }
      if (op === 10) continue;
      this.frag.push(p);
      if (this.frag.length > 64) return this.end('too many fragments');
      if (fin) {
        const m = this.frag.length === 1 ? this.frag[0] : Buffer.concat(this.frag);
        this.frag = [];
        if (this.onmessage) this.onmessage(m);
      }
    }
  }
  raw(op, p) {
    if (!this.open) return;
    const n = p.length;
    let h;
    if (n < 126) h = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
    if (this.sock.writableLength > 4 << 20) return this.end();
    try { this.sock.write(Buffer.concat([h, p])); } catch (e) { this.end(); }
  }
  send(p) { this.raw(2, p); }
}

class Writer {
  constructor(n) { this.b = Buffer.allocUnsafe(n || 1024); this.o = 0; }
  need(n) { if (this.o + n > this.b.length) { const nb = Buffer.allocUnsafe(Math.max(this.b.length * 2, this.o + n)); this.b.copy(nb, 0, 0, this.o); this.b = nb; } }
  u8(v) { this.need(1); this.b[this.o++] = v; }
  u16(v) { this.need(2); this.b.writeUInt16LE(v, this.o); this.o += 2; }
  u32(v) { this.need(4); this.b.writeUInt32LE(v >>> 0, this.o); this.o += 4; }
  i32(v) { this.need(4); this.b.writeInt32LE(v | 0, this.o); this.o += 4; }
  f32(v) { this.need(4); this.b.writeFloatLE(v, this.o); this.o += 4; }
  f64(v) { this.need(8); this.b.writeDoubleLE(v, this.o); this.o += 8; }
  str(s) { const u = Buffer.from(s, 'utf8'); this.need(u.length + 1); u.copy(this.b, this.o); this.o += u.length; this.b[this.o++] = 0; }
  out() { return this.b.subarray(0, this.o); }
}

//WORLD
const T_PLAYER = 0, T_FOOD = 1, T_VIRUS = 2, T_EJECT = 3;
const GS = 500, GOFF = 64, GW = 256;
const grid = new Map();
const pgrid = new Map();
const nodes = new Map();
const playerCells = [];
const players = new Set();
const clients = new Set();
let tick = 0, nextId = 1, foodCount = 0, virusCount = 0, ejectCount = 0;
let eatenNow = new Map();
let moving = new Set();

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const gkey = (x, y) => (Math.floor(x / GS) + GOFF) * GW + Math.floor(y / GS) + GOFF;

const gridOf = (n) => (n.type === T_PLAYER ? pgrid : grid);
function gridAdd(n) { const g = gridOf(n); n.gk = gkey(n.x, n.y); let s = g.get(n.gk); if (!s) g.set(n.gk, s = new Set()); s.add(n); }
function gridDel(n) { const g = gridOf(n), s = g.get(n.gk); if (s) { s.delete(n); if (!s.size) g.delete(n.gk); } }
function gridMove(n) { const k = gkey(n.x, n.y); if (k !== n.gk) { gridDel(n); gridAdd(n); } }
function gridQuery(x0, y0, x1, y1, fn, g) {
  g = g || grid;
  const a = Math.floor(x0 / GS), b = Math.floor(x1 / GS), c = Math.floor(y0 / GS), d = Math.floor(y1 / GS);
  for (let gx = a; gx <= b; gx++) for (let gy = c; gy <= d; gy++) {
    const s = g.get((gx + GOFF) * GW + gy + GOFF);
    if (s) for (const n of s) fn(n);
  }
}

function color() {
  const c = [255, 7, Math.floor(Math.random() * 256)];
  for (let i = 2; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
}

function addNode(type, x, y, r, col, owner) {
  const n = { id: nextId++, type, x, y, r, color: col, owner: owner || null, boost: null, born: tick, moved: tick };
  if (nextId > 0xfffffff0) nextId = 1;
  nodes.set(n.id, n);
  if (type === T_PLAYER) {
    playerCells.push(n); owner.cells.push(n); gridAdd(n);
    if (owner.client) { const w = new Writer(5); w.u8(0x20); w.u32(n.id); owner.client.conn.send(w.out()); }
  }
  else {
    gridAdd(n);
    if (type === T_FOOD) foodCount++; else if (type === T_VIRUS) virusCount++; else ejectCount++;
  }
  return n;
}

function delNode(n, eater) {
  if (!nodes.delete(n.id)) return;
  n.dead = true;
  moving.delete(n);
  if (eater) eatenNow.set(n.id, eater.id);
  if (n.type === T_PLAYER) {
    let i = playerCells.indexOf(n); if (i >= 0) playerCells.splice(i, 1);
    i = n.owner.cells.indexOf(n); if (i >= 0) n.owner.cells.splice(i, 1);
    gridDel(n);
    if (!n.owner.cells.length) n.owner.diedAt = tick;
  } else {
    gridDel(n);
    if (n.type === T_FOOD) foodCount--; else if (n.type === T_VIRUS) virusCount--; else ejectCount--;
  }
}

function setBoost(n, ang, d) { n.boost = { dx: Math.cos(ang), dy: Math.sin(ang), d }; moving.add(n); }

function stepBoost(n) {
  const b = n.boost;
  const s = b.d / 9;
  n.x += b.dx * s; n.y += b.dy * s; b.d -= s;
  const m = n.r / 2;
  if (n.x < -B + m) { n.x = -B + m; b.dx = -b.dx; } else if (n.x > B - m) { n.x = B - m; b.dx = -b.dx; }
  if (n.y < -B + m) { n.y = -B + m; b.dy = -b.dy; } else if (n.y > B - m) { n.y = B - m; b.dy = -b.dy; }
  n.moved = tick;
  if (b.d < 1) n.boost = null;
}

function spawnFood() {
  const r = rnd(CFG.foodMin, CFG.foodMax);
  addNode(T_FOOD, rnd(-B + r, B - r), rnd(-B + r, B - r), r, color());
}

function freeSpot(r) {
  let x = 0, y = 0;
  for (let t = 0; t < 20; t++) {
    x = rnd(-B + r, B - r); y = rnd(-B + r, B - r);
    let ok = true;
    for (const c of playerCells) { if (Math.hypot(c.x - x, c.y - y) < c.r + r + 80) { ok = false; break; } }
    if (ok) break;
  }
  return { x, y };
}

function spawnVirus() {
  const p = freeSpot(CFG.virusSize);
  addNode(T_VIRUS, p.x, p.y, CFG.virusSize, [51, 255, 51]);
}

//PLAYERS
function newPlayer(name, bot) {
  const p = { name, client: null, color: color(), cells: [], mx: 0, my: 0, split: 0, eject: false, ejectT: 0, bot: !!bot, diedAt: tick, think: 0, wander: Math.random() * 6.28 };
  players.add(p);
  return p;
}

function spawnPlayer(p) {
  if (p.cells.length) return null;
  const r0 = p.bot ? CFG.botStartSize : CFG.startSize;
  const s = freeSpot(r0);
  p.color = color();
  const c = addNode(T_PLAYER, s.x, s.y, r0, p.color, p);
  p.mx = s.x; p.my = s.y;
  return c;
}

function splitCell(c, ang, r, boost) {
  const n = addNode(T_PLAYER, c.x, c.y, r, c.owner.color, c.owner);
  setBoost(n, ang, boost);
  return n;
}

function playerSplit(p) {
  const list = p.cells.slice().sort((a, b) => b.r - a.r);
  for (const c of list) {
    if (p.cells.length >= CFG.maxCells) break;
    if (c.r < CFG.minSplitSize) continue;
    let dx = p.mx - c.x, dy = p.my - c.y;
    if (dx * dx + dy * dy < 1) { dx = 1; dy = 0; }
    c.r /= Math.SQRT2;
    c.born = tick;
    splitCell(c, Math.atan2(dy, dx), c.r, CFG.splitBoost);
  }
}

function playerEject(p) {
  if (tick - p.ejectT < CFG.ejectCooldown || ejectCount >= CFG.ejectMax) return;
  p.ejectT = tick;
  for (const c of p.cells) {
    if (c.r < CFG.minEjectSize) continue;
    let dx = p.mx - c.x, dy = p.my - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
    c.r = Math.sqrt(c.r * c.r - CFG.ejectLoss);
    const e = addNode(T_EJECT, c.x + dx * c.r, c.y + dy * c.r, CFG.ejectSize, p.color, p);
    setBoost(e, Math.atan2(dy, dx) + rnd(-0.12, 0.12), CFG.ejectBoost);
  }
}

function popCell(c) {
  const p = c.owner;
  const room = CFG.maxCells - p.cells.length;
  if (room <= 0) return;
  let mass = c.r * c.r / 100;
  let count = Math.min(room, Math.floor(mass / CFG.popMinPiece) - 1);
  if (count < 1) return;
  const keep = Math.max(mass / (count + 1), mass * 0.3);
  let left = mass - keep;
  c.r = Math.sqrt(keep * 100);
  c.born = tick;
  const a0 = Math.random() * 6.28;
  for (let i = 0; i < count; i++) {
    const n = count - i;
    let piece = left / n;
    if (n > 1) piece *= rnd(0.7, 1.3);
    piece = Math.min(piece, left - CFG.popMinPiece * (n - 1) * 0.5);
    left -= piece;
    splitCell(c, a0 + i * 6.2832 / count + rnd(-0.2, 0.2), Math.sqrt(piece * 100), CFG.splitBoost * rnd(0.55, 1));
  }
}

function canMerge(c) { return tick - c.born >= Math.max(CFG.mergeSec, c.r * CFG.mergeSizeK) * 25; }

function movePlayer(p) {
  for (const c of p.cells) {
    const dx = p.mx - c.x, dy = p.my - c.y, d = Math.hypot(dx, dy);
    if (d >= 1) {
      const s = Math.min(d, CFG.speedK * Math.pow(c.r, CFG.speedPow)) / d;
      c.x += dx * s; c.y += dy * s;
    }
    if (c.boost) stepBoost(c);
    c.moved = tick;
  }
  const cs = p.cells;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (tick - a.born < 13 && a.boost || tick - b.born < 13 && b.boost) continue;
    if (canMerge(a) && canMerge(b)) continue;
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    const need = a.r + b.r;
    if (d >= need) continue;
    if (d < 0.01) { dx = 1; dy = 0; d = 1; }
    const push = (need - d) / d, ma = a.r * a.r, mb = b.r * b.r, ka = mb / (ma + mb), kb = ma / (ma + mb);
    a.x -= dx * push * ka; a.y -= dy * push * ka;
    b.x += dx * push * kb; b.y += dy * push * kb;
  }
  for (const c of cs) {
    const m = c.r / 2;
    c.x = clamp(c.x, -B + m, B - m); c.y = clamp(c.y, -B + m, B - m);
    if (c.r > CFG.maxSize) {
      if (cs.length < CFG.maxCells) { c.r /= Math.SQRT2; c.born = tick; splitCell(c, Math.random() * 6.28, c.r, CFG.splitBoost * 0.6); }
      else c.r = CFG.maxSize;
    }
    gridMove(c);
  }
}

function eat(eater, n) {
  eater.r = Math.sqrt(eater.r * eater.r + n.r * n.r);
  eater.moved = tick;
  delNode(n, eater);
}

function collide() {
  const list = playerCells.slice().sort((a, b) => b.r - a.r);
  const found = [];
  for (const c of list) {
    if (c.dead) continue;
    found.length = 0;
    gridQuery(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r, (n) => found.push(n));
    for (const n of found) {
      if (n.dead || c.dead) continue;
      const d = Math.hypot(n.x - c.x, n.y - c.y);
      if (d >= c.r - n.r * CFG.eatOverlap) continue;
      if (n.type === T_FOOD) eat(c, n);
      else if (n.type === T_VIRUS ? c.r * c.r > n.r * n.r * CFG.virusEatMassRatio : c.r > n.r * CFG.eatRatio) {
        const virus = n.type === T_VIRUS;
        eat(c, n);
        if (virus) popCell(c);
      }
    }
    found.length = 0;
    gridQuery(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r, (n) => found.push(n), pgrid);
    for (const n of found) {
      if (n === c || n.dead || c.dead || n.r > c.r) continue;
      const d = Math.hypot(n.x - c.x, n.y - c.y);
      if (d >= c.r - n.r * CFG.eatOverlap) continue;
      if (n.owner === c.owner) { if (canMerge(c) && canMerge(n)) eat(c, n); }
      else if (c.r > n.r * CFG.eatRatio) eat(c, n);
    }
  }
}

function stepMoving() {
  const found = [];
  for (const n of moving) {
    if (n.type === T_PLAYER) { if (!n.boost) moving.delete(n); continue; }
    if (n.boost) stepBoost(n);
    gridMove(n);
    if (n.type === T_EJECT) {
      found.length = 0;
      gridQuery(n.x - 200, n.y - 200, n.x + 200, n.y + 200, (v) => { if (v.type === T_VIRUS) found.push(v); });
      for (const v of found) {
        if (v.dead || Math.hypot(v.x - n.x, v.y - n.y) >= v.r) continue;
        const ang = n.boost ? Math.atan2(n.boost.dy, n.boost.dx) : Math.random() * 6.28;
        v.r = Math.sqrt(v.r * v.r + n.r * n.r); v.moved = tick;
        delNode(n, v);
        v.fed = (v.fed || 0) + 1;
        if (v.fed >= CFG.virusFeeds) {
          v.fed = 0;
          v.r = CFG.virusSize;
          if (virusCount < CFG.virusMax) setBoost(addNode(T_VIRUS, v.x, v.y, CFG.virusSize, v.color), ang, CFG.virusShot);
        }
        break;
      }
    }
    if (!n.boost) moving.delete(n);
  }
}

//BOTS
function botThink(p) {
  const big = p.cells.reduce((a, b) => (b.r > a.r ? b : a));
  const range = big.r * 4 + 500;
  let flee = null, fleeD = Infinity, prey = null, preyD = Infinity;
  for (const c of playerCells) {
    if (c.owner === p) continue;
    const d = Math.hypot(c.x - big.x, c.y - big.y) - c.r;
    if (d > range) continue;
    if (c.r > big.r * CFG.eatRatio) { if (d < fleeD) { fleeD = d; flee = c; } }
    else if (big.r > c.r * CFG.eatRatio && d < preyD) { preyD = d; prey = c; }
  }
  if (flee) {
    const a = Math.atan2(big.y - flee.y, big.x - flee.x);
    p.mx = big.x + Math.cos(a) * 1000; p.my = big.y + Math.sin(a) * 1000;
    return;
  }
  if (prey) {
    p.mx = prey.x; p.my = prey.y;
    if (p.cells.length < 4 && big.r > prey.r * 1.7 && big.r >= CFG.minSplitSize && preyD < big.r * 2 + 250 && Math.random() < 0.25) p.split = 1;
    return;
  }
  let food = null, foodD = Infinity, virus = null;
  gridQuery(big.x - 700, big.y - 700, big.x + 700, big.y + 700, (n) => {
    const d = Math.hypot(n.x - big.x, n.y - big.y);
    if (n.type === T_VIRUS) { if (big.r > n.r * CFG.eatRatio && d < big.r + n.r + 60) virus = n; }
    else if (d < foodD && (n.type === T_FOOD || big.r > n.r * CFG.eatRatio)) { foodD = d; food = n; }
  });
  if (virus) {
    const a = Math.atan2(big.y - virus.y, big.x - virus.x);
    p.mx = big.x + Math.cos(a) * 600; p.my = big.y + Math.sin(a) * 600;
  } else if (food) { p.mx = food.x; p.my = food.y; }
  else {
    p.wander += rnd(-0.5, 0.5);
    p.mx = clamp(big.x + Math.cos(p.wander) * 800, -B, B); p.my = clamp(big.y + Math.sin(p.wander) * 800, -B, B);
  }
}

function botNames() {
  const used = new Set();
  for (const p of players) used.add(p.name);
  const free = BOT_NAMES.filter((n) => !used.has(n));
  return free.length ? free[Math.floor(Math.random() * free.length)] : 'Bot ' + Math.floor(Math.random() * 900 + 100);
}

//CLIENTS
function sendBorder(cl) {
  const w = new Writer(64);
  w.u8(0x40); w.f64(-B); w.f64(-B); w.f64(B); w.f64(B); w.u32(0); w.str(CFG.name);
  cl.conn.send(w.out());
}

// Handshake: the client stays on "Connecting" until it gets packet 241 (key + server version).
// Sending key = client version makes the server->client stream plain (the client XORs it with key ^ version).
// Client->server packets are XORed with a 4-byte key that starts at murmur2(serverVersion, 255) and rolls after each packet.
const SERVER_VERSION = '1.0.0';
function rollKey(key) {
  let n = Math.imul(key, 0x5bd1e995);
  n = Math.imul(n ^ (n >>> 24), 0x5bd1e995) ^ 114296087;
  n = Math.imul(n ^ (n >>> 13), 0x5bd1e995);
  return (n ^ (n >>> 15)) >>> 0;
}
function murmur2(str, seed) {
  const d = Buffer.from(str, 'utf8'), m = 0x5bd1e995;
  let l = d.length, h = (seed ^ l) >>> 0, i = 0;
  while (l >= 4) {
    let k = Math.imul(d.readUInt32LE(i), m);
    k = Math.imul(k ^ (k >>> 24), m);
    h = Math.imul(h, m) ^ k;
    i += 4; l -= 4;
  }
  if (l === 3) h ^= d[i + 2] << 16;
  if (l >= 2) h ^= d[i + 1] << 8;
  if (l >= 1) h = Math.imul(h ^ d[i], m);
  h = Math.imul(h ^ (h >>> 13), m);
  return (h ^ (h >>> 15)) >>> 0;
}
const FIRST_KEY = murmur2(SERVER_VERSION, 255);

function decrypt(cl, m) {
  let k = cl.key;
  if (m.length === 13 && (m[0] ^ (k & 255)) !== 16) {
    const v = cl.pkey, k0 = m[0] ^ 16;
    if (CFG.debug) console.log(`[debug] ${cl.ip} key resync`);
    if ((m[12] ^ k0) === (v >>> 24)) k = (k0 | (m[9] ^ (v & 255)) << 8 | (m[10] ^ ((v >>> 8) & 255)) << 16 | (m[11] ^ ((v >>> 16) & 255)) << 24) >>> 0;
  }
  for (let j = 0; j < m.length; j++) m[j] ^= (k >>> (8 * (j & 3))) & 255;
  cl.key = rollKey(k);
}

function onMessage(cl, m) {
  if (!m.length) return;
  const p = cl.player;
  if (!cl.ready) {
    if (m[0] === 254) { if (m.length >= 5) cl.proto = m.readUInt32LE(1); return; }
    if (m[0] !== 255 || !cl.proto) return;
    cl.ready = true;
    cl.pkey = m.length >= 5 ? m.readUInt32LE(1) : 0;
    cl.key = FIRST_KEY;
    const w = new Writer(16);
    w.u8(241); w.u32(cl.pkey); w.str(SERVER_VERSION);
    cl.conn.send(w.out());
    sendBorder(cl);
    if (CFG.debug) console.log(`[debug] ${cl.ip} handshake ok, protocol ${cl.proto}, client ${cl.pkey}`);
    return;
  }
  decrypt(cl, m);
  const op = m[0];
  if (CFG.debug && op !== 16) console.log(`[debug] ${cl.ip} packet ${op} (${m.length} bytes)`);
  if (op === 16) {
    if (m.length === 13) { p.mx = m.readInt32LE(1); p.my = m.readInt32LE(5); }
    else if (m.length === 21) { p.mx = m.readDoubleLE(1); p.my = m.readDoubleLE(9); }
    else if (m.length === 9) { p.mx = m.readInt16LE(1); p.my = m.readInt16LE(3); }
    if (!Number.isFinite(p.mx) || !Number.isFinite(p.my)) { p.mx = 0; p.my = 0; }
    p.mx = clamp(p.mx, -B * 2, B * 2); p.my = clamp(p.my, -B * 2, B * 2);
  } else if (op === 0) {
    if (p.cells.length || tick - cl.spawnT < 10) return;
    let e = m.indexOf(0, 1); if (e < 0) e = m.length;
    let name = m.subarray(1, e).toString('utf8').replace(/[\u0000-\u001f�]/g, '').trim();
    name = Array.from(name).slice(0, CFG.nameMax).join('');
    p.name = name;
    cl.spawnT = tick; cl.spectate = false;
    spawnPlayer(p);
  } else if (op === 1) { if (!p.cells.length) cl.spectate = true; }
  else if (op === 17) { if (p.split < 4) p.split++; }
  else if (op === 21) p.eject = true;
}

function viewOf(cl) {
  const p = cl.player;
  let x = 0, y = 0, size = 0;
  if (p.cells.length) {
    for (const c of p.cells) { x += c.x; y += c.y; size += c.r; }
    x /= p.cells.length; y /= p.cells.length;
    cl.cx = x; cl.cy = y;
  } else if (cl.spectate && top.length && top[0].cells.length) {
    const t = top[0];
    for (const c of t.cells) { x += c.x; y += c.y; size += c.r; }
    x /= t.cells.length; y /= t.cells.length;
    cl.cx = x; cl.cy = y;
  } else { x = cl.cx; y = cl.cy; size = CFG.startSize; }
  const scale = Math.pow(Math.min(64 / size, 1), 0.4);
  cl.scale = scale;
  const hw = CFG.viewW / scale / 2 * CFG.viewMult, hh = CFG.viewH / scale / 2 * CFG.viewMult;
  return { x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh };
}

function writeNode(w, n, full) {
  w.u32(n.id); w.i32(Math.round(n.x)); w.i32(Math.round(n.y)); w.u16(Math.round(n.r));
  let f = 0, ext = 0;
  if (n.type === T_VIRUS) f |= 0x01;
  else if (n.type === T_EJECT) f |= 0x20;
  else if (n.type === T_FOOD) { f |= 0x80; ext |= 0x01; }
  const name = full && n.type === T_PLAYER && n.owner.name;
  if (full) f |= 0x02;
  if (name) f |= 0x08;
  w.u8(f);
  if (f & 0x80) w.u8(ext);
  if (full) { w.u8(n.color[0]); w.u8(n.color[1]); w.u8(n.color[2]); }
  if (name) w.str(name);
}

function sendUpdate(cl) {
  const v = viewOf(cl), prev = cl.view, cur = new Set();
  gridQuery(v.x0, v.y0, v.x1, v.y1, (n) => { if (n.x >= v.x0 && n.x <= v.x1 && n.y >= v.y0 && n.y <= v.y1) cur.add(n); });
  for (const c of playerCells) { if (c.x + c.r >= v.x0 && c.x - c.r <= v.x1 && c.y + c.r >= v.y0 && c.y - c.r <= v.y1) cur.add(c); }
  for (const c of cl.player.cells) cur.add(c);

  const w = new Writer(2048);
  w.u8(0x10);
  const gone = [];
  let eats = 0;
  const eatAt = w.o; w.u16(0);
  for (const n of prev) {
    if (cur.has(n)) continue;
    gone.push(n.id);
    const by = n.dead ? eatenNow.get(n.id) : undefined;
    if (by !== undefined) { w.u32(by); w.u32(n.id); eats++; }
  }
  w.b.writeUInt16LE(eats, eatAt);
  for (const n of cur) {
    if (!prev.has(n)) writeNode(w, n, true);
    else if (n.moved === tick) writeNode(w, n, false);
  }
  w.u32(0);
  w.u16(gone.length);
  for (const id of gone) w.u32(id);
  cl.view = cur;
  cl.conn.send(w.out());

  if (cl.spectate && !cl.player.cells.length) {
    const s = new Writer(13);
    s.u8(0x11); s.f32(cl.cx); s.f32(cl.cy); s.f32(cl.scale);
    cl.conn.send(s.out());
  }
}

let top = [];
function sendLeaderboard() {
  top = [];
  for (const p of players) {
    if (!p.cells.length) continue;
    p.score = 0;
    for (const c of p.cells) p.score += c.r * c.r;
    top.push(p);
  }
  top.sort((a, b) => b.score - a.score);
  if (top.length > 10) top.length = 10;
  for (const cl of clients) {
    if (!cl.ready) continue;
    const w = new Writer(256);
    w.u8(0x35);
    for (const p of top) { w.u8(0x02 | (p === cl.player ? 0x08 : 0)); w.str(p.name || 'An unnamed cell'); }
    cl.conn.send(w.out());
  }
}

//LOOP
function gameTick() {
  tick++;
  let bots = 0;
  for (const p of players) {
    if (p.bot) {
      bots++;
      if (!p.cells.length) { if (tick - p.diedAt >= CFG.botRespawnTicks) { p.name = botNames(); spawnPlayer(p); } continue; }
      if (tick >= p.think) { p.think = tick + 4 + Math.floor(Math.random() * 3); botThink(p); }
    }
    if (!p.cells.length) continue;
    if (p.split) { p.split--; playerSplit(p); }
    if (p.eject) { p.eject = false; playerEject(p); }
    movePlayer(p);
  }
  for (; bots < CFG.bots; bots++) newPlayer(botNames(), true);

  stepMoving();
  collide();

  if (tick % 25 === 0) {
    const k = Math.sqrt(1 - CFG.decayPerSec);
    for (const c of playerCells) if (c.r > CFG.decayMinSize) c.r = Math.max(CFG.decayMinSize, c.r * k);
  }
  for (let i = 0; i < CFG.foodSpawnPerTick && foodCount < CFG.foodAmount; i++) spawnFood();
  if (virusCount < CFG.virusAmount) spawnVirus();

  if (tick % CFG.leaderboardTicks === 1) sendLeaderboard();
  for (const cl of clients) if (cl.ready) sendUpdate(cl);
  eatenNow.clear();
}

//SERVER
const perIp = new Map();
function onUpgrade(req, sock) {
  const key = req.headers['sec-websocket-key'];
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || sock.remoteAddress || '').split(',')[0].trim();
  const n = perIp.get(ip) || 0;
  if (!key || clients.size >= CFG.maxClients || n >= CFG.maxPerIp) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  perIp.set(ip, n + 1);
  const conn = new Conn(sock, req);
  const cl = { conn, ip, proto: 0, key: 0, pkey: 0, ready: false, spectate: false, view: new Set(), player: newPlayer('', false), cx: 0, cy: 0, scale: 1, spawnT: -100 };
  cl.player.client = cl;
  clients.add(cl);
  console.log(`[+] ${ip} connected (${clients.size} online)`);
  conn.onmessage = (m) => { try { onMessage(cl, m); } catch (e) { conn.end(); } };
  conn.onclose = () => {
    clients.delete(cl);
    const left = (perIp.get(ip) || 1) - 1;
    if (left > 0) perIp.set(ip, left); else perIp.delete(ip);
    for (const c of cl.player.cells.slice()) delNode(c);
    players.delete(cl.player);
    console.log(`[-] ${ip} disconnected (${clients.size} online)` + (CFG.debug ? ` reason: ${conn.why}` : ''));
  };
}

//WEB PAGE
// The page at / gives players a bookmarklet that connects agar.io to this server (no extension needed).
function bookmarklet(wsUrl) {
  const code = `(()=>{var U=${JSON.stringify(wsUrl)},c=window.core;if(!c||typeof c.connect!=='function'){alert('Abre agar.io primero y luego pulsa este marcador.');return;}` +
    `try{MC.nextDisconnectIsIntended=true}catch(e){}try{var o=window.agarApp&&agarApp.API;if(o)o.showIncentive=function(){};if(window.MC)MC.showIncentive=function(){}}catch(e){}` +
    `var g=false;document.addEventListener('update_user_info',function(e){if(!(e.detail&&e.detail.psc))g=true;});` +
    `setTimeout(function(){if(g)return;try{document.dispatchEvent(new CustomEvent('update_user_info',{bubbles:true,cancelable:true,detail:{id:'',name:'Guest',isPayingUser:false,avatarUrl:'',level:1,currentXp:0,totalXp:50,realm:['Guest',2],isNewUser:false,hasLoggedIntoMobile:false,psc:true}}))}catch(e){}},1500);` +
    `c.connect(U);})();`;
  return 'javascript:' + encodeURIComponent(code);
}

function esc(t) { return String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

function landingPage(q) {
  const secure = tls || /https/i.test(String(q.headers['x-forwarded-proto'] || ''));
  const host = String(q.headers.host || `localhost:${CFG.port}`);
  const wsUrl = (secure ? 'wss://' : 'ws://') + host;
  const name = esc(CFG.name), href = bookmarklet(wsUrl);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title>
<style>body{margin:0;font-family:Ubuntu,system-ui,sans-serif;background:#111;color:#eee;display:flex;justify-content:center;padding:32px 16px}main{max-width:560px;width:100%}h1{margin:0 0 4px;font-size:28px}
.s{color:#9a9ea8;margin:0 0 24px}.b{display:inline-block;padding:12px 22px;border-radius:10px;background:#2a61d7;color:#fff;font-weight:700;text-decoration:none;font-size:17px;cursor:grab}
ol{line-height:1.7;padding-left:22px}code{background:#222;padding:2px 6px;border-radius:5px}.box{background:#1b1d22;border:1px solid #2c2f36;border-radius:12px;padding:18px 20px;margin:18px 0}
textarea{width:100%;box-sizing:border-box;height:70px;background:#0d0e10;color:#ccc;border:1px solid #2c2f36;border-radius:8px;padding:8px;font-size:12px}small{color:#777}</style></head><body><main>
<h1>${name}</h1><p class="s" id="online">Jugadores en línea: ${clients.size}</p>
<div class="box"><p><b>Paso 1.</b> Arrastra este botón a tu barra de marcadores (si no la ves, pulsa <code>Ctrl+Shift+B</code>):</p>
<p><a class="b" href="${href}">▶ ${name}</a></p>
<p><b>Paso 2.</b> Abre <a href="https://agar.io" style="color:#6f9bff">agar.io</a>, espera a que cargue el menú y pulsa el marcador. El juego se conecta a este server y ya puedes darle a Play.</p>
<p><small>Cada vez que recargues agar.io, vuelve a pulsar el marcador. Si Chrome pregunta si agar.io puede acceder a tu red local, acepta.</small></p></div>
<div class="box"><p><b>Sin marcadores (móvil u otro navegador):</b> en agar.io pulsa <code>F12</code>, pestaña Console, pega esto y pulsa Enter:</p>
<textarea readonly onclick="this.select()">${esc(decodeURIComponent(href.slice(11)))}</textarea></div>
<p><small>Server privado · ${esc(wsUrl)}</small></p></main></body></html>`;
}

const handler = (q, r) => {
  const path = String(q.url || '/').split('?')[0];
  if (path === '/status') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ name: CFG.name, online: clients.size, max: CFG.maxClients })); }
  if (path !== '/') { r.writeHead(404, { 'content-type': 'text/plain' }); return r.end('not found\n'); }
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(landingPage(q));
};
const tls = CFG.cert && CFG.key;
const server = tls ? https.createServer({ cert: fs.readFileSync(CFG.cert), key: fs.readFileSync(CFG.key) }, handler) : http.createServer(handler);
server.on('upgrade', onUpgrade);
server.listen(CFG.port, CFG.host, () => {
  console.log(`${CFG.name} listening on ${tls ? 'wss' : 'ws'}://${CFG.host}:${CFG.port}  (bots: ${CFG.bots})`);
});

for (let i = 0; i < CFG.foodAmount; i++) spawnFood();
for (let i = 0; i < CFG.virusAmount; i++) spawnVirus();
let next = Date.now();
(function loop() {
  const now = Date.now();
  let n = 0;
  while (now >= next && n++ < 5) { gameTick(); next += CFG.tickMs; }
  if (now - next > 1000) next = now;
  setTimeout(loop, Math.max(1, next - Date.now()));
})();
