// Prüft Suche, Abfrage und Report mit nachgebauten Minern (Antminer Stock, Whatsminer, VNISH) auf 127.0.0.x
const test = require("node:test"), assert = require("node:assert"), net = require("net"), http = require("http"), os = require("os"), fs = require("fs"), path = require("path");
process.env.AM_TEST_PORT = "14028"; process.env.AM_TEST_HTTP = "18080";
const lan = require("../lanminer"), report = require("../report");
const Z = "\0";
const ANT = { summary: '{"STATUS":[{"STATUS":"S"}],"SUMMARY":[{"Elapsed":7200,"GHS 5s":"104123.5","GHS av":104000}]}', stats: '{"STATUS":[{"STATUS":"S"}],"STATS":[{"Type":"Antminer S19j Pro","Miner":"uart_trans.1.3"}{"Elapsed":7200,"total_rateideal":104000,"fan_num":4,"fan1":5400,"fan2":5460,"temp_chip1":"60-62-75-77","temp_num":3}]}', pools: '{"POOLS":[{"POOL":0,"URL":"stratum+tcp://pool-a:3333","Status":"Alive","User":"acct.miner01"},{"POOL":1,"URL":"stratum+tcp://pool-b:3333","Status":"Alive","User":"acct.miner01b"},{"POOL":2,"URL":"stratum+tcp://pool-c:3333","Status":"Dead","User":"acct.miner01c"},{"POOL":3,"URL":"x","User":"y"}]}' };
const WM = { summary: '{"STATUS":[{"STATUS":"S"}],"SUMMARY":[{"Elapsed":3600,"MHS 5s":"112000000","Temperature":71.5,"Fan Speed In":4200,"Fan Speed Out":4300,"Power":3360,"Uptime":86400}]}', stats: '{"STATUS":[{"STATUS":"E","Msg":"invalid cmd"}]}', pools: '{"POOLS":[{"Status":"Alive","User":"acct.wm07"}]}', devdetails: '{"DEVDETAILS":[{"Model":"M30S+"}]}', get_miner_info: '{"STATUS":"S","Msg":{"ip":"127.0.0.3","mac":"c4:11:22:33:44:55","minersn":"HTM3XS12345","powersn":"P123"}}' };
const VN = { summary: '{"STATUS":[{"STATUS":"S","Description":"bmminer vnish"}],"SUMMARY":[{"Elapsed":500,"GHS 5s":"0"}]}', stats: '{"STATS":[{"Type":"Antminer S19 Pro (vnish 1.2.6)"}]}', pools: '{"POOLS":[{"Status":"Dead","User":"acct.vn3"}]}' };
const servers = [], crypto = require("crypto"), md5 = (x) => crypto.createHash("md5").update(x).digest("hex");
// Antminer-Weboberfläche mit Digest-Anmeldung root/root
function antWeb() { return http.createServer((q, r) => {
  const a = q.headers.authorization || "";
  if (!/^Digest /.test(a)) { r.statusCode = 401; r.setHeader("WWW-Authenticate", 'Digest realm="antMiner Configuration", nonce="abc123", qop="auth"'); return r.end(); }
  const g = (k) => (new RegExp(k + '="?([^",]+)"?').exec(a) || [])[1];
  const ok = g("response") === md5(`${md5("root:antMiner Configuration:root")}:abc123:${g("nc")}:${g("cnonce")}:auth:${md5("GET:" + g("uri"))}`);
  if (!ok) { r.statusCode = 401; return r.end(); }
  r.setHeader("Content-Type", "application/json"); r.end(JSON.stringify({ minertype: "Antminer S19j Pro", macaddr: "02:aa:bb:cc:dd:ee", serinum: "JYZZB1234567" }));
}); }
function fake(ip, map) { const s = net.createServer((c) => c.on("data", (d) => { const j = JSON.parse(String(d)); const k = j.command || j.cmd; c.end((map[k] || '{"STATUS":[{"STATUS":"E"}]}') + Z); })); s.listen(14028, ip); servers.push(s); }
test.before(async () => {
  fake("127.0.0.2", ANT); fake("127.0.0.3", WM); fake("127.0.0.4", VN);
  const h = http.createServer((q, r) => { if (q.url === "/api/v1/info") { r.setHeader("Content-Type", "application/json"); return r.end(JSON.stringify({ miner: "Antminer S19 Pro", serial: "VN-SER-42", network: { mac: "aa:bb:cc:00:11:22" } })); } if (q.url === "/api/v1/summary") { r.setHeader("Content-Type", "application/json"); r.end(JSON.stringify({ miner: { miner_type: "Antminer S19 Pro", power_consumption: 3050, chains: [{ chip_temp: { max: 80 } }] }, system: { uptime: 123456 } })); } else { r.statusCode = 404; r.end(); } });
  h.listen(18080, "127.0.0.4"); servers.push(h);
  const aw = antWeb(); aw.listen(18080, "127.0.0.2"); servers.push(aw);
  await new Promise((r) => setTimeout(r, 200));
});
test.after(() => servers.forEach((s) => s.close()));

