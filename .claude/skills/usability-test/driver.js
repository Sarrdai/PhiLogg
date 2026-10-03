// Usability-test driver: one browser in a fixed device mode, steps sent over HTTP.
// Usage: NODE_PATH="$(npm root -g)" node driver.js <desktop|tablet|phone> <url> <outDir> [port]
// A step is the source of an async function ({ page, touch, mode }) => result, POSTed as the
// request body; the reply is JSON { step, result, error, pageErrors, dialogs, shot }.
// The mode can't be changed after start, and in tablet/phone the mouse, hover and hardware
// shortcuts throw: what a finger and an on-screen keyboard can't do is a finding, not a detour.
const { chromium } = require("playwright");
const http = require("http");
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const [mode, url, outDir, port = "9333"] = process.argv.slice(2);
if (!PROFILES[mode]) throw new Error("mode must be desktop, tablet or phone");
const deny = what => () => { throw new Error(`${what} is not available in ${mode} mode`); };

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext(PROFILES[mode]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  let pageErrors = [], dialogs = [];
  page.on("pageerror", e => pageErrors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") pageErrors.push(m.text()); });
  page.on("dialog", d => { dialogs.push(`${d.type()}: ${d.message()}`); d.accept(); });

  // Real touch input (touch + pointer events with pointerType "touch"), for gestures tap() lacks.
  const point = async target => {
    if (Array.isArray(target)) return { x: target[0], y: target[1] };
    const b = await target.boundingBox();
    if (!b) throw new Error("target is not visible");
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const touchEv = (type, p) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [p] : [] });
  const touch = {
    async longPress(target, ms = 800) {
      const p = await point(target);
      await touchEv("touchStart", p); await page.waitForTimeout(ms); await touchEv("touchEnd");
    },
    async swipe(from, to, ms = 300, steps = 12) {
      const a = await point(from), b = await point(to);
      await touchEv("touchStart", a);
      for (let i = 1; i <= steps; i++) {
        await page.waitForTimeout(ms / steps);
        await touchEv("touchMove", { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps });
      }
      await touchEv("touchEnd");
    },
  };

  // Look, don't reach in: no page scripts, no resizing; touch modes also lose mouse and shortcuts.
  page.evaluate = page.evaluateHandle = page.$eval = page.$$eval = deny("page.evaluate");
  page.addScriptTag = page.setViewportSize = deny("changing the page or viewport");
  const Locator = Object.getPrototypeOf(page.locator("body"));
  Locator.evaluate = Locator.evaluateAll = Locator.evaluateHandle = deny("locator.evaluate");
  if (PROFILES[mode].hasTouch) {
    for (const m of ["click", "dblclick", "hover", "dragTo"]) Locator[m] = deny(`locator.${m} (mouse)`);
    for (const m of ["click", "dblclick", "hover", "dragAndDrop"]) page[m] = deny(`page.${m} (mouse)`);
    for (const m of ["click", "dblclick", "down", "up", "move", "wheel"]) page.mouse[m] = deny("the mouse");
    const press = page.keyboard.press.bind(page.keyboard);
    page.keyboard.press = key => ["Enter", "Backspace"].includes(key)
      ? press(key) : deny(`key "${key}" (on-screen keyboard has only text, Enter, Backspace)`)();
    Locator.press = deny("locator.press (use page.keyboard)");
  }

  require("fs").writeFileSync(`${outDir}/driver.pid`, String(process.pid));
  await page.goto(url);
  let step = 0;
  http.createServer((req, res) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      const shot = `${outDir}/step-${String(++step).padStart(3, "0")}.png`;
      let result = null, error = null;
      try { result = await eval(`(${body})`)({ page, touch, mode }); }
      catch (e) { error = String(e.message || e).split("\n")[0]; }
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot, scale: "css" }).catch(e => { error = error || String(e); });
      res.end(JSON.stringify({ step, result, error, pageErrors, dialogs, shot }, null, 1));
      pageErrors = []; dialogs = [];
    });
  }).listen(+port, "127.0.0.1", () => console.log(`driver ready: ${mode} on port ${port}`));
})();
