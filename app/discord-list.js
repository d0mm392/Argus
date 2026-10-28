/* Server membership is not a personal friendship. No relationships source is
 * authorized in this build; bot, widget and StreamKit data supply voice only. */
(function (root) {
  "use strict";
  const voiceMembers = (members) => (members || []).filter((m) => m && m.voice);
  const discordId = person => {
    const id = String(person?.id || "");
    return /^\d{15,22}$/.test(id) ? id : /\/(?:avatars|users)\/(\d{15,22})\//.exec(person?.avatar || "")?.[1] || "";
  };
  const capability = Object.freeze({ available: false,
    reason: "Nicht verfügbar: Argus hat keinen freigegebenen Discord-Zugriff auf deine persönliche Freundesliste. Bot und Serverliste reichen dafür nicht aus. Sprachkanal-Teilnehmer bleiben sichtbar." });
  const api = Object.freeze({ voiceMembers, discordId, capability });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.argusDiscordList = api;
})(globalThis);