test("Adressbereiche wie in Foreman", () => {
  const r = lan.parseRanges("172.16.8.0-255\n10.0.0.1-255\n10.0.2.0/24, 192.168.1.5\n8.8.8.0-255\nquatsch");
  assert.equal(r.ips.length, 254 + 254 + 254 + 1);
  assert.deepEqual(r.bad, ["8.8.8.0-255", "quatsch"]);
  assert.ok(!r.ips.includes("10.0.0.255") && r.ips.includes("10.0.0.1"));
});
test("kaputtes JSON von Antminer wird geflickt", () => { assert.equal(lan.parseApi('{"a":[{"x":1}{"y":2}]}' + Z).a.length, 2); });

test("Suche und Abfrage: Antminer, Whatsminer, VNISH", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "am-"));
  lan.init(dir, () => ({ on: true, ranges: "127.0.0.1-6", jth: 0 }));
  await lan.scan(); const s = await lan.poll();
  const by = Object.fromEntries(s.miners.map((m) => [m.ip, m]));
  assert.equal(s.miners.length, 3);
  const a = by["127.0.0.2"]; assert.equal(a.name, "miner01"); assert.equal(a.type, "Antminer S19j Pro"); assert.equal(Math.round(a.hr / 1e12), 104); assert.equal(a.temp, 77); assert.equal(a.fan, 5460);
  assert.equal(a.hup, 7200); assert.equal(a.up, null); assert.equal(a.wattEst, true); assert.equal(a.watt, Math.round(104.1235 * 29.5)); assert.equal(Math.round(a.nom / 1e12), 104);
  const w = by["127.0.0.3"]; assert.equal(w.name, "wm07"); assert.equal(w.type, "Whatsminer M30S+"); assert.equal(w.watt, 3360); assert.equal(w.wattEst, false); assert.equal(w.up, 86400); assert.equal(w.hup, 3600); assert.equal(Math.round(w.hr / 1e12), 112);
  assert.deepEqual(a.pools.map((p) => p.user), ["acct.miner01", "acct.miner01b", "acct.miner01c"]); assert.equal(a.pools[2].st, "Dead"); assert.equal(a.pools[0].url, "stratum+tcp://pool-a:3333");
  assert.equal(a.serial, "JYZZB1234567"); assert.equal(a.mac, "02:AA:BB:CC:DD:EE");
  assert.equal(w.serial, "HTM3XS12345"); assert.equal(w.mac, "C4:11:22:33:44:55");
  const v = by["127.0.0.4"]; assert.equal(v.serial, "VN-SER-42"); assert.equal(v.mac, "AA:BB:CC:00:11:22"); assert.equal(v.on, false); assert.equal(v.watt, 0); assert.equal(v.up, 123456); assert.match(v.type, /VNISH|vnish/);
  // Detailansicht: Sensoren, Lüfter, Pools mit Shares
  const d = await lan.detail("127.0.0.2", {}); assert.ok(d.sensors.some((x) => x.label.startsWith("Board 1 Chip") && x.v === 77)); assert.equal(d.fans.length, 2); assert.equal(d.poolsAll.length, 4); assert.equal(d.serial, "JYZZB1234567");
  // Verlauf 24 h
  const hist = require("../hist"); hist.init(dir); hist.record(s.miners, Date.now(), true); hist.init(dir); assert.equal(hist.get("127.0.0.3")[0][1], 112);
  // Miner fällt weg: zählt als offline
  servers[0].close(); servers.at(-1).close(); await new Promise((r) => setTimeout(r, 100));
  const s2 = await lan.poll(); const a2 = s2.miners.find((m) => m.ip === "127.0.0.2"); assert.equal(a2.on, false); assert.equal(a2.name, "miner01");
});

