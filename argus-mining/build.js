// Baut Argus-Mining.exe: alle Dateien in eine Datei bündeln und als Node-Einzeldatei-Programm (SEA) in node.exe einsetzen.
// Aufruf: node build.js <Pfad zu node.exe für Windows x64>   (gleiche Node-Version wie die, mit der gebaut wird)
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const out = path.join(__dirname, "dist"); fs.mkdirSync(out, { recursive: true });
const mods = ["lanminer", "report", "hist", "page"];
let src = "const __m = {}, __c = {};\nconst __req = (n) => { const k = n.replace(/^\\.\\//, ''); if (__m[k]) { if (!__c[k]) { const module = { exports: {} }; __c[k] = module; __m[k](module, module.exports, __req); } return __c[k].exports; } return require(n); };\n";
for (const m of mods) src += `__m[${JSON.stringify(m)}] = function (module, exports, require) {\n${fs.readFileSync(path.join(__dirname, m + ".js"), "utf8")}\n};\n`;
src += `(function (require) {\n${fs.readFileSync(path.join(__dirname, "main.js"), "utf8")}\n})(__req);\n`;
fs.writeFileSync(path.join(out, "argus-mining.js"), src);
fs.writeFileSync(path.join(out, "sea-config.json"), JSON.stringify({ main: path.join(out, "argus-mining.js"), output: path.join(out, "sea.blob"), disableExperimentalSEAWarning: true, useCodeCache: false }));
execFileSync(process.execPath, ["--experimental-sea-config", path.join(out, "sea-config.json")], { stdio: "inherit" });
const nodeExe = process.argv[2]; if (!nodeExe) { console.log("Bündel fertig (ohne exe):", path.join(out, "argus-mining.js")); process.exit(0); }
const exe = path.join(out, "Argus-Mining.exe"); fs.copyFileSync(nodeExe, exe);
execFileSync("npx", ["--yes", "postject@1.0.0-alpha.6", exe, "NODE_SEA_BLOB", path.join(out, "sea.blob"), "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"], { stdio: "inherit" });
console.log("fertig:", exe);
