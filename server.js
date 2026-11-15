'use strict';
// Agar.io private server (FFA + bots) for the current web client (protocol 23, unencrypted).
// No dependencies:  node server.js [--port 4400] [--bots 15] [--password clave] [--cert cert.pem --key key.pem]
//
// Hosting (Render / Railway / Koyeb / Fly...):
//   - El puerto se toma de la variable PORT.
//   - La clave de acceso se toma de la variable PASSWORD (o --password).
//   - Cualquier opcion de CFG se puede poner como variable AGAR_<NOMBRE>, ej: AGAR_BOTS=20, AGAR_NAME="Mi server".
//   - GET /          -> pagina con el boton de instalar el userscript
//   - GET /agar.user.js -> userscript de Tampermonkey (se genera con tu dominio)
//   - GET /health    -> para pings de uptime

const http = require('http');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

//CONFIG
const CFG = {
  port: Number(process.env.PORT) || 4400,
  host: '0.0.0.0',
  cert: '', key: '',
  password: process.env.PASSWORD || '',
  name: 'Private FFA',
  maxClients: 200, maxPerIp: 8,
  tickMs: 40,
  border: 6364,                       // 7071 * 0.9  (mapa 10% mas pequeno)
  viewW: 1920, viewH: 1080, viewMult: 2.2,
  foodAmount: 1215, foodSpawnPerTick: 12, foodMin: 10, foodMax: 20,   // 1500 * 0.81 (misma densidad de comida)
  virusAmount: 24, virusMax: 49, virusSize: 100, virusFeed: 7, virusShot: 580,   // 30/60 * 0.81
  virusEatRatio: 1.1533,              // un virus solo te revienta si tu masa > 133% de la suya (sqrt(1.33) en radio)
  virusPieceMass: 36, virusBigMass: 466,   // masa de cada pedazo pequeno al reventar / masa sobrante para partirse en trozos grandes
  startSize: 114.89, botStartMass: 200, playerStartMass: 500,   // masa inicial: bots 200, jugadores reales 500 (radio = sqrt(masa*100))
  maxSize: 1500, maxCells: 16, minSplitSize: 59.16, minEjectSize: 59.16,
  splitBoost: 780, ejectSize: 36.06, ejectLoss: 1800, ejectBoost: 780, ejectCooldown: 2, ejectMax: 2000,
  eatRatio: 1.118, eatOverlap: 0.4,
  mergeSec: 30, mergeSizeK: 0.2,
  decayPerSec: 0.002, decayMinSize: 32,
  speedK: 2.2 * 40, speedPow: -0.439,
  bots: 40, botRespawnTicks: 50,
  leaderboardTicks: 25, nameMax: 15,
};

for (const k of Object.keys(CFG)) {
  const e = process.env['AGAR_' + k.toUpperCase()];
  if (e !== undefined && e !== '') CFG[k] = typeof CFG[k] === 'number' ? Number(e) : e;
}
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i].replace(/^--/, ''), v = process.argv[i + 1];
  if (!(k in CFG) || v === undefined) { console.error('Unknown option ' + process.argv[i]); process.exit(1); }
  CFG[k] = typeof CFG[k] === 'number' ? Number(v) : v;
}

