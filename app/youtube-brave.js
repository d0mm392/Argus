"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
function findExecutable(env = process.env, exists = fs.existsSync) {
  return [env.LOCALAPPDATA, env.PROGRAMFILES, env["PROGRAMFILES(X86)"]]
    .filter(Boolean).map(base => path.join(base, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"))
    .find(file => exists(file)) || null;
}
function youtubeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname)) return null;
    const clean = new URL(url.origin + url.pathname);
    for (const key of ["v", "list", "t", "search_query"]) if (url.searchParams.has(key)) clean.searchParams.set(key, url.searchParams.get(key));
    return clean.href;
  } catch { return null; }
}
function target(query, resume) {
  if (query) return youtubeUrl(query) || "https://www.youtube.com/results?search_query=" + encodeURIComponent(String(query).slice(0, 200));
  return youtubeUrl(resume) || "https://www.youtube.com/";
}
function migrate(config) {
  if (config.ytBraveMigration === 1) return {};
  return { ytBraveMigration: 1, ytMode: "brave", ytOpen: "",
    ytBeforeBrave: config.ytBeforeBrave || { mode: config.ytMode || "panel", open: config.ytOpen || "" } };
}
function launch({ query = "", resume = "", env = process.env, exists = fs.existsSync, spawn = cp.spawn } = {}) {
  const executable = findExecutable(env, exists);
  if (!executable) return Promise.resolve({ ok: false, error: "missing" });
  return new Promise(resolve => {
    let child;
    try { child = spawn(executable, ["--app=" + target(query, resume)], { shell: false, detached: true, stdio: "ignore", windowsHide: false }); }
    catch { return resolve({ ok: false, error: "launch" }); }
    child.once("error", () => resolve({ ok: false, error: "launch" }));
    child.once("spawn", () => { child.unref(); resolve({ ok: true }); });
  });
}
module.exports = { findExecutable, youtubeUrl, target, migrate, launch };
