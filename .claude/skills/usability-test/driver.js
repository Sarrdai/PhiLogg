// Usability-test driver: one browser in a fixed device mode, steps sent over HTTP.
// Usage: NODE_PATH="$(npm root -g)" node driver.js <desktop|tablet|phone|mcp> <url> <outDir> [port]
// A step is the source of an async function ({ page, touch, mode, files }) => result, POSTed as
// the request body; the reply is JSON { step, result, error, pageErrors, dialogs, saved, shot }.
// Mode mcp: the desktop layout, no GUI steps; POST /mcp speaks the desktop app's MCP JSON-RPC
// (initialize, ping, tools/list, tools/call) and hands each call to the page's real bridge,
// window.philoggMcpCall, as the Rust server does; GET /look screenshots what the person sees.
// The mode can't be changed after start, and in tablet/phone the mouse, hover and hardware
// shortcuts throw: what a finger and an on-screen keyboard can't do is a finding, not a detour.
const { chromium } = require("playwright");
const http = require("http");
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
PROFILES.mcp = PROFILES.desktop;
const [mode, url, outDir, port = "9333"] = process.argv.slice(2);
if (!PROFILES[mode]) throw new Error("mode must be desktop, tablet, phone or mcp");
const deny = what => () => { throw new Error(`${what} is not available in ${mode} mode`); };
const fs = require("fs"), path = require("path");