const B = CFG.border;
// Nombres de bots tomados de https://agario-skins.net/agario-names
const BOT_NAMES = [
  "ヅ ༺Mчѕтιc༻ ✦", "꧁〖Øδ〗 Jσкєя꧂ ☽", "♛℣ℜσgυє丶ℜσηιη♛ 焱彡", "꧁🔰 Sιrιυѕ꧂ ฬ", "⛧Şнινєя⛧ ๖ۣۜǤнσsτ༻ ✧",
  "☣ ☠Pιχєℓ•Zєρђყя☠ 一", "ヅFαηgヅ ༺", "❥Şαναgє❥ 『』 ꙰", "⛧ƘΞcℓιρѕє⛧☣", "☣Fαℓcση☣ 夜۝",
  "༺Tυηdяα༻ 刃༻", "✞TняαѕнΞBιѕнσρ✞ ™", "꧁ΛTняαѕн×Wσℓƒ꧂ ⚡", "༺Ňσvα༻ ☠", "☾ℜιƒт丶Øηyx☽ ⛧ 一",
  "♚ ♛ØĐяαcσ♛一一惡終", "Fαℓcση ♛ ☽", "❥ ꧁Mσятαℓ꧂一毒", "💀Vαℓнαℓℓα💀☾", "⚔☠ ΛLуηχ⚔ ♛",
  "〖Øδ〗 ΛTυηdяα•Şђคđσฬ 數", "☣ ヅℜυιηヅ 神", "✞Fαℓcση✞ 〖Øδ〗", "⚡ Qυαятz丶Øяαcℓє一夜", "༺Kяαкєη༻ ™ ฬ",
  "✖ ♛XTυявσ♛ 亡", "♛Dσσм♛✪", "❥Vσιd❥ ꧁✭ ✖", "〖Øδ〗 ヅMανєяιcкヅ 神", "Şρєcтєя ☣",
  "☠ΛHєχ☠ツ", "⚔Tєяяσя⚔꙰", "♚ ❥ƤŞєηтιηєℓŇσvα❥一夜", "『ΔĐяιƒт』 數ฬ", "🔰 ⚡Şтσям×Şкυℓℓ⚡ 魔",
  "『Ňσvα×Qυαятz』™", "♛ ⛧Vєηαтяιχ Cчcℓσηє⛧一氷", "〖Şєηтιηєℓ×Sιrιυѕ〗 🔰", "❥ ༺ØвℓινισηVαℓнαℓℓα༻ ☣", "⚔Đιєѕєℓ⚔ 🜏 ✦",
  "☠Lуηχ☠ ヅ ヅ", "༺XPуяσ×Λяcтιc༻一", "♛ ⚡ŦIηƒєяησ⚡一漻", "⛧Qυαятz⛧ ♚", "☣Ǥнσsτ☣✖",
  "⚔VαηdαℓMσятαℓ⚔ ™", "〖Hαναc〗 翼⚔", "☾ ⚡FяσѕтĐαggєя⚡一魔", "💀Fαηg💀 ♛ ✦", "⚡Vєηαтяιχ⚡ 刃ฬ",
  "⚡ΔŞαναgє⚡ 毒࿊", "⚡ƘŞкυℓℓ丶Iηƒєяησ⚡™", "MGR! ✌ ⚡Mιdαѕ⚡一數", "✞❥ ℜαρтσя✞ ✪", "❥🐉 ΔCђασѕ×ℜєαρєя❥ メ",
  "💀Fяσѕт💀 🜏", "⛧ 💀Şтσям💀一魔", "⛧ŇσvαΞPιχєℓ⛧⚡", "♛Đяαcσ♛ ™ 🔰", "🐉 ☣ŦMσηαяcн丶Hყdяα☣ 翼",
  "❥ℜαρтσяŞαναgє❥ 闇✪", "『ΛєтнєяŞђคđσฬ』 ༗✧", "☾ 💀CσмєtΞCσвяα💀一魂", "⚔ ☾Pυℓѕαя•Şнσgυη☽ ۝", "〖Øδ〗 ♛Đιєѕєℓ•Cяιмѕση♛ ✞",
  "⚔Øηyx⚔☢", "⚡ℜєαρєя⚡ ƬψƬ ☢", "༺ℜσgυє༻ 幻꙰", "☠🐉 Mαмвα☠ ꙰", "✞Mσηαяcн✞ ☾",
  "✈ ⚡ØTємρєѕт⚡ 刃", "꧁✭ ❥ƤCσвяα❥ 一", "⚔Mαgмα×Fαℓcση⚔ ❥ ヅ", "༺Iηƒєяησ༻ ☣ ✞", "☠Mσηαяcн丶Vєηαтяιχ☠⚡",
  "๖ۣۜǤнσsτ༻ ⚡Ňєχυѕ×Cяιмѕση⚡一夜", "Şρєcтєя✞", "⛧ ☾Ňєυтяση☽一爱", "〖ŦIηƒєяησ〗۝", "ヅBιѕнσρMσятαℓヅ 爪么",
  "꧁✭ ♛VØЯŦΞЖΞSιrιυѕ♛一玄", "☠Vαηdαℓ丶Đяαcσ☠⚡", "☣ ✞Şнσgυη✞一炎", "⚡ℜιƒт丶Bℓιgнт⚡ ⚔ ꙰", "💀Øяαcℓє💀 ๖ۣۜǤнσsτ༻",
  "☣Ǥнσsτ丶Vєηαтяιχ☣ ☾", "🔰 ☣Øηyx☣一爱", "⚔ Λρєχ ฬ", "⚡Λzяαєℓ⚡么", "༺꧁✭ Pυℓѕαя Jσкєя༻ ツ",
  "Λzяαєℓ ♛ ☢", "Gℓιтcн 〖Øδ〗", "〖🐉 Mιdαѕ〗 ™", "꧁ƤTυявσ꧂ 緑ฬ", "🜏 ⚡ŻŞρєcтєя⚡一覇",
  "💀꧁✭ ŻMιяαgє💀 ⚔", "☣Tυηdяα×Cяιмѕση☣ ✈ ฬ", "🔥 Fυяу ۝", "༺ℜαρтσя丶Øвℓινιση༻⚔", "™ ☣Fαηg☣ ☽",
  "☠ŻŇєυтяση☠ ฬ✖", "⚡☾ Ňιgнтмαяє⚡ ツ", "☣ ♛Fяσѕт♛一炎", "ƬψƬ ☢ ☠Tняαѕн Tυηdяα☠ ࿊", "〖Øδ〗 〖Pуяσ Sιrιυѕ〗 表",
  "♚ ✞Hαναc•Cιηdєя✞ ꙰", "Mσятαℓ 〘🍩〙✈", "💀⛧ Hєχ💀 么", "⚡ ❥ℜαρтσя❥ ❥", "🐉 ☾ΛяcтιcΞJσкєя☽ ฬ",
  "༺Ňιgнтмαяє༻ ☽", "☣Mαмвα•ℜσgυє☣ ✖ ☢", "✞Qυαятz✞ ƬψƬ ☢ ꙰", "Tυηdяα 神⚔", "⚡Bℓιgнт⚡ฬ",
  "『Ňσvα』 ✖ ⚔", "☠Vαηdαℓ☠ 表么", "☣Fυяу☣ ☠", "☠Fяσѕт☠ 幻☽", "⚔ØGℓιтcн⚔ツ",
];

