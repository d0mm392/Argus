"use strict";
const object = value => value && typeof value === "object" && !Array.isArray(value);
function flush(config, snapshot, writeBackup, writeConfig) {
  if (!object(snapshot) || !object(snapshot.notesByPage) || !object(snapshot.pageIds) ||
      Object.values(snapshot.pageIds).some(id => typeof id !== "string")) throw Error("Invalid notes snapshot");
  const copy = JSON.parse(JSON.stringify(snapshot));
  config.notesByPage = copy.notesByPage; config.pageIds = copy.pageIds;
  // Persist the notes-only recovery copy first; it can recover a failed config write.
  writeBackup(); writeConfig(); return true;
}
module.exports = { flush };
