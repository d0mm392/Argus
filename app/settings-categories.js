"use strict";
// Reiter der Einstellungen. Jeder Abschnitt (h4) trägt seinen Reiter in data-tab; die Reihenfolge der Abschnitte steht in index.html.
// Neue Einstellungen: in den passenden Abschnitt schreiben, nicht einen neuen Reiter anlegen.
window.argusSettingsCategories = {
  order: ["Allgemein", "Seiten und Panel", "Kugel", "Aussehen", "KI und Stimme", "Freunde und Medien", "Mining", "Trading und Smart Home", "System"],
  section(title, tab) { return this.order.includes(tab) ? tab : "System"; }
};