// Headless Chromium rejects every File System Access picker, which the app reads as "cancelled":
// saves silently did nothing. Desktop gets fakes that behave like a person accepting the dialog
// (the open picker goes through an <input> so "filechooser" + setFiles works, and hands back
// real OPFS handles, which survive the app's IndexedDB structured clone). Touch modes drop the
// pickers like Safari on iPad/iPhone, so the app takes its <input>/<a download> paths instead.
function installPickers(mode) {
  const abort = () => new DOMException("The user aborted a request.", "AbortError");
  const names = ["showSaveFilePicker", "showOpenFilePicker", "showDirectoryPicker"];
  if (mode !== "desktop" && mode !== "mcp") {
    names.forEach(n => Object.defineProperty(window, n, { value: undefined, configurable: true, writable: true }));
    return;
  }
  window.showSaveFilePicker = async (opts = {}) => {
    const name = opts.suggestedName || "untitled";
    if (await window.__driver({ kind: "save-picker", name }) === "cancel") throw abort();
    return { kind: "file", name, async createWritable() {
      const parts = [];
      return {
        async write(d) { parts.push(d && d.type === "write" ? d.data : d); },
        async abort() {},
        async close() {
          const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          await window.__driver({ kind: "saved", name, base64: btoa(bin) });
        },
      };
    } };
  };
  window.showOpenFilePicker = (opts = {}) => new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement("input"), { type: "file", multiple: !!opts.multiple });
    input.addEventListener("cancel", () => reject(abort()));
    input.addEventListener("change", async () => {
      try {
        const dir = await navigator.storage.getDirectory();
        resolve(await Promise.all([...input.files].map(async f => {
          const h = await dir.getFileHandle(f.name, { create: true });
          const w = await h.createWritable(); await w.write(f); await w.close();
          return h;
        })));
      } catch (e) { reject(e); }
    });
    input.click();
  });
  window.showDirectoryPicker = async () => { await window.__driver({ kind: "folder-picker" }); throw abort(); };
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext(PROFILES[mode]);
  let pageErrors = [], dialogs = [], saved = [], pending = [], cancelSaves = 0, step = 0, saveCount = 0;
  const savedAll = [], saveDir = `${outDir}/saved`;
  fs.mkdirSync(saveDir, { recursive: true });
  const savePath = name => `${saveDir}/${String(++saveCount).padStart(2, "0")}-${path.basename(name)}`;
  const record = (via, name, file) => {
    const bytes = fs.readFileSync(file), binary = bytes.subarray(0, 4096).includes(0);
    const entry = { step, via, name, size: bytes.length, path: file,
      excerpt: binary ? "(binary)" : bytes.subarray(0, 600).toString("utf8") };
    savedAll.push(entry); saved.push(entry);
  };
  await context.exposeBinding("__driver", (_, msg) => {
    if (msg.kind === "save-picker") return cancelSaves > 0 && cancelSaves-- ? "cancel" : "ok";
    if (msg.kind === "folder-picker") dialogs.push("folder picker: not simulated, answered as cancelled");
    if (msg.kind === "saved") { const file = savePath(msg.name); fs.writeFileSync(file, Buffer.from(msg.base64, "base64")); record("save picker", msg.name, file); }
  });
  await context.addInitScript(installPickers, mode);
  // What a step can see of saved files (desktop picker saves and downloads alike).
  const files = {
    saved: () => savedAll,
    cancelNextSave() {
      if (mode !== "desktop") throw new Error(`there is no save dialog in ${mode} mode (files download directly)`);
      cancelSaves++;
    },
  };
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on("pageerror", e => pageErrors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") pageErrors.push(m.text()); });
  page.on("dialog", d => { dialogs.push(`${d.type()}: ${d.message()}`); d.accept(); });
  page.on("download", d => pending.push((async () => {
    const file = savePath(d.suggestedFilename());
    await d.saveAs(file);
    record("download", d.suggestedFilename(), file);
  })().catch(e => pageErrors.push(`download failed: ${e.message}`))));

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

  // The MCP side keeps its own handle on the page: the agent never gets it.
  const pageEval = page.evaluate.bind(page);
  let mcpCalls = 0;
  // Same answers as desktop/src-tauri/mcp/src/lib.rs (minus HTTP checks and the bearer token,
  // covered by `cargo test -p philogg-mcp`). The page answers through window.philogg.mcpToolResult;
  // the stub exists only for the synchronous call (outside a round of the in-app assistant,
  // which the browser build never runs), because the mere presence of window.philogg switches
  // the page to desktop behaviour elsewhere.
  async function mcpRpc(msg) {
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request: batches are not supported" } };
    if (typeof msg.method !== "string" || msg.id === undefined) return null;
    const ok = result => ({ jsonrpc: "2.0", id: msg.id, result });
    const params = msg.params || {};
    if (msg.method === "initialize") {
      return ok({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "philogg", version: "usability-driver" },
        instructions: "Tools act on the log files open in the PhiLogg window; call get_overview first." });
    }
    if (msg.method === "ping") return ok({});
    if (msg.method === "tools/list") return ok({ tools: await pageEval(() => mcpToolsList()) });
    if (msg.method === "tools/call") {
      if (typeof params.name !== "string") return { jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: "Invalid params: name must be a string" } };
      const args = params.arguments == null ? {} : params.arguments;
      if (typeof args !== "object" || Array.isArray(args)) return { jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: "Invalid params: arguments must be an object" } };
      mcpCalls++;
      const r = await pageEval(([name, args]) => {
        let out = null;
        window.philogg = { mcpToolResult(id, text, isError) { out = { text, isError }; } };
        try { window.philoggMcpCall("driver", name, args); } finally { delete window.philogg; }
        return out || { text: "PhiLogg did not answer (call still queued).", isError: true };
      }, [params.name, args]);
      return ok({ content: [{ type: "text", text: r.text }], isError: r.isError });
    }
    return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } };
  }

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

  fs.writeFileSync(`${outDir}/driver.pid`, String(process.pid));
  await page.goto(url);
  const snap = async () => {
    const shot = `${outDir}/step-${String(++step).padStart(3, "0")}.png`;
    await page.waitForTimeout(300);
    let error = null;
    await page.screenshot({ path: shot, scale: "css" }).catch(e => { error = String(e); });
    const out = { step, shot, error, pageErrors, dialogs };
    pageErrors = []; dialogs = [];
    return out;
  };
  http.createServer((req, res) => {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      if (req.url === "/look") { res.end(JSON.stringify(await snap(), null, 1)); return; }
      if (req.url === "/mcp") {
        if (mode !== "mcp") { res.statusCode = 404; res.end("start the driver in mcp mode for /mcp"); return; }
        let msg;
        try { msg = JSON.parse(body); } catch (e) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
          return;
        }
        let reply;
        try { reply = await mcpRpc(msg); } catch (e) { reply = { jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32603, message: String(e.message || e).split("\n")[0] } }; }
        if (!reply) { res.statusCode = 202; res.end(); return; }
        // What the person sees after the call, and what the page logged, for the report.
        if (msg.method === "tools/call") {
          const s = await snap();
          res.setHeader("X-Driver-Shot", s.shot);
          res.setHeader("X-Driver-Page-Errors", encodeURIComponent(JSON.stringify(s.pageErrors.concat(s.dialogs))));
          fs.appendFileSync(`${outDir}/mcp-log.jsonl`, JSON.stringify({ call: mcpCalls, step: s.step, tool: msg.params.name,
            args: msg.params.arguments || {}, isError: !!(reply.result && reply.result.isError), chars: JSON.stringify(reply).length,
            shot: s.shot, pageErrors: s.pageErrors }) + "\n");
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(reply));
        return;
      }
      if (mode === "mcp") { res.statusCode = 403; res.end(JSON.stringify({ error: "mcp mode: no GUI steps; use /mcp, and /look to see the window" })); return; }
      const shot = `${outDir}/step-${String(++step).padStart(3, "0")}.png`;
      let result = null, error = null;
      try { result = await eval(`(${body})`)({ page, touch, mode, files }); }
      catch (e) { error = String(e.message || e).split("\n")[0]; }
      await page.waitForTimeout(300);
      await Promise.all(pending.splice(0));
      await page.screenshot({ path: shot, scale: "css" }).catch(e => { error = error || String(e); });
      res.end(JSON.stringify({ step, result, error, pageErrors, dialogs, saved, shot }, null, 1));
      pageErrors = []; dialogs = []; saved = [];
    });
  }).listen(+port, "127.0.0.1", () => console.log(`driver ready: ${mode} on port ${port}`));
})();