//WEBSOCKET
class Conn {
  constructor(sock, req) {
    this.sock = sock; this.req = req; this.buf = Buffer.alloc(0); this.frag = []; this.open = true;
    this.onmessage = null; this.onclose = null;
    sock.on('data', (d) => this.data(d));
    sock.on('close', () => this.end());
    sock.on('error', () => this.end());
  }
  end() {
    if (!this.open) return;
    this.open = false;
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
      if (len > 4096 || !masked) return this.end();
      const mo = o; o += 4;
      if (b.length < o + len) return;
      const p = Buffer.from(b.subarray(o, o + len));
      for (let i = 0; i < len; i++) p[i] ^= b[mo + (i & 3)];
      this.buf = b.subarray(o + len);
      if (op === 8) return this.end();
      if (op === 9) { this.raw(10, p); continue; }
      if (op === 10) continue;
      this.frag.push(p);
      if (this.frag.length > 8) return this.end();
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
  const r = Math.sqrt((p.bot ? CFG.botStartMass : CFG.playerStartMass) * 100);
  const s = freeSpot(r);
  p.color = color();
  const c = addNode(T_PLAYER, s.x, s.y, r, p.color, p);
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
    setBoost(e, Math.atan2(dy, dx) + rnd(-0.3, 0.3), CFG.ejectBoost);
  }
}

