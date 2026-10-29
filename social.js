// Wer ist online: Steam-Freunde über die offizielle Steam-Web-API (eigener kostenloser Schlüssel),
// Discord hier über das öffentliche Server-Widget (nur Sprachkanäle). Persönliche Freunde: separater Social-SDK-Kontodienst.
const UA = { "User-Agent": "Argus-Desktop", Accept: "application/json" };
async function get(url, ms = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (r.status === 401 || r.status === 403) throw new Error("Zugriff verweigert (" + r.status + ")");
    if (!r.ok) throw new Error("Antwort " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ---------- Steam ----------
const STATE = ["offline", "online", "beschäftigt", "abwesend", "schläft", "tauschbereit", "spielbereit"];
const API = "https://api.steampowered.com/ISteamUser";
const idCache = new Map();
// Akzeptiert SteamID64, Profil-Link (…/profiles/765… oder …/id/name) oder den Profilnamen
async function resolveId(key, input) {
  const s = String(input || "").trim().replace(/\/+$/, "");
  let m;
  if ((m = /(\d{17})$/.exec(s))) return m[1];
  const name = (m = /\/id\/([^/]+)$/.exec(s)) ? m[1] : s;
  if (!name) throw new Error("Keine Steam-ID eingetragen");
  if (idCache.has(name)) return idCache.get(name);
  const j = await get(`${API}/ResolveVanityURL/v1/?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(name)}`);
  if (j?.response?.success !== 1) throw new Error(`Steam-Profil „${name}“ nicht gefunden`);
  idCache.set(name, j.response.steamid);
  return j.response.steamid;
}
async function steam(key, input) {
  if (!key) return { error: "Kein Steam-API-Schlüssel eingetragen" };
  try {
    const me = await resolveId(key, input);
    let friends = [];
    try { friends = (await get(`${API}/GetFriendList/v1/?key=${encodeURIComponent(key)}&steamid=${me}&relationship=friend`))?.friendslist?.friends?.map((f) => f.steamid) || []; }
    catch (e) { if (/verweigert/.test(e.message)) throw new Error("Freundesliste ist privat. Steam → Profil bearbeiten → Privatsphäre → Freundesliste: Öffentlich"); throw e; }
    const ids = [me, ...friends], players = [];
    for (let i = 0; i < ids.length; i += 100) {
      const j = await get(`${API}/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${ids.slice(i, i + 100).join(",")}`);
      players.push(...(j?.response?.players || []));
    }
    const conv = (p) => ({ name: p.personaname, state: STATE[p.personastate] || "online", game: p.gameextrainfo || "", url: p.profileurl, avatar: p.avatar, sid: p.steamid });
    const self = players.find((p) => p.steamid === me);
    const online = players.filter((p) => p.steamid !== me && p.personastate > 0).map(conv)
      .sort((a, b) => (b.game ? 1 : 0) - (a.game ? 1 : 0) || a.name.localeCompare(b.name));
    return { me: self ? conv(self) : null, online, total: friends.length, ts: Date.now() };
  } catch (e) { return { error: "Steam: " + (e.name === "AbortError" ? "keine Antwort" : e.message), ts: Date.now() }; }
}

// ---------- Discord (Server-Widget) ----------
const STATUS = { online: "online", idle: "abwesend", dnd: "bitte nicht stören" };
async function discordServer(id) {
  try {
    const j = await get(`https://discord.com/api/guilds/${encodeURIComponent(id)}/widget.json`);
    const chan = new Map((j.channels || []).map((c) => [c.id, c.name]));
    const online = (j.members || []).map((m) => ({ name: m.username, state: STATUS[m.status] || m.status, game: m.game?.name || "", voice: m.channel_id ? chan.get(m.channel_id) || "Sprachkanal" : "", voiceId: m.channel_id || "", avatar: m.avatar_url, mute: !!(m.self_mute || m.mute || m.suppress), deaf: !!(m.self_deaf || m.deaf) }))
      .sort((a, b) => (b.voice ? 1 : 0) - (a.voice ? 1 : 0) || (b.game ? 1 : 0) - (a.game ? 1 : 0) || a.name.localeCompare(b.name));
    return { id, server: j.name, online, count: j.presence_count ?? online.length, url: j.instant_invite || `https://discord.com/channels/${id}` };
  } catch (e) {
    return { id, error: /verweigert|403/.test(e.message) ? `Server ${id}: Widget ist aus (Servereinstellungen → Widget → Server-Widget aktivieren)` : `Server ${id}: ${e.name === "AbortError" ? "keine Antwort" : e.message}` };
  }
}
async function discord(ids) {
  const list = String(ids || "").split(/[\s,;]+/).map((x) => (/(\d{15,22})/.exec(x) || [])[1]).filter(Boolean);
  if (!list.length) return { servers: [], error: "Keine Discord-Server-ID eingetragen" };
  return { servers: await Promise.all(list.map(discordServer)), ts: Date.now() };
}

module.exports = { steam, discord, resolveId };
