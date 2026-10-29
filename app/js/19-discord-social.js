"use strict";
(()=>{
 const messages={cancelled:"Anmeldung abgebrochen. Du kannst erneut verbinden.",expired:"Anmeldung abgelaufen. Bitte erneut verbinden.","connection-error":"Discord ist derzeit nicht erreichbar. Bitte Verbindung prüfen und erneut verbinden.","authorization-timeout":"Die Anmeldung hat zu lange gedauert. Bitte erneut verbinden.","secure-storage-unavailable":"Sicherer lokaler Kontospeicher ist nicht verfügbar. Es werden keine Tokens im Klartext gespeichert.","runtime-unavailable":"Die Discord-Komponente fehlt für dieses System. Bitte eine vollständige unterstützte Argus-Version installieren.","runtime-or-storage-error":"Die Discord-Komponente oder der lokale Kontospeicher ist nicht verfügbar.","stored-login-unavailable":"Die gespeicherte Anmeldung konnte nicht geöffnet werden. Bitte erneut verbinden.","helper-or-storage-error":"Discord-Verbindung konnte nicht sicher gespeichert oder gelesen werden. Bitte erneut verbinden.","credential-delete-failed":"Lokale Anmeldedaten konnten nicht entfernt werden. Bitte Argus neu starten und erneut trennen.","revoke-failed":"Lokal getrennt. Der Widerruf bei Discord war nicht erreichbar; entferne Argus gegebenenfalls unter Discord → Autorisierte Apps."};
 messages["authorization-error"]="Discord hat die Anmeldung nicht freigegeben. Bitte erneut verbinden und den Berechtigungsdialog prüfen. Bei wiederholtem Fehler die Argus-Hilfe verwenden.";
 const show=state=>{
  dcSocial=state&&typeof state.status==="string"?state:{available:false,status:"disconnected",account:null,friends:[],error:"runtime-unavailable"};
  const connected=dcSocial.status==="connected",pending=["authorizing","connecting","disconnecting"].includes(dcSocial.status);
  $("dcSocialConnect").disabled=connected||pending||!dcSocial.available;
  $("dcSocialCancel").hidden=!["authorizing","connecting"].includes(dcSocial.status);
  $("dcSocialDisconnect").disabled=dcSocial.status==="disconnecting"||!(connected||dcSocial.status==="error");
  $("setDcOnline").disabled=$("setDcMarked").disabled=!connected;
  $("dcSocialStatus").textContent=messages[dcSocial.error]||(connected?"Verbunden als "+dcSocial.account.name:({authorizing:"Warte auf deine Discord-Einwilligung …",connecting:"Discord wird verbunden …",disconnecting:"Konto wird getrennt …"})[dcSocial.status]||"Nicht verbunden");
  $("dcFriendsUnavailable").textContent=connected?"Markierungen beschränken ausschließlich die zusätzlichen Freunde. Sprachkanal-Teilnehmer bleiben erhalten.":window.argusDiscordList.capability.reason;
  friendsSig="";buildFriends();
 };
 const action=method=>async()=>{try{show(await window.jarvis[method]())}catch{show({available:true,status:"error",account:null,friends:[],error:"connection-error"})}};
 $("dcSocialConnect").addEventListener("click",action("discordSocialConnect"));
 $("dcSocialCancel").addEventListener("click",action("discordSocialCancel"));
 $("dcSocialDisconnect").addEventListener("click",action("discordSocialDisconnect"));
 window.jarvis.onDiscordSocial?.(show);window.jarvis.discordSocialState().then(show).catch(()=>show(null));
})();
