"use strict";
  // ---------- Freunde online neben der Kugel (Panel) ----------
  let ballLabels = "aktiv", bgShoot = 1, friendsSplit = false, friendsHold = 3, strataHas = false, friendsStill = true, dcJoinBot = true, micId = "", spkId = "", friendsEl2 = null, holdHinted = false;
  let friendsEl = null, friendsSig = "", live = { auth: false, ch: {} }, friendsFold = {}, myDc = "", extraVoice = [], bot = { status: "aus", guilds: [] }, dcIcons = true;
  let dcSocial = {status:"disconnected",account:null,friends:[]};
  const normDc = (n) => String(n || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
  function buildFriends() {
    if (!friendsEl) {
      friendsEl = document.createElement("div"); friendsEl.className = "friends off"; lblLayer.append(friendsEl);
      edgeResize(friendsEl, "f1", () => fgPos, () => placeGrips(fgPos, friendsEl.offsetWidth, friendsEl.offsetHeight));
      makeDraggable(friendsEl, () => "friends");
      // Strg + Mausrad oder gedrückt halten + Mausrad: Schrift größer/kleiner; sonst normal scrollen
      friendsEl.addEventListener("wheel", (e) => {
        e.stopPropagation();
        if (!e.ctrlKey && drag?.el !== friendsEl) return;
        e.preventDefault();
        friendsBox.scale = Math.max(0.7, Math.min(2, friendsBox.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); showPct?.(e, friendsBox.scale);
        applyFriendsBox(); saveFriendsBox();
      }, { passive: false });
      // Größe über die Ecke unten rechts: merken
      let rsT = null;
      new ResizeObserver(() => {
        if (friendsEl.classList.contains("off") || !friendsEl.style.width && !friendsEl.style.height) return;
        clearTimeout(rsT); rsT = setTimeout(() => { friendsBox.w = friendsEl.offsetWidth; friendsBox.h = friendsEl.offsetHeight; friendsEl.style.width = friendsEl.style.height = ""; applyFriendsBox(); saveFriendsBox(); }, 400);
      }).observe(friendsEl);
      applyFriendsBox();
    }
    if (!friendsEl2) {
      friendsEl2 = document.createElement("div"); friendsEl2.className = "friends f2 off"; lblLayer.append(friendsEl2);
      let rsT2 = null; // Größe über die Ecke unten rechts, eigene Größe für das Discord-Fenster
      new ResizeObserver(() => {
        if (friendsEl2.classList.contains("off") || !friendsEl2.style.width && !friendsEl2.style.height) return;
        clearTimeout(rsT2); rsT2 = setTimeout(() => { friendsBox.w2 = friendsEl2.offsetWidth; friendsBox.h2 = friendsEl2.offsetHeight; friendsEl2.style.width = friendsEl2.style.height = "";
          if (f2Res) { const c2 = cOf("friends2"), x2 = f2Res.x + friendsBox.w2 / 2 - c2.x, y2 = f2Res.y + friendsBox.h2 / 2 - c2.y; pins.friends2 = { a: Math.atan2(y2, x2), r: Math.max(0.2, Math.hypot(x2, y2) / SB) }; savePins(); f2Res = null; }
          applyFriendsBox(); saveFriendsBox(); }, 400);
      }).observe(friendsEl2);
      edgeResize(friendsEl2, "f2", () => f2Pos, () => placeGrips2(f2Pos, friendsEl2.offsetWidth, friendsEl2.offsetHeight));
      makeDraggable(friendsEl2, () => "friends2");
      friendsEl2.addEventListener("wheel", (e) => {
        e.stopPropagation();
        if (!e.ctrlKey && drag?.el !== friendsEl2) return;
        e.preventDefault();
        friendsBox.scale = Math.max(0.7, Math.min(2, friendsBox.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); showPct?.(e, friendsBox.scale);
        applyFriendsBox(); saveFriendsBox();
      }, { passive: false });
      applyFriendsBox();
    }
    const st = market?.steam, servers = (market?.discord?.servers || []).filter((x) => !x.error);
    // Wer spricht, ändert sich ständig: nur die Markierung umschalten, die Liste nicht neu bauen (sonst gehen Klicks verloren)
    // Discord meldet Sprecher nur für den Kanal, in dem der Nutzer selbst sitzt; in anderen Kanälen bliebe das Leuchten hängen
    const mine = Object.values(live.ch || {}).filter((l) => myDc && l.some((m) => normDc(m.name) === myDc));
    const talking = new Set(mine.flat().filter((m) => m.speaking).map((m) => m.name));
    const markTalk = () => { for (const el of [friendsEl, friendsEl2]) for (const d of el.querySelectorAll(".f[data-live]")) d.classList.toggle("speaking", talking.has(d.dataset.live)); };
    const liveSig = { auth: live.auth, ch: Object.fromEntries(Object.entries(live.ch || {}).map(([k, v]) => [k, v.map((m) => [m.name, m.avatar])])) };
    const sig = JSON.stringify([friendsSplit, myDc, extraVoice, dcIcons, bot.guilds, dcVoiceOnly, dcAlsoOnline, dcOnlyMarked, dcMarked, st?.online, servers.map((x) => [x.server, x.online]), liveSig, dcSocial]);
    if (sig === friendsSig) { markTalk(); return; } friendsSig = sig;
    const parts = [];
    const row = (p, sub, url) => {
      const d = document.createElement("div"); d.className = "f" + (p.voice ? " voice" : p.game ? " play" : "");
      let av; if (p.avatar && /^https:/.test(p.avatar)) { av = document.createElement("img"); av.src = p.avatar; av.referrerPolicy = "no-referrer"; av.alt = ""; av.onerror = () => av.replaceWith(document.createElement("i")); } else av = document.createElement("i");
      const b = document.createElement("b"); b.textContent = p.name; const sm = document.createElement("small"); sm.textContent = sub;
      d.append(av, b, sm); d.title = p.name + " · " + sub;
      if (!p.sid) d.dataset.dcn = normDc(p.name || "");
      if (!p.sid) d.dataset.dcid = window.argusDiscordList.discordId(p);
      if (p.sid) { d.addEventListener("click", (e) => { e.stopPropagation(); if (noClick) return; window.jarvis.openSteam(p.sid); notice(`Steam-Chat mit ${p.name} wird geöffnet …`); }); d.querySelector("small").textContent += " · Klick: Chat"; }
      else if (url) d.addEventListener("click", (e) => { e.stopPropagation(); if (noClick) return; window.jarvis.openUrl(url); });
      if (p.voice !== undefined) d.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); ctxMenu(e.clientX, e.clientY, p.name, [[(dcMarked.includes("id:" + d.dataset.dcid) || dcMarked.includes(normDc(p.name))) ? `„${p.name}“: Markierung entfernen` : `„${p.name}“ lokal markieren`, () => { const keys = [normDc(p.name), ...(d.dataset.dcid ? ["id:" + d.dataset.dcid] : [])], k = keys.at(-1); dcMarked = keys.some(key => dcMarked.includes(key)) ? dcMarked.filter(key => !keys.includes(key)) : [...dcMarked, k]; friendsSig = ""; buildFriends(); window.jarvis.setConfig({ dcMarked }); }], [`Das bin ich: „${p.name}“ als meinen Discord-Namen merken`, () => { window.jarvis.setConfig({ discordName: p.name }); myDc = normDc(p.name); friendsSig = ""; buildFriends(); notice(`Gemerkt: Du bist „${p.name}“ auf Discord. Das Overlay erscheint, wenn du im Sprachkanal sitzt.`); }], ["Abbrechen", null]]); });
      return d;
    };
    // Überschrift je Bereich (Steam, Discord-Server): Klick klappt den Bereich zu oder auf, wird gemerkt
    const head = (t, n) => {
      const h = document.createElement("h5"); h.innerHTML = "<span></span><span></span>"; h.dataset.sec = t;
      h.firstChild.textContent = (friendsFold[t] ? "▸ " : "▾ ") + t; h.lastChild.textContent = n; h.title = friendsFold[t] ? "Aufklappen" : "Einklappen";
      h.addEventListener("click", (e) => { e.stopPropagation(); if (noClick) return; friendsFold = { ...friendsFold, [t]: !friendsFold[t] }; if (!friendsFold[t]) delete friendsFold[t]; friendsSig = ""; buildFriends(); window.jarvis.setConfig({ friendsFold }); });
      return h;
    };
    const seenCh = new Set();
    // Mit eigenem Bot: alle Sprachkanäle inkl. private, dazu Kamera/Stream/Stumm
    const botPeople = new Map(); for (const g of bot.guilds) for (const c of g.ch) botPeople.set(c.id, c.people);
    function botGuild(parts, g, title) {
      const n = g.ch.reduce((k, c) => k + c.people.length, 0);
      parts.push(head(title.toUpperCase(), "🔊 " + n));
      if (!n) parts.push(Object.assign(document.createElement("div"), { className: "none", textContent: "Niemand im Sprachkanal" }));
      for (const c of g.ch) { voiceBlock(parts, c.name, g.id, c.id, c.people.map((p) => ({ ...p, voice: c.name, voiceId: c.id }))); seenCh.add(c.id); }
    }
    // kleine Symbole hinter dem Namen: Kamera, Bildschirm übertragen, stumm, taub
    // Symbole wie in Discord: Kamera, Mikrofon durchgestrichen, Kopfhörer durchgestrichen
    const FL_SVG = { cam: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="13" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3z"/></svg>',
      mute: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18"/></svg>',
      deaf: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3zM3 3l18 18"/></svg>' };
    // ohne Bot: stumm/taub kommt aus dem Server-Widget (wm), Kamera und Live nur mit Bot
    function flagIcons(d, vid, m, wm) {
      if (!dcIcons) return;
      const ps = botPeople.get(vid) || [];
      const uid = /\/(?:avatars|users)\/(\d{15,22})\//.exec(m.avatar || "")?.[1];
      const n = normDc(m.name), wn = (x) => normDc(String(x.name).replace(/…$/, ""));
      const p = ps.find((x) => (uid && x.id === uid) || (m.id && x.id === m.id)) || ps.find((x) => normDc(x.name) === n || normDc(x.user) === n)
        || (m.mute !== undefined ? m : (wm || []).find((x) => wn(x) === n) || (wm || []).find((x) => /…$/.test(x.name) && wn(x) && n.startsWith(wn(x))));
      if (!p) return;
      const fl = [p.video && ["cam", "Kamera an"], p.stream && ["LIVE", "überträgt den Bildschirm"], p.mute && ["mute", "stumm"], p.deaf && ["deaf", "taub (hört nichts)"]].filter(Boolean);
      if (!fl.length) return;
      const box = document.createElement("span"); box.className = "fls"; // rechts im Namen, bleibt bei langen Namen sichtbar
      for (const [t, tip] of fl) { const e = document.createElement("em"); e.className = "fl " + t.toLowerCase(); if (FL_SVG[t]) e.innerHTML = FL_SVG[t]; else e.textContent = t; e.title = tip; box.append(e); }
      d.querySelector("b").prepend(box); d.title += " · " + fl.map((f) => f[1]).join(", ");
    }
    const isMe = (name, user) => !!myDc && (normDc(name) === myDc || normDc(user) === myDc);
    // Ein Sprachkanal: Kopfzeile mit „Beitreten“ (oder „Du bist hier“), darunter die Leute
    function voiceBlock(parts, ch, gid, vid, ms) {
      const lm = live.ch[vid], join = vid && gid ? `discord://-/channels/${gid}/${vid}` : null;
      const here = (lm?.length ? lm : ms).some((m) => isMe(m.name, m.user)) || (botPeople.get(vid) || []).some((p) => isMe(p.name, p.user));
      const ch5 = document.createElement("div"); ch5.className = "vch" + (here ? " here" : ""); ch5.innerHTML = "<span></span><b></b>";
      ch5.firstChild.textContent = "🔊 " + ch; ch5.lastChild.textContent = here ? "Du bist hier" : "Beitreten";
      ch5.title = here ? "Du sitzt in diesem Kanal" : (dcJoinBot ? "Mit dem Bot hierher wechseln (wenn du schon in einem Sprachkanal bist), sonst Discord öffnen" : "In der Discord-App diesem Sprachkanal beitreten");
      if (join && !here) ch5.addEventListener("click", (e) => { e.stopPropagation(); if (noClick) return; if (!dcJoinBot) return window.jarvis.openDiscord(join); window.jarvis.dcJoin(gid, vid).then((r) => { if (r?.ok) notice("Du wurdest in „" + ch + "“ verschoben"); else { if (r?.reason && r.reason !== "aus") notice(r.reason === "nicht in Sprache" ? "Der Bot sieht dich in keinem Sprachkanal (Name in den Einstellungen prüfen). Discord öffnet sich." : r.reason); window.jarvis.openDiscord(join); } }); });
      else if (!join) ch5.lastChild.remove();
      parts.push(ch5);
      // Klick auf eine Person: ihr Profil in Discord öffnen, dort direkt „Nachricht“. Mit StreamKit: echte Namen, wer spricht, leuchtet grün
      const dm = (av, id) => { const x = id || /\/avatars\/(\d{15,22})\//.exec(av || "")?.[1]; return x ? `discord://-/users/${x}` : null; };
      const noId = (e) => { e.stopPropagation(); if (!noClick) notice("Für den Chat braucht Argus die Discord-ID dieser Person: eigenen Discord-Bot eintragen (Einstellungen, Freunde)."); };
      if (lm?.length) for (const m of lm) {
        const bp = (botPeople.get(vid) || []).find((p) => p.name === m.name || p.user === m.name);
        const me = isMe(m.name) || (bp && isMe(bp.name, bp.user));
        const u = dm(m.avatar, bp?.id);
        const d = row({ id: m.id || bp?.id, name: m.name, avatar: m.avatar, voice: ch }, me ? "Du" : u ? (bot.guilds.length ? "Klick: Nachricht schreiben" : "Klick: Chat in Discord") : "🔊 " + ch, null); d.dataset.live = m.name; flagIcons(d, vid, m, ms);
        if (!me) d.addEventListener("click", u ? (e) => { e.stopPropagation(); if (!noClick) { if (bot.guilds.length && window.dcWrite && /users\/(\d+)/.test(u)) window.dcWrite(m.name, /users\/(\d+)/.exec(u)[1], u); else { window.jarvis.openDiscord(u); notice(`Discord-Chat mit ${m.name} wird geöffnet …`); } } } : noId);
        parts.push(d);
      } else for (const m of ms) {
        const me = isMe(m.name, m.user);
        const u = dm(m.avatar, m.id);
        const d = row(m, me ? "Du" : u ? (bot.guilds.length ? "Klick: Nachricht schreiben" : "Klick: Chat in Discord") : m.game ? "spielt " + m.game : "🔊 " + ch, null); flagIcons(d, vid, m, ms);
        if (!me) d.addEventListener("click", u ? (e) => { e.stopPropagation(); if (!noClick) { if (bot.guilds.length && window.dcWrite && /users\/(\d+)/.test(u)) window.dcWrite(m.name, /users\/(\d+)/.exec(u)[1], u); else { window.jarvis.openDiscord(u); notice(`Discord-Chat mit ${m.name} wird geöffnet …`); } } } : noId);
        parts.push(d);
      }
    }
    if (st && !st.error) {
      parts.push(head("STEAM", st.online.length + " online"));
      if (!st.online.length) parts.push(Object.assign(document.createElement("div"), { className: "none", textContent: "Kein Freund online" }));
      for (const f of st.online.slice(0, 15)) parts.push(row(f, f.game ? "spielt " + f.game : f.state, f.url));
    }
    const steamEnd = parts.length;
    // Only voice data is supported. A server widget is not a friends source.
    for (const x of servers) {
      const bg = bot.guilds.find((g) => g.id === x.id);
      if (bg) { botGuild(parts, bg, x.server); continue; }
      const inVoice = window.argusDiscordList.voiceMembers(x.online);
      parts.push(head(x.server.toUpperCase(), "🔊 " + inVoice.length));
      if (!inVoice.length) parts.push(Object.assign(document.createElement("div"), { className: "none", textContent: "Niemand im Sprachkanal" }));
      for (const ch of [...new Set(inVoice.map((m) => m.voice))]) {
        const ms = inVoice.filter((m) => m.voice === ch);
        voiceBlock(parts, ch, x.id, ms[0]?.voiceId, ms); seenCh.add(ms[0]?.voiceId);
      }
    }
    // Server, auf denen nur der Bot sitzt (kein Widget eingetragen)
    for (const g of bot.guilds) if (!servers.some((x) => x.id === g.id)) botGuild(parts, g, g.name);
    // Private Sprachkanäle (per Link hinzugefügt): das Widget kennt sie nicht, StreamKit schon
    const extra = extraVoice.filter((v) => live.ch[v.c]?.length && !seenCh.has(v.c));
    if (extra.length) {
      parts.push(head("PRIVATE KANÄLE", "🔊 " + extra.reduce((n, v) => n + live.ch[v.c].length, 0)));
      for (const v of extra) voiceBlock(parts, v.name || "Privater Kanal", v.g, v.c, []);
    }
    if (live.auth && servers.length) {
      const a = Object.assign(document.createElement("div"), { className: "skauth", textContent: "▶ Echte Namen und Sprecher anzeigen: hier klicken und in Discord einmal erlauben" });
      a.addEventListener("click", (e) => { e.stopPropagation(); if (!noClick) window.jarvis.streamkitAuth(); }); parts.push(a);
    }
    const seenPeople = new Set();
    for (let i = 0; i < parts.length; i++) {
      const id = parts[i].dataset?.dcid;
      if (!id) continue; // Unknown IDs must not merge unrelated people by name.
      if (seenPeople.has(id)) parts.splice(i--, 1); else seenPeople.add(id);
    }
    const fold = (list) => { let skip = false; return list.filter((el) => { if (el.tagName === "H5") { skip = !!friendsFold[el.dataset.sec]; return true; } return el.classList.contains("skauth") || !skip; }); };
    const additional=window.argusDiscordList.additionalFriends(seenPeople,dcSocial.friends,{enabled:dcSocial.status==="connected"&&dcAlsoOnline,markedOnly:dcOnlyMarked,marked:dcMarked});
    if(additional.length){parts.push(head("ONLINE-FREUNDE",additional.length));for(const friend of additional)parts.push(row({...friend,voice:""},({0:"Online",3:"Abwesend",4:"Beschäftigt"})[friend.status],"https://discord.com/users/"+friend.id));}
    if (friendsSplit) { // Steam und Discord je ein eigenes Fenster
      const a = parts.slice(0, steamEnd), b = parts.slice(steamEnd);
      friendsEl.replaceChildren(...fold(a), frX(0)); friendsEl.dataset.empty = a.length ? "" : "1";
      friendsEl2.replaceChildren(...fold(b), frX(1)); friendsEl2.dataset.empty = b.length ? "" : "1";
    } else {
      friendsEl.replaceChildren(...fold(parts), frX(0)); friendsEl.dataset.empty = parts.length ? "" : "1";
      friendsEl2.replaceChildren(); friendsEl2.dataset.empty = "1";
    }
    markTalk();
  }
  // × oben rechts: Freundesliste ausblenden (wieder an: Einstellungen › Freunde)
  const frXel = [null, null];
  function frX(i = 0) {
    if (frXel[i]) return frXel[i];
    const b = frXel[i] = document.createElement("button"); b.type = "button"; b.className = "fr-x"; b.textContent = "×"; b.title = "Freundesliste ausblenden (wieder an: Einstellungen › Freunde)";
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => { e.stopPropagation(); setFriendsOn(false); });
    return b;
  }
  function setFriendsOn(on) { widgets.friends = { ...widgets.friends, on }; window.jarvis.setConfig({ widgets: { friends: widgets.friends } }); $("setFriendsOn").checked = on; buildWidgetRows?.(); }
  let fbSave = null;
  const saveFriendsBox = () => { clearTimeout(fbSave); fbSave = setTimeout(() => window.jarvis.setConfig({ friendsBox }), 300); };
  function applyFriendsBox() {
    if (!friendsEl) return;
    friendsEl.style.setProperty("--fw", friendsBox.w + "px");
    if (friendsBox.h > 0) friendsEl.style.setProperty("--fh", friendsBox.h + "px"); else friendsEl.style.removeProperty("--fh");
    friendsEl.style.setProperty("--fs", String(friendsBox.scale || 1));
    if (friendsEl2) {
      friendsEl2.style.setProperty("--fw", (friendsBox.w2 || friendsBox.w) + "px"); friendsEl2.style.setProperty("--fs", String(friendsBox.scale || 1));
      if (friendsBox.h2 > 0) friendsEl2.style.setProperty("--fh", friendsBox.h2 + "px"); else friendsEl2.style.removeProperty("--fh");
    }
  }
  // Zweites Fenster (nur bei getrennter Liste): Discord, standardmäßig auf der anderen Seite der Kugel
  let f2Res = null, f2Pos = null;
  function placeFriends2() {
    if (!friendsEl2) return;
    const show = friendsSplit && expanded && widgets.friends?.on !== false && !friendsEl2.dataset.empty && !(onMining() && !pageFriends);
    friendsEl2.classList.toggle("off", !show); if (!show) { placeG2?.({ x: 0, y: 0 }, 0, 0, true); return; }
    const w = friendsEl2.offsetWidth, h = friendsEl2.offsetHeight, fc = cOf("friends2");
    const firstLeft = !friendsEl.classList.contains("off") && fgPos ? fgPos.x + friendsEl.offsetWidth / 2 < fc.x : false;
    const defA = firstLeft ? 0 : Math.PI, defR = Math.min(SB * 1.15 + w / 2 + 4, (firstLeft ? W - fc.x : fc.x) - w / 2 - 6) / SB;
    let pos = anchor("friends2", defA, defR, 3.1, w, h, friendsStill ? 0 : 0.25);
    // Größe an der Ecke ziehen: linke obere Ecke bleibt stehen, nur rechts und unten ändert sich etwas
    if ((friendsEl2.style.width || friendsEl2.style.height) && f2Pos) { f2Res ??= { x: f2Pos.x, y: f2Pos.y }; pos = { x: f2Res.x, y: f2Res.y }; }
    if (gripSt.f2) pos = gripSt.f2.pos;
    f2Pos = pos;
    // Standardplatz einmal festhalten: das Discord-Fenster hängt danach nicht mehr von der Lage des Steam-Fensters ab
    if (!pins.friends2 && !drag && friendsEl2.offsetWidth && document.documentElement.dataset.ui !== "apple") { /* Apple-Modus: Liste steht in einer Karte, klassischen Platz nicht festlegen */ const c2 = cOf("friends2"), x2 = pos.x + w / 2 - c2.x, y2 = pos.y + h / 2 - c2.y; pins.friends2 = { a: Math.atan2(y2, x2), r: Math.max(0.2, Math.hypot(x2, y2) / SB) }; savePins(); }
    friendsEl2.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
    placeGrips2(pos, w, h);
  }
  function placeFriends() { placeFriends1(); placeFriends2(); }
  function placeFriends1() {
    if (!friendsEl) return;
    const show = expanded && widgets.friends?.on !== false && !friendsEl.dataset.empty && !(onMining() && !pageFriends);
    friendsEl.classList.toggle("off", !show);
    if (!show) { placeG1?.({ x: 0, y: 0 }, 0, 0, true); return; }
    const w = friendsEl.offsetWidth, h = friendsEl.offsetHeight;
    // Standard: links neben der Kugel, rechts, wenn links kein Platz ist
    // Ist auf keiner Seite genug Platz (schmales Fenster), an den Rand der breiteren Seite
    const fc = cOf("friends"), roomL = fc.x - SB * 1.15, roomR = W - fc.x - SB * 1.15, left = roomL >= w + 8 || (roomR < w + 8 && roomL > roomR);
    const defA = left ? Math.PI : 0, defR = Math.min(SB * 1.15 + w / 2 + 4, (left ? fc.x : W - fc.x) - w / 2 - 6) / SB;
    const pos = gripSt.f1 ? gripSt.f1.pos : anchor("friends", defA, defR, 2.2, w, h, friendsStill ? 0 : 0.25);
    friendsEl.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
    fgPos = pos; placeGrips(pos, w, h);
  }
  // Größe an jeder Ecke und jeder Kante ziehen; die gegenüberliegende Seite bleibt stehen. Gilt für beide Listen (Steam und Discord).
  const gripSt = { f1: null, f2: null };
  // Größe an jeder Kante ändern: 9 px am Rand ziehen = Größe, innen ziehen = verschieben
  function edgeResize(el, id, getPos, prep) {
    const edgeAt = (e) => {
      const b = el.getBoundingClientRect(), m = 9, x = e.clientX - b.left, y = e.clientY - b.top;
      return (y < m ? "t" : y > b.height - m ? "b" : "") + (x < m ? "l" : x > b.width - m - (el.scrollHeight > el.clientHeight ? 6 : 0) ? "r" : "");
    };
    const CUR = { t: "ns-resize", b: "ns-resize", l: "ew-resize", r: "ew-resize", tl: "nwse-resize", br: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize" };
    el.addEventListener("pointermove", (e) => { if (!gripSt[id] && !drag) el.style.cursor = CUR[edgeAt(e)] || ""; });
    el.addEventListener("pointerdown", (e) => {
      const c = edgeAt(e), p = getPos(); if (e.button !== 0 || !c || !p || document.documentElement.dataset.ui === "apple") return;
      e.stopPropagation(); e.preventDefault(); prep();
      gripSt[id] = { c, sx: e.clientX, sy: e.clientY, w0: el.offsetWidth, h0: el.offsetHeight, x0: p.x, y0: p.y, pos: { ...p } };
    }, true);
  }
  let fgPos = null, fgrips = null, f2grips = null;
  function makeGrips(id, getEl, getPos, wK, hK, pinKey, cls) {
    const list = ["tl", "tr", "bl", "br"].map((c) => {
      const g = document.createElement("div"); g.className = "fgrip " + c + (c.length === 1 ? " edge" : "") + " " + cls; g.title = "Ziehen: Größe ändern"; lblLayer.append(g);
      g.addEventListener("pointerdown", (e) => {
        const el = getEl(), p = getPos(); if (e.button !== 0 || !p) return;
        e.stopPropagation(); e.preventDefault();
        gripSt[id] = { c, sx: e.clientX, sy: e.clientY, w0: el.offsetWidth, h0: el.offsetHeight, x0: p.x, y0: p.y, pos: { ...p } }; g.classList.add("on");
      });
      return g;
    });
    window.addEventListener("pointermove", (e) => {
      const r = gripSt[id]; if (!r) return;
      const dx = e.clientX - r.sx, dy = e.clientY - r.sy, L = r.c.includes("l"), T = r.c.includes("t"), sw = L || r.c.includes("r"), sh = T || r.c.includes("b");
      const w = sw ? Math.max(130, Math.min(W - 8, r.w0 + (L ? -dx : dx))) : r.w0, h = sh ? Math.max(60, Math.min(innerHeight - 70, r.h0 + (T ? -dy : dy))) : r.h0;
      r.pos = { x: L ? r.x0 + (r.w0 - w) : r.x0, y: T ? r.y0 + (r.h0 - h) : r.y0 };
      if (sw) friendsBox[wK] = Math.round(w); if (sh || friendsBox[hK] > 0) friendsBox[hK] = Math.round(h); applyFriendsBox();
      const fc = cOf(pinKey), cx = r.pos.x + w / 2 - fc.x, cy = r.pos.y + h / 2 - fc.y;
      pins[pinKey] = { a: Math.atan2(cy, cx), r: Math.max(0.2, Math.hypot(cx, cy) / SB) };
    }, true);
    const end = () => { if (!gripSt[id]) return; gripSt[id] = null; list.forEach((g) => g.classList.remove("on")); saveFriendsBox(); savePins(); noClick = getEl(); const el = noClick; setTimeout(() => { if (noClick === el) noClick = null; }, 50); };
    window.addEventListener("pointerup", end, true); window.addEventListener("pointercancel", end, true);
    return (pos, w, h, off) => {
      for (const g of list) {
        g.classList.toggle("off", off); if (off) continue;
        const c = g.classList, edge = c.contains("edge");
        let x = pos.x, y = pos.y, gw = 14, gh = 14;
        if (edge) {
          if (c.contains("l") || c.contains("r")) { gw = 8; gh = Math.max(0, h - 28); y = pos.y + 14; x = pos.x + (c.contains("r") ? w - 5 : -3); }
          else { gh = 8; gw = Math.max(0, w - 28); x = pos.x + 14; y = pos.y + (c.contains("b") ? h - 5 : -3); }
          g.style.width = gw + "px"; g.style.height = gh + "px";
        } else { x = pos.x + (c.contains("tr") || c.contains("br") ? w - 14 : 0); y = pos.y + (c.contains("bl") || c.contains("br") ? h - 14 : 0); }
        g.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
    };
  }
  let placeG1 = null, placeG2 = null;
  function placeGrips(pos, w, h) {
    placeG1 ||= makeGrips("f1", () => friendsEl, () => fgPos, "w", "h", "friends", "");
    placeG1(pos, w, h, friendsEl.classList.contains("off"));
  }
  function placeGrips2(pos, w, h) {
    placeG2 ||= makeGrips("f2", () => friendsEl2, () => f2Pos, "w2", "h2", "friends2", "f2g");
    placeG2(pos, w, h, friendsEl2.classList.contains("off"));
  }
