// Liest über Discords lokale Schnittstelle (Named Pipe discord-ipc-N), wer in der Discord-App auf diesem PC angemeldet ist.
// Der Handshake mit einer gültigen Anwendungs-ID liefert im READY-Ereignis den Benutzer; es wird nichts gesendet außer dem Handshake.
const net = require("net");

function frame(op, obj) { const j = Buffer.from(JSON.stringify(obj)); const h = Buffer.alloc(8); h.writeInt32LE(op, 0); h.writeInt32LE(j.length, 4); return Buffer.concat([h, j]); }

function tryPipe(n, clientId) {
  return new Promise((resolve) => {
    const path = process.platform === "win32" ? `\\\\?\\pipe\\discord-ipc-${n}` : `${process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || "/tmp"}/discord-ipc-${n}`;
    const s = net.createConnection(path); let buf = Buffer.alloc(0), done = false;
    const end = (v) => { if (done) return; done = true; clearTimeout(t); try { s.destroy(); } catch {} resolve(v); };
    const t = setTimeout(() => end(null), 3000);
    s.on("error", () => end(null)); s.on("close", () => end(null));
    s.on("connect", () => s.write(frame(0, { v: 1, client_id: String(clientId) })));
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 8) {
        const len = buf.readInt32LE(4); if (buf.length < 8 + len) return;
        let m = null; try { m = JSON.parse(buf.subarray(8, 8 + len).toString()); } catch {}
        buf = buf.subarray(8 + len);
        if (m?.evt === "READY" && m.data?.user) return end(m.data.user);
        if (m?.evt === "ERROR") return end(null);
      }
    });
  });
}

// Liefert { id, username, name } oder null (Discord nicht offen oder Anwendungs-ID ungültig)
async function detectSelf(clientId) {
  if (!clientId) return null;
  for (let n = 0; n < 10; n++) {
    const u = await tryPipe(n, clientId);
    if (u?.username) return { id: u.id, username: u.username, name: u.global_name || u.username };
  }
  return null;
}
module.exports = { detectSelf };
