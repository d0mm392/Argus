"use strict";
const assert = require("node:assert/strict"), fs = require("fs"), path = require("path"), vm = require("vm");
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const { setup } = require("./renderer-fixture");
async function run() {
  const fixture = await setup(), { window, config, evaluate, wait, errors } = fixture;
  if (process.env.ARGUS_MENU_TRACE) {
    for (const name of ["menu-sub", "menu-size", "menu-close", "menu-back"]) ipcMain.on(name, (event, ...args) => console.log("TRACE", name, event.sender.getTitle(), JSON.stringify(args)));
    app.on("browser-window-created", (_event, created) => {
      for (const event of ["show", "focus", "blur", "closed"]) created.on(event, () => console.log("WINDOW", created.isDestroyed() ? "closed" : created.getTitle(), event));
    });
  }
  const source = fs.readFileSync(path.join(fixture.root, "main.js"), "utf8");
  const fromTo = (from, to) => {
    const start = source.indexOf(from), end = source.indexOf(to, start);
    if (start < 0 || end < start) throw Error("Menu source boundaries changed"); return source.slice(start, end);
  };
  const native = [];
  const context = { BrowserWindow, ipcMain, screen, path, __dirname: fixture.root,
    config, win: window, expanded: true, app, setTimeout, process: { platform: process.platform },
    alive: () => !window.isDestroyed(), logError: e => errors.push(String(e)),
    saveConfig: () => {}, setExpanded: () => {}, rescueWindow: () => {}, toggleVisible: () => {}, checkUpdates: () => {}, openDonate: () => {},
    ytAlive: () => false, twAlive: () => false, ytView: null, twView: null,
    // Inspect the native template without touching the real clipboard.
    Menu: { buildFromTemplate: template => ({ popup: () => native.push(template) }) },
    backgroundPresentationController: require(path.join(fixture.root, "app/background-presentation")).attach(window, "fluid", state => window.webContents.send("background-presentation", state))
  };
  vm.createContext(context);
  vm.runInContext(fromTo("let menuWin =", "// Spendenlink:") +
    fromTo("const MENU_EN =", 'ipcMain.on("resize-by"') +
    ";globalThis.closeMenus = closeStyledMenu;", context);
  const visible = title => BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && w.getTitle() === title && w.isVisible());
  const open = async page => {
    await evaluate(`switchPage(${JSON.stringify(page)});document.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:innerWidth-12,clientY:Math.round(innerHeight/2)}));true`);
    await wait(500); const menu = visible("Argus Menü")[0]; assert(menu, "visible context menu: " + page); return menu;
  };
  for (const page of ["Start", "Mining"]) {
    const menu = await open(page);
    await menu.webContents.executeJavaScript(`const item=[...document.querySelectorAll('#m button')].find(b=>b.textContent.includes('Darstellung im Hintergrund'));item.focus();item.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));true`);
    let sub;
    for (let i = 0; i < 40 && !sub; i++) { await wait(50); sub = visible("Argus Untermenü")[0]; }
    assert(sub, "keyboard opens own submenu; windows=" + JSON.stringify(BrowserWindow.getAllWindows().map(w => ({title:w.getTitle(),visible:w.isVisible(),focused:w.isFocused()}))));
    assert(sub.isFocused(), "keyboard submenu takes focus");
    await sub.webContents.executeJavaScript(`const eco=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Energiesparend'));eco.click();true`);
    await wait(120); assert.equal(config.backgroundPresentation, "eco");
    assert.equal(await evaluate('document.getElementById("setBackgroundPresentation").value'), "eco");
    assert.equal(await sub.webContents.executeJavaScript('document.querySelectorAll(\'[aria-checked="true"]\').length'), 1);
    await sub.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));true`);
    await wait(180); assert.equal(visible("Argus Untermenü").length, 0); assert(menu.isFocused());
    await menu.webContents.executeJavaScript(`const readings=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Messwerte'));readings.dispatchEvent(new PointerEvent('pointerenter'));true`);
    let readings;
    for (let i = 0; i < 40 && !readings; i++) { await wait(50); readings = visible("Argus Untermenü")[0]; }
    assert(readings, "readings submenu");
    const labels = await readings.webContents.executeJavaScript('[...document.querySelectorAll("button")].map(b=>b.textContent)');
    assert.equal(labels.some(label => /Mining/.test(label)), page === "Mining", "Mining readings only on Mining");
    if (page === "Start") {
      for (let i = 0; i < 2; i++) {
        await readings.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('GPU-Temperatur')).click();true`);
        await wait(50); assert(readings.isVisible() && menu.isVisible(), "checkbox leaves both menus open");
      }
    }
    const out = process.env.ARGUS_TEST_ARTIFACTS || fixture.profile; fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "menu-" + page.toLowerCase() + ".png"), (await menu.capturePage()).toPNG());
    fs.writeFileSync(path.join(out, "menu-" + page.toLowerCase() + "-readings.png"), (await readings.capturePage()).toPNG());
    const b = menu.getBounds(), area = screen.getDisplayMatching(b).workArea;
    assert(b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height);
    context.closeMenus(); await wait(100);
  }
  ipcMain.emit("ctx-menu", { sender: window.webContents }, { edit: true });
  assert.deepEqual(Array.from(native[0], item => item.role).filter(Boolean), ["undo", "redo", "cut", "copy", "paste", "selectAll"]);
  assert.equal(visible("Argus Menü").length, 0);
  await evaluate(`document.querySelector('[name="uiSkin"][value="light"]').click();true`);
  const light = await open("Start");
  assert.equal(await light.webContents.executeJavaScript('getComputedStyle(document.getElementById("m")).backgroundColor'), "rgb(255, 255, 255)");
  assert.equal(await light.webContents.executeJavaScript('getComputedStyle(document.body).color'), "rgb(32, 36, 44)");
  fs.writeFileSync(path.join(process.env.ARGUS_TEST_ARTIFACTS || fixture.profile, "menu-light.png"), (await light.capturePage()).toPNG());
  context.closeMenus();
  assert.deepEqual(errors, []);
  console.log("PASS menus: actual main menu handlers + renderer, Start/Mining, visible windows, keyboard submenu/back, radio state, shared background preference, screen bounds, native editing roles");
  app.exit(0);
}
run().catch(error => { console.error(error.stack); app.exit(1); });
setTimeout(() => app.exit(2), 20000).unref();