// Reventar con un virus (mismo esquema que los servidores abiertos tipo MultiOgar):
//  - la celula ya sumo la masa del virus antes de llamar aqui
//  - se parte en el maximo de piezas posible hasta maxCells (cada pieza minimo ~10 de masa)
//  - las piezas pequenas pesan como maximo virusPieceMass; si es una celula pequena se reparte parejo
//  - si la masa que sobra es muy grande (> virusBigMass) se desprenden hasta 3 trozos grandes (mitades)
function popCell(c) {
  const p = c.owner;
  const room = CFG.maxCells - p.cells.length;
  if (room <= 0) return;
  const mass = c.r * c.r / 100;
  const minMass = CFG.decayMinSize * CFG.decayMinSize / 100;   // pieza minima ~10 de masa: se parte en el maximo de celdas posible
  const n = Math.min(room, Math.floor(mass / minMass) - 1);
  if (n < 1) return;
  const small = Math.min(mass / (n + 1), CFG.virusPieceMass);
  let smallN = n, rest = mass - small * n;
  const bigs = [];
  while (rest > CFG.virusBigMass && smallN > 0 && bigs.length < 3) {
    smallN--; rest += small;
    const half = rest / 2;
    bigs.push(half); rest -= half;
  }
  const sizes = [];
  for (let i = 0; i < smallN; i++) sizes.push(Math.sqrt(small * 100));
  for (const m of bigs) sizes.push(Math.sqrt(m * 100));
  c.r = Math.sqrt(rest * 100);
  c.born = tick;
  const a0 = Math.random() * 6.2832;
  for (let i = 0; i < sizes.length; i++) splitCell(c, a0 + i * 6.2832 / sizes.length, sizes[i], CFG.splitBoost * 0.85);
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
      else if (n.type === T_VIRUS) {
        if (c.r > n.r * CFG.virusEatRatio) { eat(c, n); popCell(c); }
      }
      else if (c.r > n.r * CFG.eatRatio) eat(c, n);
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
        if (virusCount >= CFG.virusMax) continue;   // como en Ogar: con el maximo de virus, las masas lanzadas los atraviesan
        const ang = n.boost ? Math.atan2(n.boost.dy, n.boost.dx) : Math.random() * 6.28;
        v.r = Math.sqrt(v.r * v.r + n.r * n.r); v.moved = tick;
        v.feed = (v.feed || 0) + 1;
        delNode(n, v);
        if (v.feed >= CFG.virusFeed) {
          v.feed = 0;
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
    if (n.type === T_VIRUS) { if (big.r > n.r * CFG.virusEatRatio && d < big.r + n.r + 60) virus = n; }
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
    return;
  }
  decrypt(cl, m);
  const op = m[0];
  if (op === 16) {
    if (m.length === 13) { p.mx = m.readInt32LE(1); p.my = m.readInt32LE(5); }
    else if (m.length === 21) { p.mx = m.readDoubleLE(1); p.my = m.readDoubleLE(9); }
    else if (m.length === 9) { p.mx = m.readInt16LE(1); p.my = m.readInt16LE(3); }
    if (!Number.isFinite(p.mx) || !Number.isFinite(p.my)) { p.mx = 0; p.my = 0; }
    p.mx = clamp(p.mx, -B * 2, B * 2); p.my = clamp(p.my, -B * 2, B * 2);
  } else if (op === 0) {
    if (p.cells.length || tick - cl.spawnT < 10) return;
    let e = m.indexOf(0, 1); if (e < 0) e = m.length;
    let name = m.subarray(1, e).toString('utf8').replace(/[\u0000-\u001f\ufffd]/g, '').trim();
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

//ACCESS
// The password can come as ?key=... or as the first path segment (wss://host/clave).
function safeEq(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function parseUrl(raw) { try { return new URL(raw || '/', 'http://x'); } catch (e) { return new URL('/', 'http://x'); } }
function hasAccess(u) {
  if (!CFG.password) return true;
  const q = u.searchParams.get('key');
  if (q !== null && safeEq(q, CFG.password)) return true;
  let seg = '';
  try { seg = decodeURIComponent(u.pathname.slice(1)); } catch (e) { }
  return seg !== '' && safeEq(seg, CFG.password);
}

//WEB PAGE
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function baseOf(req) {
  const proto = String(req.headers['x-forwarded-proto'] || (tls ? 'https' : 'http')).split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:' + CFG.port).split(',')[0].trim();
  return { http: proto + '://' + host, ws: (proto === 'https' ? 'wss' : 'ws') + '://' + host };
}

function userscript(req) {
  const b = baseOf(req);
  const target = b.ws + '/' + (CFG.password ? '?key=' + encodeURIComponent(CFG.password) : '');
  const title = String(CFG.name).replace(/[\r\n]/g, ' ');
  return `// ==UserScript==
// @name         ${title} (agar.io)
// @namespace    private-agar-server
// @version      1.0
// @description  Conecta agar.io a ${title}
// @match        *://agar.io/*
// @match        *://www.agar.io/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  var TARGET = ${JSON.stringify(target)};
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (window.core && typeof window.core.connect === 'function') {
      clearInterval(t);
      try { if (typeof window.core.disableIntegrityChecks === 'function') window.core.disableIntegrityChecks(true); } catch (e) { console.error(e); }
      try { window.core.connect(TARGET); } catch (e) { console.error(e); }
    } else if (tries > 150) { clearInterval(t); }
  }, 300);
})();
`;
}

function page(req, full, q) {
  const b = baseOf(req);
  const target = b.ws + '/' + q;
  const online = [...clients].filter((c) => c.ready).length;
  const head = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(CFG.name)}</title>
<style>
:root{--bg:#0f1117;--card:#181b24;--tx:#e8eaf0;--mut:#8b91a3;--ac:#4ade80;--bd:#272b38}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;justify-content:center;padding:32px 16px}
main{width:100%;max-width:620px}
h1{margin:0 0 4px;font-size:28px}
.sub{color:var(--mut);margin:0 0 24px}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--ac);margin-right:6px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:20px;margin-bottom:16px}
.card h2{margin:0 0 10px;font-size:17px}
ol{margin:0;padding-left:20px}li{margin:6px 0}
a.btn,button{display:inline-block;background:var(--ac);color:#06210f;font-weight:600;border:0;border-radius:10px;padding:11px 18px;font-size:15px;text-decoration:none;cursor:pointer}
button.sec{background:#262b3a;color:var(--tx)}
code{display:block;background:#0b0d12;border:1px solid var(--bd);border-radius:8px;padding:10px 12px;margin:10px 0;overflow-x:auto;font-size:13px;white-space:nowrap}
.mut{color:var(--mut);font-size:14px}
</style></head><body><main>
<h1>${esc(CFG.name)}</h1>
<p class="sub"><span class="dot"></span>Servidor encendido &middot; ${online} jugador${online === 1 ? '' : 'es'} conectado${online === 1 ? '' : 's'}</p>`;
  if (!full) return head + `<div class="card"><p class="mut" style="margin:0">Servidor privado. Usa el link con tu clave para ver las instrucciones.</p></div></main></body></html>`;
  const script = b.http + '/agar.user.js' + q;
  const cmd = `core.connect(${JSON.stringify(target)})`;
  return head + `
<div class="card"><h2>Entrar (una sola vez)</h2>
<ol>
<li>Instala la extension <b>Tampermonkey</b> en tu navegador (Chrome, Edge, Firefox, Opera, Brave...).</li>
<li>Pulsa este boton y confirma la instalacion del script:<br><br><a class="btn" href="${esc(script)}">Instalar script</a></li>
<li>Abre <b>agar.io</b>. Se conecta solo a este servidor. Pon tu nombre y dale a jugar.</li>
</ol></div>
<div class="card"><h2>Sin instalar nada</h2>
<p class="mut" style="margin-top:0">Abre agar.io, pulsa F12, ve a <b>Consola</b>, pega esto y dale a Enter (hay que repetirlo cada vez que recargues):</p>
<code id="cmd">${esc(cmd)}</code>
<button class="sec" onclick="navigator.clipboard.writeText(document.getElementById('cmd').textContent).then(function(){this.textContent='Copiado'}.bind(this))">Copiar comando</button>
</div>
<p class="mut">No hace falta iniciar sesion. Comparte este mismo link solo con tus amigos: incluye la clave.</p>
</main></body></html>`;
}

const handler = (req, res) => {
  const u = parseUrl(req.url);
  const send = (code, type, body) => { res.writeHead(code, { 'content-type': type + '; charset=utf-8', 'cache-control': 'no-store' }); res.end(body); };
  if (u.pathname === '/health') return send(200, 'text/plain', 'ok\n');
  const ok = !CFG.password || (u.searchParams.get('key') !== null && safeEq(u.searchParams.get('key'), CFG.password));
  if (u.pathname === '/agar.user.js') return ok ? send(200, 'text/javascript', userscript(req)) : send(403, 'text/plain', 'forbidden\n');
  if (u.pathname === '/') {
    const q = CFG.password ? '?key=' + encodeURIComponent(CFG.password) : '';
    return send(200, 'text/html', page(req, ok, q));
  }
  send(404, 'text/plain', 'not found\n');
};

//SERVER
const perIp = new Map();
function onUpgrade(req, sock) {
  const key = req.headers['sec-websocket-key'];
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || sock.remoteAddress || '').split(',')[0].trim();
  const n = perIp.get(ip) || 0;
  if (!key || clients.size >= CFG.maxClients || n >= CFG.maxPerIp) { sock.destroy(); return; }
  if (!hasAccess(parseUrl(req.url))) {
    sock.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    sock.destroy();
    return;
  }
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
    console.log(`[-] ${ip} disconnected (${clients.size} online)`);
  };
}

const tls = CFG.cert && CFG.key;
const server = tls ? https.createServer({ cert: fs.readFileSync(CFG.cert), key: fs.readFileSync(CFG.key) }, handler) : http.createServer(handler);
server.on('upgrade', onUpgrade);
server.listen(CFG.port, CFG.host, () => {
  console.log(`${CFG.name} listening on ${tls ? 'wss' : 'ws'}://${CFG.host}:${CFG.port}  (bots: ${CFG.bots}, password: ${CFG.password ? 'on' : 'off'})`);
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
