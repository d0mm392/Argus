(function (root) {
  "use strict";
  const builtin = Object.freeze({ Start: "start", Mining: "mining", Gaming: "gaming", Trading: "trading" });
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function migrate(config, uuid) {
    const ids = { ...(config.pageIds || {}), ...builtin };
    for (const name of config.customPages || []) if (!own(ids, name)) {
      Object.defineProperty(ids, name, { value: "page-" + uuid(), enumerable: true, configurable: true, writable: true });
    }
    const byPage = clone(config.notesByPage || {});
    let backup = config.notesLegacyBackup;
    if (config.notesScopeVersion !== 1) {
      // Keep the exact legacy values, including fields of notebook entries that
      // this renderer does not currently use. Existing scoped data always wins.
      backup = backup || clone({ notesText: config.notesText ?? "", notesPages: config.notesPages ?? [], notesCur: config.notesCur ?? "" });
      if (!own(byPage, "start")) byPage.start = {
        pages: Array.isArray(config.notesPages) && config.notesPages.length ? clone(config.notesPages) : [{ id: "n1", name: "Notizen", folder: "", text: config.notesText || "" }],
        current: config.notesCur || "", folder: ""
      };
    }
    return { pageIds: ids, notesByPage: byPage, notesLegacyBackup: backup, notesScopeVersion: 1 };
  }
  function empty() { return { pages: [{ id: "n1", name: "Notizen", folder: "", text: "" }], current: "n1", folder: "" }; }
  const api = { builtin, migrate, empty, clone };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.argusNotesStore = api;
})(globalThis);
