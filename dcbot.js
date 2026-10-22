// Eigener Discord-Bot (offizielle Bot-API, kein Account-Token): sieht in Sprachkanälen Kamera, Stream, Stumm/Taub
// und auch private Kanäle, in denen der Bot Leserechte hat. der Nutzer legt ihn einmal an und lädt ihn auf seine Server ein.
const WebSocket = require("ws");

const GATEWAY = process.env.JARVIS_DC_GATEWAY || "wss://gateway.discord.gg/?v=10&encoding=json"; // Umgebungsvariable nur für Tests
const INTENTS = 1 | 128; // GUILDS + GUILD_VOICE_STATES, beide ohne Freischaltung im Portal

let appId = "", ws = null, token = "", hb = null, seq = null, retry = 0, retryT = null, onChange = () => {}, status = "aus";
const guilds = new Map(); // id -> { id, name, channels: Map(id -> {name, pos, parent}), voice: Map(userId -> state) }

function avatarUrl(u, gid, member) {
  if (member?.avatar) return `https://cdn.discordapp.com/guilds/${gid}/users/${u.id}/avatars/${member.avatar}.png?size=64`;
  return u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : "";
}
function person(gid, vs, member) {
  const u = member?.user || vs.member?.user || {};
  const m = member || vs.member || {};
  return { id: vs.user_id, name: m.nick || u.global_name || u.username || "?", user: u.username || "", avatar: avatarUrl({ id: vs.user_id, avatar: u.avatar }, gid, m),
    video: !!vs.self_video, stream: !!vs.self_stream, mute: !!(vs.self_mute || vs.mute), deaf: !!(vs.self_deaf || vs.deaf), bot: !!u.bot };
}
function setVoice(g, vs, member) {
  if (!vs.channel_id) { g.voice.delete(vs.user_id); return; }
  const old = g.voice.get(vs.user_id);
  const p = person(g.id, vs, member || vs.member);
  if (old && p.name === "?") { p.name = old.name; p.user = old.user; p.avatar = old.avatar; }
  g.voice.set(vs.user_id, { ...p, ch: vs.channel_id });
}

// Was die Freundesliste braucht: je Server die Sprachkanäle mit Leuten, sortiert wie in Discord
function snapshot() {
  const out = [];
  for (const g of guilds.values()) {
    const byCh = new Map();
    for (const v of g.voice.values()) { if (v.bot) continue; if (!byCh.has(v.ch)) byCh.set(v.ch, []); byCh.get(v.ch).push(v); }
    const ch = [...byCh].map(([id, people]) => ({ id, name: g.channels.get(id)?.name || "Sprachkanal", pos: g.channels.get(id)?.pos ?? 0, people: people.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.pos - b.pos);
    out.push({ id: g.id, name: g.name, ch });
  }
  return { status, invite: invite(), guilds: out };
}
// Einladungslink: Die Bot-ID steckt im ersten Teil des Tokens. Rechte: „Kanäle ansehen“ (1024) und „Mitglieder verschieben“ (16777216, nur fürs Beitreten), kein Admin
function invite() {
  try { const id = Buffer.from(token.split(".")[0], "base64").toString(); return /^\d{15,22}$/.test(id) ? `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot&permissions=16778240` : ""; } catch { return ""; }
}
const changed = () => { try { onChange(snapshot()); } catch {} };

function send(op, d) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op, d })); }

function connect() {
  clearTimeout(retryT); if (!token) return;
  const sock = ws = new WebSocket(GATEWAY);
  ws.on("message", (raw) => {
    let p; try { p = JSON.parse(raw); } catch { return; }
    if (p.s != null) seq = p.s;
    if (p.op === 10) { // Hello: Herzschlag starten, anmelden
      clearInterval(hb); hb = setInterval(() => send(1, seq), p.d.heartbeat_interval);
      send(2, { token, intents: INTENTS, properties: { os: "windows", browser: "jarvis", device: "jarvis" } });
    } else if (p.op === 1) send(1, seq);
    else if (p.op === 7 || p.op === 9) ws.close(); // Discord will Neuverbindung
    else if (p.op === 0) dispatch(p.t, p.d);
  });
  ws.on("close", (code) => {
    if (sock !== ws) return; // alte Verbindung nach Neustart oder Stopp
    clearInterval(hb); ws = null;
    // 4004 = falscher Token, 4013/4014 = Intents: dann nicht endlos weiterprobieren
    if ([4004, 4010, 4011, 4012, 4013, 4014].includes(code)) { status = code === 4004 ? "Token ungültig" : "Discord lehnt ab (" + code + ")"; changed(); return; }
    if (!token) return;
    status = "verbinde neu…"; changed();
    retryT = setTimeout(connect, Math.min(60000, 2000 * 2 ** retry++));
  });
  ws.on("error", () => {});
}

