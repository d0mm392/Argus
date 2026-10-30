// Werkzeuge für Claude Code: kleiner MCP-Server (stdio, JSON-RPC pro Zeile), den Claude Code selbst startet.
// Er reicht jeden Aufruf an den laufenden Argus weiter (lokaler HTTP-Server mit Zugangsschlüssel).
// Läuft als reines Node (Jarvis.exe mit ELECTRON_RUN_AS_NODE=1), ohne Fenster.
// Gedächtnis und Dateien gehen direkt über die Dateien, also auch aus Claude Desktop, wenn Argus gerade nicht läuft.
const http = require("http");
const memory = require("./memory.js");
const files = require("./files.js");

const PORT = Number(process.env.JARVIS_PORT), TOKEN = process.env.JARVIS_TOKEN || "";
const TOOLS = [
  { name: "lokale_ki", description: "Fragt die lokale KI auf dem PC des Nutzers (Strata, sonst eine lokale Ollama-KI). Läuft offline und kostenlos, die Daten verlassen den PC nicht. Gut für: zweite Meinung, Zusammenfassen langer Texte, Entwürfe, private Daten. Schwächer als du, prüfe das Ergebnis.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Die vollständige Aufgabe für die lokale KI, auf Deutsch" } }, required: ["prompt"] } },
  { name: "systemstatus", description: "Aktuelle Messwerte des Windows-PCs des Nutzers: CPU, RAM, Laufwerke, Netz, Temperaturen, Lüfter, Takt, Top-Prozesse, laufende Programme.",
    inputSchema: { type: "object", properties: {} } },
  { name: "oeffnen", description: "Öffnet auf dem PC des Nutzers ein Programm, eine Webseite, einen Ordner oder eine Datei oder sucht im Netz. Beispiele: \"Öffne Brave\", \"Öffne gamestar.de\", \"Such nach Antminer S21\", \"Öffne Downloads\".",
    inputSchema: { type: "object", properties: { befehl: { type: "string", description: "Der Befehl auf Deutsch, wie der Nutzer ihn sagen würde" } }, required: ["befehl"] } },
];
const q = (d) => ({ type: "object", properties: { suchbegriff: { type: "string", description: d } }, required: ["suchbegriff"] });
const LOCAL_TOOLS = [
  { name: "gedaechtnis_suchen", description: "Durchsucht Argus' Gedächtnis: alle früheren Gespräche mit dem Nutzer (Sprache und Text in der Argus-App) und alles, was er sich merken ließ. Nutze das, wenn der Nutzer sich auf etwas Früheres bezieht.",
    inputSchema: q("Stichwörter, z. B. \"S21 Container Temperatur\"") },
  { name: "gedaechtnis_verlauf", description: "Die Gespräche eines Zeitraums aus Argus' Gedächtnis, älteste zuerst.",
    inputSchema: { type: "object", properties: { wann: { type: "string", description: "\"heute\", \"gestern\", ein Datum JJJJ-MM-TT oder leer für die letzten Gespräche" } } } },
  { name: "gedaechtnis_merken", description: "Speichert eine Notiz dauerhaft in Argus' Gedächtnis. Nur nutzen, wenn der Nutzer darum bittet oder es eindeutig eine dauerhafte Information über den Nutzer ist.",
    inputSchema: { type: "object", properties: { notiz: { type: "string" } }, required: ["notiz"] } },
  { name: "strata_fragen", description: "Fragt Strata, die große lokale KI auf dem PC des Nutzers (127.0.0.1:8080, Qwen3.8-Flash-Next). Läuft offline und kostenlos, die Daten verlassen den PC nicht. Gut für: Zusammenfassen langer Texte, Entwürfe, Erstentwürfe, private Daten. Schwächer als du, prüfe das Ergebnis. Strata wird nicht automatisch gestartet (sie belegt rund 30 GB Arbeitsspeicher): läuft sie nicht, sagt das Werkzeug es.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Die vollständige Aufgabe für Strata, auf Deutsch" } }, required: ["prompt"] } },
  { name: "dateien_suchen", description: "Sucht Dateien und Ordner auf allen Laufwerken des PCs nach Namen. Mit inhalt=true stattdessen im Dateiinhalt (Windows-Suchindex, Benutzerordner). Gibt vollständige Pfade zurück.",
    inputSchema: { type: "object", properties: { suchbegriff: { type: "string" }, inhalt: { type: "boolean" } }, required: ["suchbegriff"] } },
  { name: "datei_lesen", description: "Liest eine Textdatei (bis 60 KB) oder listet einen Ordner auf dem PC des Nutzers auf. Nur lesen, nichts ändern.",
    inputSchema: { type: "object", properties: { pfad: { type: "string", description: "Vollständiger Pfad" } }, required: ["pfad"] } },
];
async function callLocal(name, a = {}) {
  try {
    if (name === "gedaechtnis_suchen") { const r = memory.search(a.suchbegriff, 10); return { ok: true, text: r.length ? r.join("\n\n") : "Dazu steht nichts im Gedächtnis." }; }
    if (name === "gedaechtnis_verlauf") { const r = memory.history(a.wann || "", 20); return { ok: true, text: r.length ? r.join("\n\n") : "Für diesen Zeitraum gibt es keine Gespräche." }; }
    if (name === "gedaechtnis_merken") return { ok: memory.remember(a.notiz), text: "Gemerkt." };
    if (name === "strata_fragen") {
      const base = String(process.env.JARVIS_STRATA_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
      const get = async (p, ms) => { try { const r = await fetch(base + p, { signal: AbortSignal.timeout(ms) }); return r.ok ? await r.json().catch(() => ({})) : null; } catch { return null; } };
      if (!(await get("/health", 2500))) return { ok: false, text: "Strata läuft gerade nicht. Der Nutzer startet sie in Argus mit dem Strata-Knopf (sie braucht rund 30 GB Arbeitsspeicher, darum wird sie nicht automatisch gestartet)." };
      const model = (await get("/v1/models", 2500))?.data?.[0]?.id;
      const r = await fetch(base + "/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(170000),
        body: JSON.stringify({ model: model || undefined, stream: false, max_tokens: 1200, temperature: 0.5, reasoning_effort: "none", messages: [{ role: "system", content: "Du bist Strata, die lokale KI auf diesem PC, und hilfst Claude. Antworte sachlich auf Deutsch." }, { role: "user", content: String(a.prompt || "") }] }) });
      if (!r.ok) return { ok: false, text: "Strata antwortet mit " + r.status };
      const t = String((await r.json()).choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
      return { ok: true, text: t || "(leer)" };
    }
    if (name === "dateien_suchen") {
      const r = a.inhalt ? await files.searchContent(a.suchbegriff, 20) : await files.search(a.suchbegriff, 20);
      return { ok: true, text: (r.length ? r.join("\n") : "Nichts gefunden.") + (!a.inhalt && !files.ready() ? "\n(Das Dateiverzeichnis wird noch aufgebaut, bisher nur der Benutzerordner durchsucht.)" : "") };
    }
    if (name === "datei_lesen") return { ok: true, text: files.read(String(a.pfad || "")) };
  } catch (e) { return { ok: false, text: "Fehler: " + (e.message || e) }; }
  return null;
}
// Ohne laufenden Argus (Claude Desktop) gibt es nur die Werkzeuge, die direkt auf Dateien arbeiten
const ALL = () => (PORT ? [...TOOLS, ...LOCAL_TOOLS] : LOCAL_TOOLS);

function callJarvis(tool, args) {
  return new Promise((resolve) => {
    const body = JSON.stringify(args || {});
    const req = http.request({ host: "127.0.0.1", port: PORT, path: "/api/tool/" + tool, method: "POST", timeout: 180000,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "X-Jarvis-Token": TOKEN } }, (res) => {
      let out = ""; res.setEncoding("utf8"); res.on("data", (c) => (out += c));
      res.on("end", () => resolve({ ok: res.statusCode === 200, text: out }));
    });
    req.on("error", (e) => resolve({ ok: false, text: "Argus nicht erreichbar: " + e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, text: "Zeitüberschreitung" }); });
    req.end(body);
  });
}

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
async function handle(m) {
  if (m.method === "initialize")
    return send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "argus", version: "1.0.0" } } });
  if (m.method === "tools/list") return send({ id: m.id, result: { tools: ALL() } });
  if (m.method === "tools/call") {
    const r = (await callLocal(m.params?.name, m.params?.arguments)) || (PORT ? await callJarvis(m.params?.name, m.params?.arguments) : { ok: false, text: "Dafür muss Argus laufen." });
    return send({ id: m.id, result: { content: [{ type: "text", text: r.text || "(leer)" }], isError: !r.ok } });
  }
  if (m.method === "ping") return send({ id: m.id, result: {} });
  if (m.id !== undefined) send({ id: m.id, error: { code: -32601, message: "Unbekannte Methode: " + m.method } });
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk; const lines = buf.split("\n"); buf = lines.pop();
  for (const line of lines) { if (!line.trim()) continue; let m; try { m = JSON.parse(line); } catch { continue; } const job = handle(m); open.add(job); job.finally(() => open.delete(job)); }
});
const open = new Set(); // laufende Aufrufe noch zu Ende bringen, wenn Claude die Verbindung schließt
process.stdin.on("end", () => Promise.allSettled([...open]).then(() => process.exit(0)));
