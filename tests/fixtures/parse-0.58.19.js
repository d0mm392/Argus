// Referenz: parse() aus Argus 0.58.19 (selfimprove.js:20-42, Commit afe5cd7), unveraendert; offer als Parameter statt Modulzustand
module.exports = function parseOld(text, prev = "", offer = null) {
function parse(text, prev = "") {
  const t = text.trim().replace(/[.!]+$/, "").replace(/^(jarvis|claude)[\s,]+/i, "");
  if (/^(mach|nimm)\w*\s+(die\s+)?letzte\s+(verbesserung|änderung)\s+(rückgängig|zurück)/i.test(t)) return { kind: "undo" };
  if (offer && /^(ja[\s,]+)?(übernehm|übernimm|annehm|einspiel)\w*(\s+(es|das|die änderung))?$/i.test(t)) return { kind: "apply" };
  if (offer && /^(nein[\s,]+)?(verwirf|verwerf|abbrech|lösch)\w*(\s+(es|das|die änderung))?$/i.test(t)) return { kind: "discard" };
  let m;
  // "Prüf dich auf Fehler", "Checkt euch gegenseitig ab": Claude prüft den eigenen Code und schlägt Korrekturen vor
  if (/^(?:prüf|pruef|check|test|kontrollier)\w*\s+(?:dich|euch)\b/i.test(t) || /\b(?:checkt|prüft|testet)\s+euch\b/i.test(t))
    return { kind: "improve", wish: "Prüfe deinen eigenen Code gründlich auf Fehler, Absturzrisiken und Ungereimtheiten und behebe, was du findest. Nichts umbauen, was funktioniert." };
  // Frage nach der Selbstverbesserung ohne konkreten Wunsch: erklären, wie es geht
  if (/selbst ?verbesser|an dir (selbst )?arbeiten|dich selbst (verbessern|ändern)/i.test(t) && !/:/.test(t)) return { kind: "improve", wish: "" };
  // Der Auftrag darf auch mitten im Text stehen ("Gut. Zudem verbessere dich: ..."), auch über mehrere Absätze
  if ((m = /(?:^|[\s.!?,;])(?:verbesser|optimier|änder|erweiter|überarbeit)\w*\s+dich(?:\s+selbst)?[\s:,]*([\s\S]*)$/i.exec(t)) && m[1].trim()) return { kind: "improve", wish: m[1].trim() };
  if ((m = /(?:^|[\s.!?,;])arbeite?\s+an\s+dir(?:\s+selbst)?[\s:,]*([\s\S]*)$/i.exec(t)) && m[1].trim()) return { kind: "improve", wish: m[1].trim() };
  if ((m = /^(?:verbesser|optimier|änder|erweiter|überarbeit)\w*\s+dich(?:\s+selbst)?$|^arbeite?\s+an\s+dir(?:\s+selbst)?$/i.exec(t))) return { kind: "improve", wish: "" };
  // "Führ es durch", "Mach das", "Leg los": der Wunsch aus der vorherigen Nachricht
  if (prev && /(?:^|[\s.!?,;])(?:führ|fuehr|mach|start|leg|setz|bau)\w*\s+(?:es|das|den auftrag|die verbesserung|los|um)\b/i.test(t)) {
    const p = parse(prev);
    if (p && p.kind === "improve" && p.wish) return p;
  }
  if ((m = /^bau\w*\s+(?:dir|bei dir|in dich)\s+(.+?)(?:\s+ein)?$/i.exec(t))) return { kind: "improve", wish: m[1] + " einbauen" };
  return null;
}
return parse(text, prev);
};
