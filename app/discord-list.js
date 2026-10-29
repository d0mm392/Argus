/* Bot, widget and StreamKit supply voice only. Personal friends require the user's SDK OAuth connection. */
(function (root) {
  "use strict";
  const voiceMembers = (members) => (members || []).filter((m) => m && m.voice);
  const discordId = person => {
    const id = String(person?.id || "");
    return /^\d{15,22}$/.test(id) ? id : /\/(?:avatars|users)\/(\d{15,22})\//.exec(person?.avatar || "")?.[1] || "";
  };
  const capability = Object.freeze({ available: false,
    reason: "Verbinde dein Discord-Konto für deine persönliche Freundesliste. Bot und Serverliste sind davon unabhängig; Sprachkanal-Teilnehmer bleiben sichtbar." });
  const additionalFriends=(seen,friends,{enabled=false,markedOnly=false,marked=[]}={})=>{
    if(!enabled)return [];const ids=new Set(seen),result=[];
    for(const friend of friends||[]){const id=discordId(friend);if(!friend.discordFriend||!id||ids.has(id)||![0,3,4].includes(friend.status)||markedOnly&&!marked.includes("id:"+id))continue;ids.add(id);result.push(friend);}
    return result;
  };
  const api = Object.freeze({ voiceMembers, discordId, capability, additionalFriends });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.argusDiscordList = api;
})(globalThis);
