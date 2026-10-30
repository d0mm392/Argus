"use strict";
window.argusSettingsCategories = {
  order: ["Allgemein", "Aussehen", "KI", "Gaming und Discord", "Mining", "Integrationen", "Datenschutz", "Erweitert"],
  section(title, former) {
    if (["Updates", "Über dich", "Sprache und Unterstützung", "Seiten", "Eigene Seiten", "Notizblock", "Wie gemeldet wird"].includes(title)) return "Allgemein";
    if (["Gedächtnis und Dateien", "Fehlerberichte", "Meine Berichte", "Einstellungen sichern"].includes(title)) return "Datenschutz";
    if (["Aussparung (Popups anderer Programme)", "Temperaturmessung", "Ruhiges Design (Test)", "System"].includes(title)) return "Erweitert";
    if (title === "Grafik") return "Aussehen";
    if (["Steam", "Discord", "Freundesliste neben der Kugel", "Gaming-Seite"].includes(title)) return "Gaming und Discord";
    if (["Mining-Seite", "Täglicher Miner-Report", "Warnschwellen", "Was gemeldet wird"].includes(title)) return "Mining";
    return ({ "Kugel und Farbe": "Aussehen", "Aussehen": "Aussehen", "Panel und Medien": "Integrationen", "Seiten": "Allgemein", "Freunde": "Gaming und Discord", "Mining": "Mining", "Smart Home": "Integrationen", "Stimme und KI": "KI", "Benachrichtigungen": "Allgemein", "System": "Erweitert", "Design-Test": "Erweitert", "Fehlerberichte": "Datenschutz", "Trading": "Integrationen" })[former] || former || "Erweitert";
  }
};
