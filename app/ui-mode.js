"use strict";
// Oberfläche: "klassisch" (Standard) oder "apple" (Apple-Modus). Reines Node, damit es ohne Electron testbar ist.
// Startsicherung: Vor einem Start im Apple-Modus wird ui-start.json angelegt und nach der Bereitschaftsmeldung der Oberfläche gelöscht.
// Liegt die Datei beim nächsten Start noch da, ist der letzte Apple-Start gescheitert: dieser Start läuft in Klassisch und die
// Einstellung wird auf Klassisch zurückgesetzt. Für Klassisch gibt es keine Startsicherung, also auch keine Neustartschleife.
const fs = require("fs");
const path = require("path");

const MODES = ["klassisch", "apple"];
const normalize = (mode) => (mode === "apple" ? "apple" : "klassisch");
const markerPath = (userData) => path.join(userData, "ui-start.json");

// Entscheidet beim Programmstart. Ändert nur die Startsicherung, nie andere Dateien.
function decideStart(userData, configured, now = Date.now()) {
  const wanted = normalize(configured), marker = markerPath(userData);
  let pending = null, exists = false;
  try { const raw = fs.readFileSync(marker, "utf8"); exists = true; pending = JSON.parse(raw); }
  catch (e) { if (e && e.code !== "ENOENT") exists = true; } // nur „nicht vorhanden“ gilt als keine Startsicherung; Lesefehler zählen als unlesbar
  if (exists) { try { fs.rmSync(marker, { force: true }); } catch {} } // jede vorhandene Startsicherung wird hier aufgebraucht (nicht rekursiv: ein Ordner bleibt und führt zum Rückfall)
  // Gescheiterter Apple-Start; eine unlesbare Startsicherung zählt bei eingestelltem Apple-Modus ebenfalls als gescheitert
  if ((pending && pending.mode === "apple") || (exists && !pending && wanted === "apple")) {
    return { mode: "klassisch", fallback: true, failedAt: (pending && pending.at) || null };
  }
  if (wanted === "apple") {
    if (exists && fs.existsSync(marker)) return { mode: "klassisch", fallback: true, failedAt: null, reason: "Startsicherung nicht entfernbar" };
    try { fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(marker, JSON.stringify({ mode: "apple", at: new Date(now).toISOString() })); }
    catch { return { mode: "klassisch", fallback: true, failedAt: null, reason: "Startsicherung nicht schreibbar" }; }
  }
  return { mode: wanted, fallback: false };
}
// Die Oberfläche ist geladen und meldet Bereitschaft: Startsicherung löschen
function confirmStart(userData) { try { fs.rmSync(markerPath(userData), { force: true }); return true; } catch { return false; } }
// Darf jetzt gewechselt werden? busy: Liste laufender Aktionen, die ein Neustart abbrechen würde
function switchCheck(target, current, busy) {
  if (!MODES.includes(target)) return { ok: false, text: "Unbekannte Oberfläche." };
  if (target === current) return { ok: false, text: "Diese Oberfläche ist bereits aktiv." };
  const running = (busy || []).filter(Boolean);
  if (running.length) return { ok: false, text: "Gerade läuft noch: " + running.join(", ") + ". Bitte danach erneut wechseln." };
  return { ok: true };
}
// Fügt beim Ausliefern von index.html das Merkmal der Oberfläche ein, damit vor dem ersten Zeichnen das richtige Aussehen gilt
function markHtml(html, mode) {
  const m = normalize(mode);
  return String(html).replace(/<html\b([^>]*)>/i, (all, attrs) => `<html${attrs.replace(/\sdata-ui="[^"]*"/i, "")} data-ui="${m}">`);
}
module.exports = { MODES, normalize, markerPath, decideStart, confirmStart, switchCheck, markHtml };