test("Tagesreport je Miner mit Uptime, Verbrauch und Neustarts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "am-")); report.init(dir, 30);
  const t0 = new Date(2026, 10, 9, 0, 1).getTime();
  for (let i = 0; i < 12; i++) report.record([{ ip: "1", name: "A", on: true, hr: 100e12, watt: 3000, wattEst: true, up: 1000 + i * 300, hup: 1000 + i * 300 }, { ip: "2", name: "B", on: i < 6, hr: i < 6 ? 100e12 : 0, watt: 3300, up: i === 8 ? 10 : 5000 + i * 300 }], false, t0 + i * 300e3);
  const r = report.build("2026-11-09");
  assert.equal(r.total, 2); assert.equal(r.samples, 12);
  const A = r.miners.find((m) => m.name === "A"), B = r.miners.find((m) => m.name === "B");
  assert.equal(A.uptime, 1); assert.equal(B.uptime, 0.5); assert.equal(Math.round(A.kwh * 10), 30); assert.equal(A.kwh, A.kwhEst); assert.equal(B.kwhEst, 0); assert.equal(Math.round(B.kwh * 100), 165);
  assert.equal(B.reboots, 1);
  assert.match(report.csv("2026-11-09"), /^﻿Miner;IP;Seriennummer;MAC;Modell;Pool 1;Worker 1;Pool 2;Worker 2;Pool 3;Worker 3;Uptime %/);
});

test("Monatsreport: Tage zusammen, Zuordnung über Seriennummer, alte report.json wird übernommen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "am-"));
  fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify({ "2026-10-31": { n: 1, nonet: 0, hist: { 1: 1 }, m: { "9": { name: "Alt", n: 1, on: 1, wh: 100, est: 0, hr: 1e14 } } } }));
  report.init(dir, 90);
  assert.ok(fs.existsSync(path.join(dir, "report", "2026-10-31.json")));
  for (let d = 1; d <= 3; d++) {
    const t0 = new Date(2026, 10, d, 1, 0).getTime();
    // Miner mit SN zieht am 3. Tag auf eine andere IP um; bleibt ein Eintrag
    for (let i = 0; i < 10; i++) report.record([{ ip: d < 3 ? "10.0.0.5" : "10.0.0.9", name: "X", serial: "SN1", on: i < 8, hr: 100e12, watt: 3000 }, { ip: "10.0.0.6", name: "Y", on: true, hr: 90e12, watt: 3000, wattEst: true }], false, t0 + i * 300e3);
  }
  const m = report.buildMonth("2026-11");
  assert.equal(m.days, 3); assert.equal(m.total, 2); assert.equal(m.daysInMonth, 30);
  const X = m.miners.find((x) => x.serial === "SN1"); assert.equal(X.samples, 30); assert.equal(Math.round(X.uptime * 100), 80); assert.equal(X.days, 3); assert.match(X.id, /10\.0\.0\.5.*10\.0\.0\.9|10\.0\.0\.9.*10\.0\.0\.5/);
  assert.deepEqual(report.months(), ["2026-10", "2026-11"]);
  assert.match(report.csv("2026-11"), /Tage mit Daten/);
});
