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
  maxClients: 200, maxPerIp: 12,
  tickMs: 40,
  border: 7071,
  viewW: 1920, viewH: 1080, viewMult: 2.2,
  foodAmount: 1500, foodSpawnPerTick: 12, foodMin: 10, foodMax: 20,
  virusAmount: 30, virusMax: 60, virusSize: 100, virusFeeds: 7, virusShot: 780, virusEatMassRatio: 1.3225, popMaxPiece: 60,
  startSize: 223.61, botStartSize: 141.42, maxSize: 1500, maxCells: 16, minSplitSize: 59.16, minEjectSize: 59.16,
  splitBoost: 780, ejectSize: 36.06, ejectLoss: 1800, ejectBoost: 780, ejectCooldown: 3, ejectMax: 2000,
  eatRatio: 1.15, eatOverlap: 1 / 3,
  mergeSec: 30, mergeSizeK: 0.2,
  decayPerSec: 0.002, decayMinSize: 32,
  speedK: 2.2 * 40, speedPow: -0.45,
  bots: 50, botRespawnTicks: 50,
  admin: process.env.ADMIN_PASSWORD || 'maroc1234',
  leaderboardTicks: 25, nameMax: 15,
  freeRoamSpeed: 60, freeRoamSize: 600,
  minionStartSize: 70.71,
  debug: 0,
};

for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i].replace(/^--/, ''), v = process.argv[i + 1];
  if (!(k in CFG) || v === undefined) { console.error('Unknown option ' + process.argv[i]); process.exit(1); }
  if (k === 'admin') { CFG.admin = String(v); continue; }
  CFG[k] = typeof CFG[k] === 'number' ? Number(v) : v;
}

let B = CFG.border;
const MAP_SIZES = { small: 3536, medium: 7071, large: 10607 };
const BOT_NAMES = ["ヅ ༺Mчѕтιc༻ ✦", "꧁〖Øδ〗 Jσкєя꧂ ☽", "꧁🔰 Sιrιυѕ꧂ ฬ", "ヅFαηgヅ ༺", "❥Şαναgє❥ 『』 ꙰", "⛧ƘΞcℓιρѕє⛧☣", "☣Fαℓcση☣ 夜۝", "༺Tυηdяα༻ 刃༻",
  "༺Ňσvα༻ ☠", "☾ℜιƒт丶Øηyx☽ ⛧ 一", "♚ ♛ØĐяαcσ♛一一惡終", "Fαℓcση ♛ ☽", "❥ ꧁Mσятαℓ꧂一毒", "💀Vαℓнαℓℓα💀☾", "⚔☠ ΛLуηχ⚔ ♛", "☣ ヅℜυιηヅ 神", "✞Fαℓcση✞ 〖Øδ〗",
  "༺Kяαкєη༻ ™ ฬ", "✖ ♛XTυявσ♛ 亡", "♛Dσσм♛✪", "❥Vσιd❥ ꧁✭ ✖", "Şρєcтєя ☣", "☠ΛHєχ☠ツ", "⚔Tєяяσя⚔꙰", "『ΔĐяιƒт』 數ฬ", "『Ňσvα×Qυαятz』™", "⚔Đιєѕєℓ⚔ 🜏 ✦",
  "☠Lуηχ☠ ヅ ヅ", "༺XPуяσ×Λяcтιc༻一", "♛ ⚡ŦIηƒєяησ⚡一漻", "⛧Qυαятz⛧ ♚", "☣Ǥнσsτ☣✖", "〖Hαναc〗 翼⚔", "💀Fαηg💀 ♛ ✦", "⚡Vєηαтяιχ⚡ 刃ฬ", "⚡ΔŞαναgє⚡ 毒࿊",
  "✞❥ ℜαρтσя✞ ✪", "💀Fяσѕт💀 🜏", "⛧ 💀Şтσям💀一魔", "⛧ŇσvαΞPιχєℓ⛧⚡", "♛Đяαcσ♛ ™ 🔰", "⚔Øηyx⚔☢", "⚡ℜєαρєя⚡ ƬψƬ ☢", "༺ℜσgυє༻ 幻꙰", "☠🐉 Mαмвα☠ ꙰",
  "✞Mσηαяcн✞ ☾", "✈ ⚡ØTємρєѕт⚡ 刃", "꧁✭ ❥ƤCσвяα❥ 一", "༺Iηƒєяησ༻ ☣ ✞", "Şρєcтєя✞", "⛧ ☾Ňєυтяση☽一爱", "〖ŦIηƒєяησ〗۝", "☠Vαηdαℓ丶Đяαcσ☠⚡", "☣ ✞Şнσgυη✞一炎",
  "🔰 ☣Øηyx☣一爱", "⚔ Λρєχ ฬ", "⚡Λzяαєℓ⚡么", "Λzяαєℓ ♛ ☢", "Gℓιтcн 〖Øδ〗", "〖🐉 Mιdαѕ〗 ™", "꧁ƤTυявσ꧂ 緑ฬ", "🜏 ⚡ŻŞρєcтєя⚡一覇", "💀꧁✭ ŻMιяαgє💀 ⚔", "🔥 Fυяу ۝",
  "™ ☣Fαηg☣ ☽", "☠ŻŇєυтяση☠ ฬ✖", "⚡☾ Ňιgнтмαяє⚡ ツ", "☣ ♛Fяσѕт♛一炎", "Mσятαℓ 〘🍩〙✈", "💀⛧ Hєχ💀 么", "⚡ ❥ℜαρтσя❥ ❥", "༺Ňιgнтмαяє༻ ☽", "Tυηdяα 神⚔",
  "⚡Bℓιgнт⚡ฬ", "『Ňσvα』 ✖ ⚔", "☠Vαηdαℓ☠ 表么", "☣Fυяу☣ ☠", "☠Fяσѕт☠ 幻☽", "⚔ØGℓιтcн⚔ツ", "✞Λρєχ✞ 焱✈", "⚔🐉 Hყdяα⚔ ☠", "⚡Λρєχ Łσкι⚡✪", "🐉 ✞Şρєcтєя✞ ♛",
  "༺⛧ Øвℓινιση༻ ✪", "✈ 〖Cђασѕ〗 ࿊", "🔥 ☣Şнσgυη☣ 一", "❥ΔŞαναgє❥ 〖Øδ〗", "⛧ƘCσмєт⛧ 爪۝", "꧁Şтяүкєя꧂꙰", "💀⚔ ŦVσιd💀 ☾", "💀ΛŞђคđσฬ💀 夜ツ", "⛧ŦMσятαℓ⛧ 🜏 ☠",
  "✖ ♛Pιχєℓ♛一氷", "꧁✞ Λєтнєя꧂ ✪", "♚ ꧁XΛzяαєℓ꧂ ฬ", "☾Iηƒєяησ☽ ༺ ✧", "⛧Fαηg⛧ ƬψƬ ☢", "⛧Fαℓcση⛧ ☽", "꧁ℜคvєη꧂ 翼✪", "✖ ༺Đяαcσ༻ ꙰", "⚔℣ℜυιη⚔ ♛ ✈",
  "〖Ŧℜage〗 ꧁✭", "ヅCσмєтヅ™", "༺ ꧁Hαναc꧂一玄", "♛ ꧁ℜυιη꧂ 漻", "✈ ꧁Hყdяα꧂ ฬ", "♛Hєχ♛ ☠", "⚡ ☾ℜυιη☽一氷", "VØЯŦΞЖ ✞", "✞ℜαмραgє✞ ✈ メ", "💀💀 Øвℓινιση💀 彡",
  "❥Mαgмα❥ ヅ", "✞☽ Şђคđσฬ✞ ✖", "MGR! ✌ ØFяσѕт ™", "💀 ༺Şтєℓℓαя༻ ✧", "꧁✭ ☾Cσѕмσ☽ 夜", "💀 ❥ŦMαмвα❥ 氷", "✞Cяιмѕση✞ 一惡終☽", "⛧Şαναgє⛧ ༺ ฬ", "💀Fяσѕт💀⚡",
  "☢ ヅŇσvαヅ ☣", "❥ ⛧Đяιƒт⛧ 刃", "⚔ ♛Gℓιтcн♛一氷", "✞Λєтнєя✞ 🔥 ✈", "⚔XFяσѕт⚔✞", "☾XMανєяιcк☽⚔", "⛧✈ Şєηтιηєℓ⛧ ♛", "⛧Ǥнσsτ丶Tєяяσя⛧☣", "꧁Vєทσм꧂ 數✦",
  "🜏 ヅMσηαяcнヅ ☣", "🜏 💀Bιѕнσρ💀一炎", "꧁✭ ⚡Iηƒєяησ⚡ ☾", "💀❥ Bιѕнσρ💀 ✖", "♛XŇσvα♛ ヅ", "⚔Tняαѕн⚔么", "Mαмвα ☽", "☣ ❥Đαggєя❥ 氷", "꧁Pιχєℓ Jσкєя꧂ฬ",
  "⚡ ŦMчѕтιc ⚡", "♚ ༺Ňσcтιѕ༻一翼", "❥™ ℜιƒт❥ ✖", "〖ℜคvєη〗 漻☽", "⚔Øηyx⚔ ♛", "ヅ ⛧Fυяу⛧ ☣", "ヅMιяαgєヅ 🔥", "『ƤHαναc』 MGR! ✌", "☣ ☣Pуяσ☣ 玄", "☣ℜιƒт☣✈",
  "💀VØЯŦΞЖ💀 『』", "ŻBєяѕєяк 魔✖", "『Bℓιgнт』一", "꧁♚ Mαgмα꧂ 彡", "☾ ☾ØTємρєѕт☽ ♛", "⚔Iηƒєяησ⚔✞", "☾ ❥Λzяαєℓ❥一雷"];

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
  const r0 = p.minion ? CFG.minionStartSize : p.bot ? CFG.botStartSize : CFG.startSize;
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
    splitCell(c, Math.atan2(dy, dx), c.r, CFG.splitBoost * Math.pow(c.r, 0.0122));
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