function dispatch(t, d) {
  if (t === "READY") { appId = d.application?.id || d.user?.id || ""; retry = 0; status = "verbunden als " + (d.user?.username || "Bot"); guilds.clear(); changed(); }
  else if (t === "GUILD_CREATE") {
    if (d.unavailable) return;
    const g = { id: d.id, name: d.name, channels: new Map(), voice: new Map() };
    for (const c of d.channels || []) if (c.type === 2 || c.type === 13) g.channels.set(c.id, { name: c.name, pos: c.position ?? 0, parent: c.parent_id });
    // Bei großen Servern schickt Discord in members genau die Leute, die gerade im Sprachkanal sind
    const mem = new Map((d.members || []).map((m) => [m.user?.id, m]));
    for (const vs of d.voice_states || []) setVoice(g, vs, mem.get(vs.user_id));
    guilds.set(d.id, g); changed();
  } else if (t === "GUILD_DELETE") { guilds.delete(d.id); changed(); }
  else if (t === "GUILD_UPDATE") { const g = guilds.get(d.id); if (g) { g.name = d.name; changed(); } }
  else if (t === "CHANNEL_CREATE" || t === "CHANNEL_UPDATE") {
    const g = guilds.get(d.guild_id); if (g && (d.type === 2 || d.type === 13)) { g.channels.set(d.id, { name: d.name, pos: d.position ?? 0, parent: d.parent_id }); changed(); }
  } else if (t === "CHANNEL_DELETE") { const g = guilds.get(d.guild_id); if (g) { g.channels.delete(d.id); changed(); } }
  else if (t === "VOICE_STATE_UPDATE") { const g = guilds.get(d.guild_id); if (g) { setVoice(g, d); changed(); } }
}

function start(tok, cb) {
  if (cb) onChange = cb;
  tok = String(tok || "").trim().replace(/^Bot\s+/i, "");
  if (tok === token && ws) return;
  stop(); token = tok;
  if (!token) { status = "aus"; changed(); return; }
  status = "verbinde…"; retry = 0; changed(); connect();
}
function stop() {
  token = ""; clearTimeout(retryT); clearInterval(hb);
  if (ws) { try { ws.close(); } catch {} ws = null; }
  guilds.clear();
}

// Beitreten ohne Discord-Fenster: Der Bot verschiebt den Nutzer, aber nur wenn er schon in irgendeinem Sprachkanal sitzt
async function move(gid, cid, myName, norm) {
  if (!token) return { ok: false, reason: "Kein Discord-Bot eingerichtet, Discord öffnet sich." };
  const g = guilds.get(String(gid)); if (!g) return { ok: false, reason: "Der Bot ist nicht auf diesem Server, Discord öffnet sich." };
  const me = norm(myName); if (!me) return { ok: false, reason: "Dein Discord-Name fehlt in den Einstellungen (Rechtsklick auf dich in der Liste). Discord öffnet sich." };
  const mine = [...g.voice.values()].find((v) => norm(v.user) === me || norm(v.name) === me);
  if (!mine) return { ok: false, reason: "nicht in Sprache" };
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${g.id}/members/${mine.id}`, { method: "PATCH",
      headers: { Authorization: "Bot " + token, "Content-Type": "application/json" }, body: JSON.stringify({ channel_id: String(cid) }) });
    if (r.ok) return { ok: true };
    return { ok: false, reason: r.status === 403 ? "Dem Bot fehlt das Recht „Mitglieder verschieben“. Bot neu einladen." : "Discord lehnt ab (" + r.status + ")" };
  } catch (e) { return { ok: false, reason: "Netzwerkfehler" }; }
}

// Kurze Nachricht an eine Person: Absender ist immer der Bot (die offizielle API erlaubt keine Nachrichten im Namen des Nutzers)
async function dm(uid, text) {
  if (!token) return { ok: false, reason: "Kein Discord-Bot eingerichtet." };
  const H = { Authorization: "Bot " + token, "Content-Type": "application/json" };
  try {
    const c = await fetch("https://discord.com/api/v10/users/@me/channels", { method: "POST", headers: H, body: JSON.stringify({ recipient_id: String(uid) }) });
    if (!c.ok) return { ok: false, reason: "Discord lehnt ab (" + c.status + ")" };
    const ch = await c.json();
    const r = await fetch(`https://discord.com/api/v10/channels/${ch.id}/messages`, { method: "POST", headers: H, body: JSON.stringify({ content: String(text).slice(0, 1800), allowed_mentions: { parse: [] } }) });
    if (r.ok) return { ok: true };
    return { ok: false, reason: r.status === 403 ? "Die Person erlaubt keine Nachrichten von Bots (Datenschutz-Einstellung)." : "Discord lehnt ab (" + r.status + ")" };
  } catch (e) { return { ok: false, reason: "Netzwerkfehler" }; }
}

module.exports = { start, stop, snapshot, move, dm, appId: () => appId };