// Virus pop, ported from MultiOgarII (Virus.onEaten): equal pieces for small cells, half-half cascade for big ones.
function popCell(c) {
  const p = c.owner;
  let cellsLeft = CFG.maxCells - p.cells.length;
  if (cellsLeft <= 0) return;
  const splitMin = CFG.popMaxPiece * CFG.popMaxPiece / 100;
  const cellMass = c.r * c.r / 100, splits = [];
  if (cellMass / cellsLeft < splitMin) {
    let splitCount = 2, splitMass = cellMass / splitCount;
    while (splitMass > splitMin && splitCount * 2 < cellsLeft) splitMass = cellMass / (splitCount *= 2);
    splitMass = cellMass / (splitCount + 1);
    while (splitCount-- > 0) splits.push(splitMass);
  } else {
    let splitMass = cellMass / 2, massLeft = cellMass / 2;
    while (cellsLeft-- > 0) {
      if (massLeft / cellsLeft < splitMin) {
        splitMass = massLeft / cellsLeft;
        while (cellsLeft-- > 0) splits.push(splitMass);
        break;
      }
      while (splitMass >= massLeft && cellsLeft > 0) splitMass /= 2;
      splits.push(splitMass);
      massLeft -= splitMass;
    }
  }
  c.born = tick;
  for (const m of splits) {
    const size = Math.sqrt(m * 100), rest = c.r * c.r - size * size;
    if (!(rest > 0) || Math.sqrt(rest) < CFG.decayMinSize) continue;
    c.r = Math.sqrt(rest);
    splitCell(c, Math.random() * 6.2832, size, CFG.splitBoost * Math.pow(size, 0.0122));
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
  return free.length ? free[Math.floor(Math.random() * free.length)] : BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
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
  if (m.length >= 4 && m[0] === 0x7e && m[1] === 0x43 && m[2] === 0x48 && m[3] === 0x54) { onChat(cl, m.subarray(4).toString('utf8')); return; }
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
  else if (op === 18) { if (cl.spectate) { cl.free = !cl.free; if (cl.free) { cl.cx = clamp(cl.cx, -B, B); cl.cy = clamp(cl.cy, -B, B); } } }
  else if (op === 17) { if (p.split < 4) p.split++; }
  else if (op === 21) p.eject = true;
}

//CHAT & COMMANDS
// Shop skin triggers from GameConfiguration.json 10934 (the client draws a cell's skin from this id).
const SKINS = ["%banana", "%cookie", "%jupiter", "%birdie", "%mercury", "%apple", "%good", "%neptune", "%blackhole", "%uranus", "%starball", "%target",
  "%galaxy", "%venus", "%breakfast", "%saturn", "%pluto", "%tigerpattern", "%hotdog", "%heart", "%mouse", "%wolf", "%goldfish", "%pig", "%blueberry", "%bomb",
  "%bowling", "%candy", "%frog", "%hamburguer", "%nose", "%seal", "%panda", "%pizza", "%snowman", "%sun", "%baseball", "%basketball", "%bug", "%cloud", "%muu",
  "%tomatoface", "%mushroom", "%donuts", "%terrible", "%ghost", "%appleface", "%turtle", "%brofist", "%dog", "%footprint", "%pineappleface", "%zebrapattern",
  "%toon", "%octopus", "%radar", "%eye", "%owl", "%virus", "%smile", "%army", "%cat", "%nuclear", "%toxic", "%doggie", "%face", "%willie", "%luchador",
  "%zombie", "%bite", "%crazy", "%hockey", "%jarbrain", "%evil", "%pirate", "%evileye", "%halloween", "%monster", "%scarecrow", "%spy", "%santa",
  "%gingerbread", "%grinch", "%fly", "%spider", "%wasp", "%lizard", "%bat", "%snake", "%fox", "%coyote", "%hunter", "%sumo", "%bear", "%cougar", "%panther",
  "%lion", "%crocodile", "%shark", "%mammoth", "%raptor", "%t_rex", "%kraken", "%cupcake", "%kiss_boy", "%kiss_girl", "%cupid", "%shuttle", "%astronaut",
  "%space_dog", "%grey", "%meteor", "%ufo", "%rocket", "%boot", "%gold_pot", "%hat", "%horse_shoe", "%leaf_clover", "%leprechaun", "%rainbow", "%choco_egg",
  "%carrot", "%easter_island", "%rooster", "%rabbit", "%april_fool", "%earth_day", "%chihuahua", "%cactus", "%sombrero", "%hot_pepper", "%chupacabra", "%taco",
  "%pinata", "%dragon", "%gargoyle", "%gopher", "%sheep", "%thirteen", "%black_cat", "%crow", "%mask", "%goblin", "%greenman", "%slimeface", "%jellyblob",
  "%invader", "%spacehunter", "%soccerball", "%glub", "%soccer_shoe", "%striker", "%starplayer", "%tender_heart_bear", "%funshine_bear",
  "%bright_heart_raccoon", "%cozy_heart_penguin", "%lotsa_heart_elephant", "%brave_heart_lion", "%crazy_ball", "%skyrocket", "%stars_stripes", "%mighty",
  "%uncle_sam", "%eagle", "%liberty", "%dust_brain", "%oculus_orbus", "%screamin_meamie", "%hornhead", "%skull_face", "%sunbath", "%watermelon", "%starfish",
  "%icecream", "%surfer", "%diver", "%birthday_sanik", "%birthday_wojak", "%birthday_cia", "%birthday_sir", "%birthday_doge", "%birthday_lol",
  "%birthday_troll", "%hot_coffee", "%soda_can", "%jelly", "%fries", "%burger_face", "%hard_shroom", "%drumstick", "%tennist", "%gymnast", "%judo_fighter",
  "%swimmer", "%sprinter", "%mico", "%toco", "%parrot", "%rascal", "%pirate_maiden", "%captain_skull", "%black_beard", "%cannonball", "%mad_monkey",
  "%bullseye", "%touche", "%jab", "%backswing", "%spike", "%smash", "%dunk", "%gamma", "%neila", "%omicron", "%vega", "%smyg", "%white_horse", "%monk",
  "%water_spirit", "%boar", "%kong", "%bull_king", "%jade_dragon", "%treasure_squiggly", "%treasure_explorer", "%squirrel", "%acorn", "%maple", "%badger",
  "%prey", "%sly", "%faun", "%pinehead", "%sea_turtle", "%volcano", "%coconuts", "%warrior", "%seer", "%scar", "%viper", "%biker", "%desert_fox", "%ranger",
  "%devourer", "%raider", "%nuke", "%toxic_eater", "%ogre", "%scavenger", "%marauder", "%mutant", "%ooze", "%hazmat", "%happy_croc", "%undead", "%phantom",
  "%werewolf", "%mummy", "%vampire", "%frankenstein", "%pumpkin", "%masked", "%skull_cactus", "%skeleton", "%infernando", "%calavera", "%poison_rose",
  "%calaca", "%major_eagle", "%xray", "%the_tiger", "%star_sentinel", "%iron_titan", "%cyber_kid", "%omega_blast", "%dr_cosmos", "%terra", "%aqua", "%aer",
  "%ignis", "%colossus", "%dark_matter", "%pie_slice", "%pilgrim", "%virginia", "%turkey", "%mr_pumpkin", "%happy", "%bread", "%pug", "%winter_wolf",
  "%viking", "%icy_braid", "%berserker", "%champion", "%jotun", "%archery_king", "%root_gnome", "%hobgoblin", "%pixie", "%basilisk", "%firebird",
  "%magic_gerbil", "%gryphon", "%dark_wings", "%cyber_guard", "%star_pilot", "%cosmo_pirate", "%moon_ship", "%space_warden", "%evil_master", "%reindeer",
  "%elf_helper", "%santa_claus", "%polar_bear", "%penguin", "%flying_cork", "%happy_soda", "%bruiser_goat", "%rogue_bunny", "%rhino_boxer", "%street_bull",
  "%husky_brawl", "%kempo_tiger", "%best_friends", "%chrono_ranger", "%cool_agent", "%time_dude", "%time_doctor", "%wicked_cat", "%duck_target",
  "%bubblesaurus", "%dynamite_guy", "%neon_bug", "%blue_swirl", "%jumper", "%carp", "%china_dragon", "%dumpling", "%chicken", "%fire_rooster", "%heartbreaker",
  "%virtuoso", "%rocker", "%idol", "%poet", "%superstar", "%bad_boy", "%thief", "%sheriff", "%king", "%merry_outlaw", "%tiny_jack", "%jade", "%choco_heart",
  "%strawberry", "%love_arrow", "%bunny", "%palm_tree", "%samba", "%mountain", "%bird_mask", "%trickster", "%golden_mask", "%performer", "%diva", "%songsmith",
  "%icon", "%metal_face", "%soloist", "%huntsman", "%war_paint", "%behemoth", "%general", "%giant_skull", "%great_zilla", "%horse_boot", "%happy_hat",
  "%bad_clover", "%gold_rush", "%red_beard", "%cloud_prism", "%aries", "%coil", "%cat_cauldron", "%seal_knight", "%mystic_bird", "%king_lion", "%excalibur",
  "%magic_hat", "%funny_face", "%air_bag", "%smelly", "%cyber_agent", "%droid", "%detective", "%karate_parrot", "%raccoon_jutsu", "%frog_thai",
  "%easter_chick", "%wacky_egg", "%cool_bunny", "%taurus", "%destroyer", "%storm_fist", "%war_hero", "%eyeball", "%starfighter", "%power_badger",
  "%alien_tree", "%crazy_sombrero", "%maracas", "%hot_taco", "%sabertooth", "%silver_tusk", "%primal", "%amber", "%stone_tool", "%fire_face", "%gemini",
  "%wacky_hero", "%fallen", "%power_girl", "%skull_ribbon", "%eyepatch", "%mega_power", "%jellyfish_ball", "%walrus_ball", "%bat_ball", "%elephant_ball",
  "%sheep_ball", "%pig_ball", "%apocalypse_rider", "%eclipse_hunter", "%universal_ranger", "%slaughter", "%slingblade", "%the_professional", "%sonic_boom",
  "%cyber_scarab", "%haste", "%psycho_driller", "%supremus", "%yellow_streak", "%mechatron", "%cancer", "%star_eagle", "%celebration_hat", "%mr_boss",
  "%fury_cat", "%helm", "%gladiatrix", "%reptilian", "%orc_grunt", "%cursed_blade", "%orc_warrior", "%hungry", "%queasy", "%lovesick", "%sad", "%bitter",
  "%amazed", "%odd", "%funky", "%angry", "%vicious", "%leo", "%sweaty", "%wicked", "%full", "%tough", "%mischievous", "%dazzled", "%nerdy", "%rabid",
  "%delighted", "%cool", "%dry_face", "%crazy_brain", "%zombie_dog", "%zombie_party", "%walking_hand", "%the_maw", "%rogue", "%archer", "%paladin", "%mage",
  "%scroll", "%raid_boss", "%healing_potion", "%gold_coin", "%super_car", "%war_tank", "%pixel_kong", "%power_fighter", "%techno_kid", "%virgo", "%war_wings",
  "%olympus_hercules", "%olympus_poseidon", "%olympus_medusa", "%olympus_hades", "%olympus_ares", "%olympus_zeus", "%nvr_zap", "%nvr_silent_fox",
  "%nvr_insectoid", "%nvr_shuriken", "%nvr_steel_ram", "%nvr_shadow", "%football_strike", "%steamworld_cogs", "%steamworld_dr_static",
  "%steamworld_steam_freak", "%dragon_griffin", "%dragon_twin", "%dragon_hydra", "%steamworld_think_tank", "%steamworld_can_man", "%steamworld_the_tinker",
  "%dragon_razor", "%dragon_haze", "%dragon_viper", "%zodiac_2017_libra", "%egypt_ankh", "%egypt_cleopatra", "%egypt_pharaoh", "%egypt_egyptian_cat",
  "%egypt_scarab", "%egypt_mummy_king", "%egypt_anubis", "%shogun", "%elder_master", "%geisha", "%war_mask", "%rogue_samurai", "%skull_samurai",
  "%zodiac_2017_scorpio", "%moonlight_metal_ghoul", "%moonlight_psycho", "%moonlight_banshee", "%moonlight_wendigo", "%moonlight_red_fiend",
  "%moonlight_night_hunter", "%mega_mecha", "%spinner_kid", "%bolt_samurai", "%skull_bow", "%power_ninja", "%giant_human", "%husky", "%winter_snowboarder",
  "%winter_white_owl", "%winter_goofy_yeti", "%winter_ice_crystal", "%winter_dire_wolf", "%winter_ice_lord", "%zodiac_2017_sagittarius", "%ringmaster",
  "%burly_man", "%firespitter", "%the_oracle", "%grizzly", "%bullet_man", "%wicked_clown", "%alone", "%yuno", "%rage", "%the_gaunt", "%the_miasma",
  "%the_scorcher", "%the_reaper", "%scythe", "%soul_hunter", "%warhorse", "%mad_cap", "%raspy_elf", "%zany_tree", "%rocket_deer", "%snow_biker", "%bad_santa",
  "%zodiac_2017_capricorn", "%last_master_space_warrior", "%last_master_roller_bot", "%last_master_duel_master", "%last_master_elite_pilot",
  "%last_master_cyber_commando", "%last_master_red_pulse", "%spogh", "%shrieker", "%moon_alisa", "%party_time", "%party_mode", "%pencil", "%splatter",
  "%gouache", "%zodiac_2018_aquarius", "%walrus_art", "%cave_painting", "%future_art", "%groovy_canvas", "%space_ink", "%alien_artist", "%nice_doggy",
  "%cave_troll", "%crazy_eye", "%cog_attack", "%power_glove", "%burner", "%circle", "%cool_guy", "%furious", "%ada", "%watson", "%steam_diver",
  "%zodiac_2018_pisces", "%crazy_bolt", "%mechanicat", "%steam_mask", "%flying_saucer", "%infernus", "%shadow_man", "%sorceress", "%gnome_mage",
  "%elven_noble", "%tea_time", "%necktie_cat", "%big_eyes", "%forest_spirit", "%silly_griffin", "%rowdy_shroom", "%skull_artifact", "%candlelight", "%troldir",
  "%spike_flower", "%sunflower", "%hornet", "%wolf_sigil", "%eternal_snake", "%pyramid_eye", "%sweet_tendril", "%jelly_bear", "%candy_troll", "%theorist",
  "%grandma", "%chirpy_raptor", "%sour_candy", "%sugar_dash", "%chip_cookie", "%slartie", "%mad_muffin", "%candy_genious", "%omega", "%frost_hand",
  "%radical_hand", "%bull_skull", "%the_stranger", "%wild_pepper", "%cookie_mouse", "%planet_cat", "%poker_ace", "%vampy", "%fox_mask", "%love_cat",
  "%mr_goose", "%nutcracker", "%piglet", "%lava_beast", "%astral_deer", "%bionic_ram", "%hyper_coffee", "%suplex", "%mariachi", "%feather_dragon",
  "%surprised_cat", "%idea", "%clever", "%dynamite", "%cactus_flower", "%pepe_loco", "%lead", "%wolf_paw", "%helmet", "%skull_swords", "%surfin_bird",
  "%jelly_diver", "%power_mask", "%spike_fish", "%cool_lion", "%bootlegger", "%deadly_piranha", "%madjawz", "%heavy_metal", "%prankster", "%wacky_hyena",
  "%ice_griffin", "%golden_axe", "%demonic_helmet", "%caribbean_corsair", "%deathly_mine", "%fake_chest", "%mecha_toad", "%mecha_parrot", "%mecha_destroyer",
  "%birthday_blob", "%grumpy_frog", "%tooth_troll", "%birthosaur", "%capn_joe", "%eager_alien", "%guardian", "%death_mouse", "%killer_mask",
  "%egyptian_plague", "%neptunus_spider", "%mutant_herb", "%electronic_girl", "%techno_ninja", "%cyber_punk", "%princess_swift", "%dark_sorceress",
  "%cyber_demon", "%cyber_psychic", "%cyber_monk", "%guinea_pig", "%bad_pigeon", "%awkward", "%bass_bomb", "%techno_quack", "%electro_jelly", "%lightning",
  "%techno_kat", "%bionic", "%fallen_one", "%midnight_yeti", "%defiled_scarecrow", "%leech", "%metal_scorpion", "%mad_fragment", "%ancient_relic",
  "%zula_gorgon", "%goddess_aona", "%evil_genie", "%divine_pearl", "%unknown_totem", "%mr_strange", "%mr_puzzled", "%mr_charming", "%dumboon", "%ark_raider",
  "%diamonds", "%spectral_owl", "%fire_golem", "%cursed_samurai", "%araneaphyx", "%necro_strangler", "%bewitched", "%monday_worker", "%nightmare",
  "%wisgarus_dragonslayer", "%ironfist_titus", "%wicked_vendetta", "%mexican_skull", "%frankie", "%blobby_boy", "%dracool", "%silent_nun", "%minotaur",
  "%golf_battle", "%beetoothven", "%tape_guy", "%chillpanzee", "%psychopanda", "%punk", "%wasted_mouse", "%mr_spanks", "%rastafari", "%beat_box",
  "%melting_man", "%crazy_rudolph", "%masked_menace", "%eleanor_of_light", "%cuppy", "%mistletoe_madness", "%skull_claus", "%dasher", "%snowy_joe",
  "%big_banjo", "%dapper_dog", "%cosmic_horse", "%cat_burglar", "%slime_beast", "%lucky_doll", "%oni", "%guard_dog", "%wide_eye", "%sleepy_fox", "%game_host",
  "%blue_skull", "%voracious", "%sandworm", "%mushroom_face", "%steampunk_cat", "%merry_pencil", "%cybernaut", "%wolf_man", "%skull_magician", "%tiny_reaper",
  "%abductor", "%snout", "%darts_of_fury", "%rainbow_slap", "%purple_hacker", "%color_runner", "%demolition_expert", "%brute_prankster", "%smooth_operator",
  "%good_boy", "%murder_ball", "%wilson", "%head_ball_2", "%leviathan", "%evil_pumpkin", "%scary_teddy", "%toco_bones", "%party_bones", "%battle_angel",
  "%caterpillar", "%victory_orc", "%power", "%rose", "%entertainer", "%bunnytron", "%electro_chick", "%cyborg_clown", "%cthulhu", "%snow_friend", "%best_gift",
  "%snow_globe", "%rat", "%golden_rat", "%lucky_rat", "%omnom_gator", "%omnom_snek", "%omnom_lion", "%christmas_kittie", "%bad_bone", "%swag_royalty",
  "%baddie", "%chilled_homie", "%dog_life", "%demon", "%in-cog-nito", "%lit", "%steam_skull", "%giant_spider", "%kobe", "%neon_dog", "%moustache_mask",
  "%gorilla", "%sweetie", "%nibblebug", "%shot_of_love", "%dollhouse", "%plague", "%stretch_dog", "%dragon_god", "%bald_eagle", "%direction_giver",
  "%health_fixer", "%thirst_quencher", "%tummy_filler", "%barrel", "%fangtooth", "%attabouy", "%arievil", "%madame_moo", "%panda_fun", "%desert_worm",
  "%mindseye", "%madshroom", "%enokuous", "%hatter", "%cheshire", "%african_lion", "%lop_bunny", "%sweet_egg", "%viletauro", "%wannapieceofme", "%stay_home",
  "%ghost_reaper", "%dohnut", "%moofun", "%wahfull", "%dancer", "%guitarist", "%cobra", "%jumping_mouse", "%baby_gator", "%snailbun", "%octogummy",
  "%icecreamy", "%zombishrum", "%mushroom_bot", "%geminhate", "%snoochie_boochie", "%midnight_wolf", "%cosmic_wolf", "%narwuul", "%inflamed",
  "%killer_octopus", "%beardy_girl", "%cancerous", "%spongeee", "%ultimate_golf", "%fury_bird", "%gahhhlic", "%tjoops", "%frankie_tomankie", "%uncle_eagle",
  "%free_skies", "%skull_boss", "%river_crocodile", "%concentrated", "%duckface", "%beastleo", "%croc_fu", "%octoeira", "%krav_monki", "%DavyBorg",
  "%giant_snake", "%bandit", "%chief", "%stud", "%wolf_boss", "%mini_militia", "%cat_duck", "%sailor_seal", "%mr_banana", "%angies_sammish",
  "%red_hot_watermelon", "%jungle_tiger", "%sir_bonesy", "%virgawful", "%makinbakin", "%porky", "%dattebayo", "%blackLeg", "%funguys", "%cootie", "%screamer",
  "%gryphon_boss", "%great_white", "%chomper", "%zipper", "%lurid", "%jaja", "%elBillion", "%sunkey", "%mini_football", "%big_muggy", "%le_smash",
  "%big_power", "%black_panther", "%devadip", "%devilish", "%brooklyn", "%baldman", "%hunter_z", "%gummy", "%moose", "%delli", "%devious", "%monster_blob",
  "%ghosties", "%pumpkitty", "%hello_reaper", "%skullpio", "%king_ghoulish", "%skullberry", "%krakenuts", "%nightfury", "%leodroid", "%grey_fang",
  "%green_grub", "%cookie_robber", "%nomster", "%guerrilla_boss", "%sagiastrous", "%viktory", "%black_dragon", "%lovely", "%big_jaw", "%rockhopper", "%amur",
  "%baobao", "%zapnaut", "%borggy", "%shiny_tree", "%jolly_santa", "%young_bonny", "%calico_jack", "%hunter_fox", "%capsicum", "%wicked_frosty", "%big_horn",
  "%skelly", "%wendy_axe", "%the_grin", "%frenzy", "%gobbler", "%creepy_cracker", "%poppyns", "%dj_stice", "%mad_ramon", "%agent_morel", "%wild_cooper",
  "%torch_header", "%aqugly", "%mari_monshroom", "%big_mustagus", "%sluggy", "%bottle_map", "%treasure", "%dunker", "%cheesy", "%peppegario", "%gotxu",
  "%lovesick_ted", "%kiss", "%crazy_love", "%pickeyes", "%walko", "%tranqeeze", "%sliptoon", "%chikadahr", "%squiggle", "%bubbabutt", "%iridian_tiger",
  "%adventurer", "%silverback", "%leopard", "%starsign_aries", "%alien_blast", "%rainbow_tusk", "%prismatic_jackal", "%chromatic_peafowl", "%simian_spectrum",
  "%baseball_clash", "%troublemaker_bunny", "%doomsday", "%cute_bunny", "%egg", "%starsign_taurus", "%weirdough", "%creepy_crepe", "%salty_assault",
  "%derpy_parasaurolophus", "%titanomachy", "%ragnarok", "%last_judgment", "%reckoning", "%world_end", "%Senor_Avocado", "%El_Coyote", "%derpy_stegosaurus",
  "%derpy_elasmosaurus", "%derpy_t_rex", "%derpy_dilophosaurus", "%derpy_triceratops", "%starsign_gemini", "%icky", "%gooey", "%gunky", "%tiki_king", "%unga",
  "%totta", "%starsign_cancer", "%toasty", "%unbread", "%onion_king", "%mr_freedom", "%lady_liberty", "%the_eagle", "%festive_monkey", "%pandamonium",
  "%party_howl", "%starsign_leo", "%pinata_warden", "%cake_master", "%sixcess", "%derpy_banana", "%mr_orangutan", "%starsign_virgo", "%mischievous_ape",
  "%so_jelly", "%lol_pop", "%a_dough_rable", "%funky_angel", "%fall_spirit", "%go_nuts", "%timber", "%starsign_libra", "%dummy", "%the_undying",
  "%fur-rocious", "%starsign_scorpio", "%arthropod", "%centaur", "%twins", "%amphibian", "%thefaun", "%harpy", "%woopheus", "%glitch", "%replicant",
  "%starsign_sagittarius", "%starsign_capricorn", "%mr_claus", "%mad_flake", "%meltdown", "%green_heist", "%golden_tiger", "%angry_tiger", "%grrrreat_tiger",
  "%fire_tiger", "%old_joker", "%flamenco", "%the_volto", "%so_fly", "%worth_it", "%bee_cool", "%sun_shade", "%dabbit", "%crack_me_up", "%egg_cited",
  "%need_space", "%red_knight", "%toast_tally", "%mr_oink", "%axolotl", "%dinozila", "%uniduck", "%turtail", "%mr_smile", "%the_phanthom_thief",
  "%the_enforcer", "%wild_card", "%the_locksmith", "%the_anarchist", "%impopsicle", "%bake_me", "%catzilla", "%ziggy", "%cherriffic", "%punk_in_pink",
  "%flamingood", "%el_pinko", "%seven_years", "%forkive_me", "%too_cheesy", "%lets_roll", "%dinersaur", "%dino_star", "%try_ceratops", "%old_chipper",
  "%a-peel-ing", "%who", "%wise_crow", "%fun_g", "%amanita", "%suillus", "%ooze_monster", "%lag_monster", "%demonetized", "%count_flaky", "%biteaminc",
  "%impastable", "%mr_nice_pie", "%corn-ivore", "%gobble_time", "%beary", "%big_shoes", "%the_claus", "%brainless", "%bunny_sigil", "%ramjet_bunny",
  "%rabuddhist", "%mino_pirate", "%muscaria", "%octashroom", "%kaiju_shroom", "%hip_hop", "%big_barnum", "%the_yoga", "%glucose", "%unconeditionally",
  "%pudding", "%hoppy", "%hamsome", "%hummingbird", "%quackitude", "%ross", "%earresistible", "%blue_kraken", "%denvo", "%pit", "%power_shark", "%tusktusk",
  "%sake", "%nest", "%boarsome", "%angry_puffer", "%mad_sun", "%sting_break", "%california", "%quacker", "%cycloptic_funguy", "%smiley_spore",
  "%lady_sporelina", "%happy_bird", "%kalo", "%quincy", "%cupcool", "%chococheer", "%blissful_dough", "%frosty_chomper", "%lunar_truffle", "%chocoslush",
  "%chocoglee", "%chefchoco", "%fruity_penguin", "%bubblezombie", "%candy_firebeast", "%shredberry", "%fluffy_fright", "%nutty_muncher", "%choco_worker",
  "%gloopmeister", "%mcchompface", "%choco_saurus_rex", "%choco_cruiser", "%fox_beats", "%flameblade_conqueror", "%lobster_matey", "%shark_matey",
  "%lightsaber_marauder", "%midnight_raven", "%mystic_oculi", "%skull_of_shadows", "%angry_frank", "%chocolate_wondero", "%muffin_blissbloom",
  "%derpy_carnotaurus", "%derpy_spinosaurus", "%derpy_pterodactyl", "%derpy_raptor", "%derpy_ankylosaurus", "%derpy_mosasaurus", "%maki_delight",
  "%cyberdactyl", "%dinotron", "%cybersaurus", "%night_stalker", "%sea_lamp", "%blackout_bat", "%dorky_angler", "%santas_letter", "%wicked_coal", "%tree_star",
  "%ho_ho_miau", "%tuxedo_dog", "%giggly_cupid", "%aurelian_dragon", "%tinysaurian_spark", "%guard_dragon", "%blue_wrath", "%arctic_pal", "%angry_berg",
  "%ice_growl", "%thundercluck", "%flame_flapper", "%freeze_feather", "%dazzle_sponge", "%eggmorph", "%eggsercise", "%yolk_smash", "%sunny_side_up",
  "%evil_doughnut", "%rotten_root", "%skele_bunny", "%eggocalypse", "%zombunny", "%nightmare_bunny", "%duck_pilot", "%cutepillar", "%master_orc", "%kooler",
  "%lucha_legend", "%skullero", "%funky_fruitloop", "%mad_purple", "%cadoavo", "%spiky", "%necronaut", "%funghi_claws", "%turtleshroom", "%dreamberry",
  "%furious_fajita", "%sombrero_swagger", "%shroomslide", "%cosmic_swimmer", "%steel_emissary", "%celestial_dj", "%peaceful_voyager", "%outer_world",
  "%hello_human", "%gotta_moove", "%axolotl_explorer", "%emperor_oink", "%tyrannozilla", "%sea_stallion", "%croco_crunch", "%shadow_shark", "%tiny_fairy",
  "%small_goblin", "%young_elf", "%grove_spirit", "%mystical_dwarf", "%brave_halfling", "%wild_werewolf", "%powerful_sorcerer", "%stealthy_assassin",
  "%valiant_knight", "%kami", "%trumpi", "%terrorskeleton", "%citrus_crunch", "%sinister_meow", "%wrathborne", "%shadowfire", "%blizzard_beast",
  "%tentashroom", "%blubbernaut", "%fungi_warlord", "%drakon", "%flamewrath", "%raptor_reptile", "%snugglehorn", "%blossom_totem", "%valve_guardian",
  "%steam_knight", "%glowstone", "%incinerator", "%rad_chimp", "%rad_rodent", "%nebula_nomad", "%jurassic_fury", "%ancient_fangs", "%skully_spores",
  "%shroom_shaman", "%froggwarts", "%thunder_beast", "%nightwatcher", "%shroomcoon", "%glamour_grizzly", "%ping_goat", "%professor_fluff", "%dreadful_jack",
  "%ice_hawk", "%goo-cado", "%tribal_beak", "%astro_zombie", "%loco_guac", "%goldphin", "%olympink_horse", "%puncheroo", "%cool_canine", "%giggle_tower",
  "%victory_spark", "%orbit_invaders", "%soggy_sentinel", "%terror_tooth", "%plumetastic", "%frostbringer", "%flame_roar", "%kitty_quack", "%captain_seal",
  "%dapper_hippo", "%bamboo_cutie", "%furious_horn", "%savage", "%steelclaw", "%midnight_stalker", "%professor_chaos", "%warlord_kong", "%ghostpelt",
  "%stormpelt", "%stormzilla", "%hydra_wrath", "%tentacle_terror", "%fox_of_ages", "%neon_undead", "%dune_phantom", "%desert_ruler", "%gentleporker",
  "%paradise_bird", "%desert_explorer", "%eagle_rocker", "%midnight_majesty", "%voidstalker", "%moon_witch", "%road_howler", "%gloomlight", "%nocturna",
  "%twilight_terror", "%moonlit_bride", "%ghoul_gourd", "%ghoulface", "%desert_surfer", "%dragonaut", "%sheriff_slime", "%grape_stinger", "%cosmo_peace",
  "%stellar_saber", "%photon_slayer", "%grumpy_king", "%furball", "%casual_cat", "%batbreaker", "%graveborn", "%darkheart", "%gloomfangs", "%toxic_tendrils",
  "%rhinostar", "%dj_feather", "%striker_cat", "%nutknight", "%frostwalker", "%moonshadow", "%eclipse_eyes", "%venom_veil", "%red_reptile", "%mini_shark",
  "%present_pal", "%santa_smiles", "%elfdeer", "%horns_of_fury", "%tribal_chief", "%frightmas_ball", "%jingle_hells", "%shiny_nose", "%claus_the_cat",
  "%sweet_devourer", "%bling_master", "%red_vampire", "%frosty_friend", "%holiday_heister", "%chill_yeti", "%winter_oink", "%potion_of_shadows",
  "%forest_warden", "%dark_spellcaster", "%boo_tastic", "%jolly_orb", "%infernal_warrior", "%fiesta_frenzy", "%taco_tiff", "%brainiac_biter", "%cloaked_fury",
  "%cranky_hopper", "%jade_fang", "%blue_venom", "%happy_hiss", "%mystic_prowl", "%weaver_whimsy", "%verdant_prince", "%carnival_queen", "%diva_duck",
  "%mad_jester", "%beastlord", "%artic_beast", "%emerald_beast", "%rageanubis", "%devilwatch", "%hornedhavoc", "%techgorilla", "%heartbreak_weed", "%bat_love",
  "%spiked_rose", "%puppet_prince", "%smiley_howler", "%sword_of_legends", "%drizzle_frog", "%sporezilla", "%lil_moldy", "%sauce_smasher", "%mecha_howl",
  "%agent_octopus", "%toxic_chomp", "%goofy_chomp", "%leaf_me_alone", "%pirate_mcquack", "%blackfin", "%tortuga_tyrant", "%neon_racer", "%retro_banana",
  "%retro_pizza", "%retro_bread", "%baby_virus", "%light_years", "%party_chomp", "%rat_king", "%necro_crow", "%cursed_king", "%lizard_nomad", "%ape_instinct",
  "%futurum", "%mega_simian", "%kooky_cell", "%cosmic_gecko", "%dark_fortune", "%pumpkin_tonic", "%voodoo_wrath", "%cinerex", "%chef_chomp", "%smashasaurus",
  "%tricera_taco", "%rainosaur", "%boomraptor", "%rebel_core", "%protocol_blaze", "%gulpzilla", "%wonder_star", "%voidmaster", "%green_goggles",
  "%captain_valor", "%crimson_comet", "%phantom_terror", "%agario_man", "%money_man", "%leafdrake", "%nessie_jr", "%inferno_jr", "%volco_jr", "%dr_cells",
  "%mr_agario", "%general_grudge", "%voltage", "%steel_sentinel", "%molten_beast", "%blazara", "%volt_vibe", "%spoorbozo", "%shroomuncle", "%neon_viper",
  "%lunatic", "%skull_moth", "%t_predator", "%madpharaoh", "%leafasaur", "%dinoVolt", "%voltcoil", "%philosofur", "%retro_call", "%glitch_queen",
  "%rad_coyote", "%sporesaur", "%meltz", "%shellbro", "%featherbro", "%stunt_agent", "%neo_torque", "%deadly_dancer", "%mister_no_one", "%dogged_avenger",
  "%the_fixer", "%virox", "%dr_mixwell", "%giggle_flask", "%jaws_potion", "%nutcurse", "%grinpot", "%woolverine", "%KOLizard", "%hippo_smash", "%maize_craze",
  "%nutmare", "%fang_gourd", "%desert_seer", "%odyssey_lupus", "%rio_snapper", "%retro_apple_face", "%retro_bomb", "%retro_pirate", "%lootpunk",
  "%tentaclonaut", "%rocket_raider", "%hoppy_hat", "%spore_dog", "%biteback", "%gashoot", "%bloomstache", "%harvest_reaper", "%hazmat_horror", "%plague_rat",
  "%jack_odoom", "%flame_gremlin", "%swamp_watcher", "%boogoo", "%booquet", "%boobuck", "%boneca_ambalabu", "%chef_crabracadabra", "%frigo_camelo",
  "%bananananito_bandito", "%u_din_din_din_din_dun_ma", "%trippi_troppi", "%tung_tung_tung_sahur", "%chimpanzini_bananini", "%burbaloni_lulliloli",
  "%skibidi_shark", "%rizz_ninja", "%skibidi_tree", "%trippi_troppi_iconic", "%artic_fox", "%orclash", "%frost_owl", "%ice_breaker", "%pandarion",
  "%enchanted_codex", "%cursed_spine", "%starblink", "%horse_power", "%retro_ace", "%retro_coil", "%retro_galaxy", "%crystal_cheer", "%bundle_of_joy",
  "%grumpmas_tree", "%planet_chomp", "%jingle_chomp", "%luna_beats", "%mothboi", "%capycool", "%fluff_pilot", "%mad_donk", "%rogue_howl", "%doc_cortex",
  "%nom_nom", "%mechashock", "%cosmic_crusader", "%tiki_titan", "%great_void", "%forbidden_bite", "%pickled_horror", "%ravage_wolf", "%nitro_nut",
  "%lunar_stallion", "%flame_steed", "%fortune_foal", "%chill_fox", "%brain_probe", "%chip_mouse", "%dr_splash", "%slugger_lynx", "%reef_guardian",
  "%corporate_eagle", "%nerd_kicks", "%beetle_boss", "%cricket_crunch", "%flutterbug", "%deathstare", "%aggresso", "%dungeon_duster", "%mr_wax", "%acid_brew",
  "%axie", "%chessy", "%formula_x", "%parasite_jar", "%skull_crusher", "%outpaw", "%fresh_slice", "%coop_conqueror", "%oink_wash", "%field_fury", "%toothie",
  "%softy", "%feral_punk", "%jurassic_king", "%neon_punk", "%cyclofuzz", "%prickly_chill", "%ramen_delight", "%ghost_galleon", "%crimson_fang",
  "%cosmic_vortex", "%burger_buddy", "%sir_squeak", "%fizzy_fiend", "%happy_hermit", "%chillfin", "%fireling", "%zen_frog", "%galactic_void", "%jolly_jaws",
  "%scarlet_trickster", "%prismclaw", "%sir_ribbiton", "%sparkle_kraken", "%biteface", "%googly_fang", "%green_globber", "%golden_goo", "%fluffy_blob",
  "%mystic_orb", "%rootling", "%nightbat", "%pigeon_alert", "%penguin_fury", "%mad_mind", "%core_droid", "%specimen", "%sandstorm_rider", "%angry_monster",
  "%happy_monster", "%spectral_cat", "%gemclaw", "%void_phoenix", "%hippo_rock", "%fever_ham", "%rage_virus", "%lab_chief", "%soulflare", "%angry_beak",
  "%plasma_bot", "%cloud_mage", "%witch_owl", "%golden_carrot", "%goalhorn", "%beak_keeper", "%penalty_pup", "%celestial_plague", "%zen_shaman", "%neon_skull",
  "%loco_party", "%showstopper", "%voodoo_queen", "%slice_master", "%jungle_jaguar", "%coco_chimp", "%tropic_bliss", "%scorpitini", "%phantom_stallion",
  "%darkfeather", "%jokester", "%morbina", "%gecko", "%deadshot", "%eyebite", "%ripple", "%scorch", "%blaster_invader", "%world_snatcher", "%abduction_saucer",
  "%majesty", "%mythwing", "%jogger", "%chonk", "%veggie_z", "%slowmo", "%fizzy_friend", "%star_kraken", "%bone_piranha", "%sea_grinner", "%inferno_skull",
  "%volt_mecha", "%golden_gladiator", "%notebeak", "%ruby_spike", "%one_eye", "%astral_dragon", "%beaver_fever", "%dr_feather", "%medibull", "%nightveil",
  "%mysticorn", "%iron_sheriff", "%frostfang", "%hydra_twist", "%reef_goblin", "%scream_queen", "%bone_shaman", "%rebel_rose"];
const CHAT_MAGIC = Buffer.from([0x7e, 0x43, 0x48, 0x54]);
function chatSend(cl, obj) { if (cl.chat) cl.conn.send(Buffer.concat([CHAT_MAGIC, Buffer.from(JSON.stringify(obj), 'utf8')])); }
function chatAll(obj) { for (const cl of clients) chatSend(cl, obj); }
function sys(cl, text) { chatSend(cl, { t: 'sys', text }); }
const pname = (p) => p.name || (p.bot ? 'Bot' : 'Spectator');
const pmass = (p) => Math.round(p.cells.reduce((a, c) => a + c.r * c.r / 100, 0));

function findPlayer(cl, q) {
  if (!q) return cl.player;
  const s = q.toLowerCase(), alive = [...players].filter((p) => p.cells.length && !p.minion);
  return alive.find((p) => p.name.toLowerCase() === s) || alive.find((p) => p.name.toLowerCase().includes(s)) || null;
}

function teleport(p, x, y) {
  x = clamp(x, -B + 50, B - 50); y = clamp(y, -B + 50, B - 50);
  let cx = 0, cy = 0;
  for (const c of p.cells) { cx += c.x; cy += c.y; }
  cx /= p.cells.length; cy /= p.cells.length;
  for (const c of p.cells) { c.x = clamp(x + (c.x - cx) * 0.3, -B + c.r / 2, B - c.r / 2); c.y = clamp(y + (c.y - cy) * 0.3, -B + c.r / 2, B - c.r / 2); c.boost = null; c.moved = tick; gridMove(c); }
  p.mx = x; p.my = y;
  if (p.client) { p.client.cx = x; p.client.cy = y; }
}

function setMass(p, mass) {
  mass = clamp(mass, 10, 100000);
  const cur = pmass(p) || 1, k = Math.sqrt(mass / cur);
  for (const c of p.cells) { c.r = Math.min(CFG.maxSize, Math.max(CFG.decayMinSize, c.r * k)); c.moved = tick; }
}

const HELP_ALL = ['/help', '/who', '/login <password>'];
const HELP_ADMIN = [
  'Mass:  /mass <n>  |  /mass +<n>  |  /mass -<n>  |  /mass <n> <player>',
  'Move:  /tp (click mode)  |  /tp <player>  |  /bring <player>',
  'Players:  /kill [player]  |  /kick <player>  |  /merge  |  /fullmap',
  'Minions:  /minions <count>  (E = split, R = feed; they follow your mouse)',
  'World:  /virus  |  /bots <0-200>  |  /map <small|medium|large>',
  'Chat:  /say <text>',
];

function setMap(size) {
  const half = MAP_SIZES[size];
  if (!half) return false;
  B = half;
  CFG.foodAmount = Math.round(1500 * (half * half) / (7071 * 7071));
  CFG.virusAmount = Math.max(6, Math.round(30 * (half * half) / (7071 * 7071)));
  for (const n of [...nodes.values()]) {
    if (n.type === T_PLAYER) { const m = n.r / 2; n.x = clamp(n.x, -B + m, B - m); n.y = clamp(n.y, -B + m, B - m); n.moved = tick; gridMove(n); }
    else if (Math.abs(n.x) > B - n.r || Math.abs(n.y) > B - n.r) delNode(n);
    else if (n.type === T_VIRUS && virusCount > CFG.virusMax) delNode(n);
  }
  for (const cl of clients) if (cl.ready) sendBorder(cl);
  return true;
}

function onChat(cl, text) {
  const now = Date.now();
  cl.chat = true;
  text = text.replace(/[\u0000-\u001f]/g, '').trim();
  if (!text || text.length > (text.startsWith('/skins ') ? 65536 : 160)) return;
  if (text === '/hello') return;
  if (text.startsWith('/skins ')) { for (const id of text.slice(7).split(',')) { const v = id.trim(); if (/^%?[\w-]{1,40}$/.test(v) && SKINS.length < 5000 && !SKINS.includes(v)) SKINS.push(v); } return; }
  const quick = text === '/msplit' || text === '/meject';
  if (!quick && now - (cl.chatT || 0) < 400) return;
  if (!quick) cl.chatT = now;
  const p = cl.player;
  if (text[0] !== '/') { chatAll({ t: 'msg', from: pname(p), admin: !!cl.admin, text }); return; }
  const [cmd, ...rest] = text.slice(1).split(/\s+/);
  const arg = rest.join(' ');
  const c = cmd.toLowerCase();
  if (c === 'login') {
    if (!CFG.admin) return sys(cl, 'Admin is disabled on this server (no password set).');
    if (arg === CFG.admin) { cl.admin = true; return sys(cl, 'Logged in as admin. Type /help for commands.'); }
    return sys(cl, 'Wrong password.');
  }
  if (c === 'help') {
    sys(cl, 'Commands: ' + HELP_ALL.join('  |  '));
    if (cl.admin) for (const line of HELP_ADMIN) sys(cl, line);
    return;
  }
  if (c === 'who') {
    const list = [...players].filter((q) => q.cells.length && !q.bot).map((q) => `${pname(q)} (${pmass(q)})`);
    return sys(cl, `${clients.size} online: ` + (list.join(', ') || 'nobody alive'));
  }
  if (!cl.admin) return sys(cl, 'Admin only. Use /login <password>.');
  if (c === 'mass') {
    const m = /^([+-]?)(\d+)$/.exec(rest[0] || '');
    if (!m) return sys(cl, 'Usage: /mass <n|+n|-n> [player]');
    const t = findPlayer(cl, rest.slice(1).join(' '));
    if (!t || !t.cells.length) return sys(cl, 'Player not found or not alive.');
    const n = Number(m[2]);
    setMass(t, m[1] === '+' ? pmass(t) + n : m[1] === '-' ? pmass(t) - n : n);
    return sys(cl, `${pname(t)} mass: ${pmass(t)}`);
  }
  if (c === 'tp') {
    if (!p.cells.length) return sys(cl, 'You are not alive.');
    if (!arg) { teleport(p, p.mx, p.my); return; }
    const t = findPlayer(cl, arg);
    if (!t || !t.cells.length) return sys(cl, 'Player not found or not alive.');
    teleport(p, t.cells[0].x, t.cells[0].y);
    return sys(cl, `Teleported to ${pname(t)}.`);
  }
  if (c === 'bring') {
    const t = findPlayer(cl, arg);
    if (!t || !t.cells.length || !p.cells.length) return sys(cl, 'Player not found, or one of you is not alive.');
    teleport(t, p.cells[0].x, p.cells[0].y);
    return sys(cl, `Brought ${pname(t)}.`);
  }
  if (c === 'kill') {
    const t = findPlayer(cl, arg);
    if (!t || !t.cells.length) return sys(cl, 'Player not found or not alive.');
    for (const cell of t.cells.slice()) delNode(cell);
    return sys(cl, `Killed ${pname(t)}.`);
  }
  if (c === 'kick') {
    const t = findPlayer(cl, arg);
    if (!t || !t.client) return sys(cl, 'Player not found (bots cannot be kicked).');
    t.client.conn.end('kicked');
    return sys(cl, `Kicked ${pname(t)}.`);
  }
  if (c === 'virus') {
    if (virusCount >= CFG.virusMax) return sys(cl, 'Too many viruses.');
    addNode(T_VIRUS, clamp(p.mx, -B + 100, B - 100), clamp(p.my, -B + 100, B - 100), CFG.virusSize, [51, 255, 51]);
    return;
  }
  if (c === 'minions') {
    const n = Number(rest[0]);
    if (!(Number.isInteger(n) && n >= 0)) return sys(cl, 'Usage: /minions <count>');
    const mine = [...players].filter((q) => q.minion && q.owner === p);
    while (mine.length > n) { const q = mine.pop(); for (const cell of q.cells.slice()) delNode(cell); players.delete(q); }
    while (mine.length < n) { const q = newPlayer('Minion', true); q.minion = true; q.owner = p; mine.push(q); }
    return sys(cl, `Minions: ${n}` + (SKINS.length ? '' : ' (no skins received yet)'));
  }
  if (c === 'msplit' || c === 'meject') {
    for (const q of players) if (q.minion && q.owner === p && q.cells.length) { if (c === 'msplit') { if (q.split < 2) q.split++; } else q.eject = true; }
    return;
  }
  if (c === 'merge') { for (const cell of p.cells) cell.born = -1e9; return sys(cl, 'Your cells can merge now.'); }
  if (c === 'fullmap') { cl.fullMap = !cl.fullMap; return sys(cl, cl.fullMap ? 'Full map on: you receive the whole map (zoom out to see it).' : 'Full map off.'); }
  if (c === 'bots') {
    const n = Number(rest[0]);
    if (!(n >= 0 && n <= 200)) return sys(cl, 'Usage: /bots <0-200>');
    CFG.bots = n;
    let extra = [...players].filter((q) => q.bot).length - n;
    for (const q of [...players]) { if (extra <= 0) break; if (q.bot && !q.minion) { for (const cell of q.cells.slice()) delNode(cell); players.delete(q); extra--; } }
    return sys(cl, `Bots: ${n}`);
  }
  if (c === 'say') { if (arg) chatAll({ t: 'msg', from: 'Server', admin: true, text: arg }); return; }
  if (c === 'map') {
    const size = (rest[0] || '').toLowerCase();
    if (!setMap(size)) return sys(cl, 'Usage: /map <small|medium|large>  (now ' + (Object.keys(MAP_SIZES).find((k) => MAP_SIZES[k] === B) || B) + ')');
    chatAll({ t: 'sys', text: `Map size: ${size}` });
    return;
  }
  return sys(cl, 'Unknown command. /help');
}

function viewOf(cl) {
  const p = cl.player;
  let x = 0, y = 0, size = 0;
  if (p.cells.length) {
    for (const c of p.cells) { x += c.x; y += c.y; size += c.r; }
    x /= p.cells.length; y /= p.cells.length;
    cl.cx = x; cl.cy = y;
  } else if (cl.spectate && cl.free) {
    const dx = p.mx - cl.cx, dy = p.my - cl.cy, d = Math.hypot(dx, dy), step = Math.min(d, CFG.freeRoamSpeed);
    if (d > 1) { cl.cx += dx / d * step; cl.cy += dy / d * step; }
    cl.cx = clamp(cl.cx, -B, B); cl.cy = clamp(cl.cy, -B, B);
    x = cl.cx; y = cl.cy; size = CFG.freeRoamSize;
  } else if (cl.spectate && top.length && top[0].cells.length) {
    const t = top[0];
    for (const c of t.cells) { x += c.x; y += c.y; size += c.r; }
    x /= t.cells.length; y /= t.cells.length;
    cl.cx = x; cl.cy = y;
  } else { x = cl.cx; y = cl.cy; size = CFG.startSize; }
  const scale = Math.pow(Math.min(64 / size, 1), 0.4);
  cl.scale = scale;
  if (cl.fullMap) return { x0: -B, y0: -B, x1: B, y1: B };
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
  const skin = full && n.type === T_PLAYER && n.owner.skin;
  if (full) f |= 0x02;
  if (skin) f |= 0x04;
  if (name) f |= 0x08;
  w.u8(f);
  if (f & 0x80) w.u8(ext);
  if (full) { w.u8(n.color[0]); w.u8(n.color[1]); w.u8(n.color[2]); }
  if (skin) w.str(skin);
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
    if (!p.cells.length || p.minion) continue;
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
    if (p.minion) {
      const o = p.owner;
      if (!p.cells.length) { if (tick - p.diedAt >= CFG.botRespawnTicks) { p.skin = SKINS.length ? SKINS[Math.floor(Math.random() * SKINS.length)] : ''; spawnPlayer(p); } continue; }
      if (o.cells.length) { p.mx = o.mx; p.my = o.my; }
    } else if (p.bot) {
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
    for (const q of [...players]) if (q.minion && q.owner === cl.player) { for (const cell of q.cells.slice()) delNode(cell); players.delete(q); }
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
