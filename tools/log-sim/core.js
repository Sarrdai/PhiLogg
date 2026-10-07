// PhiLogg log simulator — generator core.
//
// One deterministic engine behind both front ends: tools/log-sim/cli.js
// (Node, headless — meant for Claude sessions and scripts) and
// tools/log-simulator.html (browser UI, direct generation + live tailing).
// UMD-style so the same file is `require`d by Node and loaded by a classic
// <script src> from file:// (ES module imports are blocked there).
//
// Model: a seeded PRNG drives a set of *scenarios* (each one exercises a
// PhiLogg feature: link pairs, plots, array columns, embedded XML/JSON, ...)
// that produce format-neutral entries; a *format* renders them as text.
// Timestamps are "naive" wall-clock milliseconds, formatted with the UTC
// getters, so output is identical in every time zone for a given seed.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PhiloggLogSim = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- helpers

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function utf8Length(s) {
    let n = s.length;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      // 2-byte chars +1, 3-byte chars +2, a surrogate pair (4 bytes) +1 per half.
      if (c >= 0x80) n += c >= 0x800 && (c < 0xd800 || c > 0xdfff) ? 2 : 1;
    }
    return n;
  }

  const pad = (n, w) => String(n).padStart(w, "0");

  // "yyyy-MM-dd HH:mm:ss,SSS"-style tokens, same vocabulary as philogg.html's
  // DATE_TOKEN_RE (yyyy MM dd HH mm ss SSS).
  function formatTs(ms, fmt) {
    const d = new Date(ms);
    return fmt.replace(/yyyy|MM|dd|HH|mm|ss|SSS/g, tok =>
      tok === "yyyy" ? String(d.getUTCFullYear()) :
      tok === "MM" ? pad(d.getUTCMonth() + 1, 2) :
      tok === "dd" ? pad(d.getUTCDate(), 2) :
      tok === "HH" ? pad(d.getUTCHours(), 2) :
      tok === "mm" ? pad(d.getUTCMinutes(), 2) :
      tok === "ss" ? pad(d.getUTCSeconds(), 2) : pad(d.getUTCMilliseconds(), 3));
  }

  // "2026-01-15T08:00:00" (no zone) -> naive ms; anything Date can't parse -> NaN.
  function parseNaive(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?)?$/.exec(String(s || "").trim());
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), +((m[7] || "0").padEnd(3, "0")));
  }

  // The current local wall-clock time as naive ms (live mode).
  function naiveNow() {
    const now = Date.now();
    return now - new Date(now).getTimezoneOffset() * 60000;
  }

  // "10MB", "500k", "1.5 GB", "2048" -> bytes.
  function parseSize(s) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*([kmg]?)i?b?\s*$/i.exec(String(s || ""));
    if (!m) return NaN;
    const mult = { "": 1, k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 }[m[2].toLowerCase()];
    return Math.round(+m[1] * mult);
  }

  // ---------------------------------------------------------------- data

  const SERVICES = ["Shop", "Billing", "Warehouse", "Gateway", "Plant", "Portal"];
  const USERS = ["alice", "bob", "carol", "dave", "erin", "frank"];
  const TENANTS = ["acme", "globex", "initech", "umbrella"];
  const TABLES = ["orders", "customers", "stock_items", "invoices"];
  const BASE_THREADS = ["main", "worker-1", "worker-2", "worker-3", "worker-4", "io-dispatch", "scheduler"];

  // Class key -> [module folder, class name]. The logger/file are derived per
  // service, so parallel files ("services") get distinct locations.
  const CLASSES = {
    scheduler: ["Core", "Scheduler"],
    orders: ["Orders", "OrderService"],
    repo: ["Data", "Repository"],
    http: ["Net", "HttpClient"],
    session: ["Net", "SessionManager"],
    control: ["Net", "ControlChannel"],
    axis: ["Motion", "AxisController"],
    tracker: ["Motion", "PositionTracker"],
    sensors: ["Sensors", "SensorHub"],
    spectro: ["Sensors", "Spectrometer"],
    files: ["Io", "FileStore"],
    diag: ["Core", "Diagnostics"],
    l10n: ["Ui", "Localization"],
  };

  // n with `decimals` places, integer part grouped in threes by `group`
  // ("1,234.5" / "1.234,5") — how culture-formatted log values look.
  function groupThousands(n, decimals, group, decimal) {
    const [int, frac] = n.toFixed(decimals).split(".");
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (frac ? decimal + frac : "");
  }

  // ---------------------------------------------------------------- scenarios
  //
  // make(g, ts) returns one entry (partial — defaults filled by the
  // generator) and may schedule follow-ups with g.schedule(ts, entry).
  // `hint` names the PhiLogg features the scenario feeds and a filter to try;
  // it is what `cli.js --list` prints, so keep it concrete.

  const SCENARIOS = {
    basic: {
      label: "Baseline noise",
      weight: 30,
      hint: "Everyday INFO/DEBUG/WARN lines (heartbeat, queue depth, retries, orders). Level bar, text filters, facets on Thread/Location, Patterns tab.",
      make(g) {
        const r = g.int(0, 99);
        if (r < 18) return { level: "DEBUG", cls: "scheduler", method: "Tick", msg: "Heartbeat OK" };
        if (r < 34) return { level: "INFO", cls: "scheduler", method: "Tick", msg: "Queue depth: " + g.int(0, 250) + " items" };
        if (r < 46) return { level: "DEBUG", cls: "repo", method: "Get", msg: "Cache hit ratio: " + g.int(40, 100) + "%" };
        if (r < 56) return { level: "WARN", cls: "http", method: "Send", msg: "Retrying operation, attempt " + g.int(1, 5) + " of 5", json: { tags: ["http", "retry"] } };
        if (r < 70) return { level: "INFO", cls: "scheduler", method: "Tick", msg: "Scheduler tick, " + g.int(0, 12) + " jobs pending" };
        if (r < 86) {
          const user = g.pick(USERS);
          return { level: "INFO", cls: "orders", method: "Submit", msg: "Order O-" + pad(g.int(1, 99999), 5) + " submitted by user '" + user + "'", ctx: { user } };
        }
        if (r < 96) return { level: "WARN", cls: "repo", method: "Query", msg: "Slow query detected on table '" + g.pick(TABLES) + "' (" + g.int(500, 4000) + " ms)", json: { tags: ["db", "slow"] } };
        return { level: "ERROR", cls: "repo", method: "Connect", msg: "Database connection failed: timeout after " + g.int(1000, 30000) + "ms", json: { tags: ["db"] } };
      },
    },

    stacktrace: {
      label: "Stack traces",
      weight: 3,
      hint: "Multi-line ERROR entries (.NET and Java stack traces with inner exceptions/'Caused by'). Continuation-line parsing, multiline toggle, word wrap, clickable paths in 'at ... in C:\\...:line N'.",
      make(g) {
        const order = "O-" + pad(g.int(1, 99999), 5);
        if (g.chance(0.6)) {
          const root = g.svcRoot();
          const cont = [
            "System.InvalidOperationException: Sequence contains no elements",
            "   at " + g.svc + ".Orders.OrderService.Submit(Order order) in " + root + "\\Orders\\OrderService.cs:line " + g.int(100, 300),
            "   at " + g.svc + ".Api.OrdersController.Post(OrderDto dto) in " + root + "\\Api\\OrdersController.cs:line " + g.int(30, 90),
            "   at Microsoft.AspNetCore.Mvc.Infrastructure.ActionMethodExecutor.Execute(ObjectMethodExecutor executor, Object controller, Object[] arguments)",
          ];
          if (g.chance(0.5)) cont.push(" ---> System.Data.SqlClient.SqlException (0x80131904): Timeout expired.", "   at System.Data.SqlClient.SqlCommand.ExecuteReader()", "   --- End of inner exception stack trace ---");
          return { level: "ERROR", cls: "orders", method: "Submit", msg: "Unhandled exception while processing order " + order, cont, json: { exception: cont.join("\n") } };
        }
        const cont = [
          "java.lang.IllegalStateException: Connection is closed",
          "\tat com.example.db.Pool.borrow(Pool.java:" + g.int(40, 120) + ")",
          "\tat com.example.orders.OrderRepository.save(OrderRepository.java:" + g.int(20, 80) + ")",
          "Caused by: java.net.SocketException: Connection reset",
          "\tat java.base/sun.nio.ch.NioSocketImpl.implRead(NioSocketImpl.java:323)",
          "\t... " + g.int(5, 30) + " more",
        ];
        return { level: "ERROR", cls: "repo", method: "Save", msg: "Failed to persist order " + order, cont, json: { exception: cont.join("\n") } };
      },
    },

    position: {
      label: "Position (2D/3D plot)",
      weight: 10,
      hint: "Random-walk trajectory 'Position update x=.. y=.. z=..'. Extraction table + Plot (XY, axis-equal, 3D scatter). Filter: Position update x=[*:float] y=[*:float] z=[*:float]",
      make(g) {
        const p = g.state.pos;
        p.heading += (g.rnd() - 0.5) * 0.6;
        p.x += Math.cos(p.heading) * g.float(0.2, 1.5);
        p.y += Math.sin(p.heading) * g.float(0.2, 1.5);
        p.z = Math.max(0, p.z + (g.rnd() - 0.5) * 0.4);
        return {
          level: "DEBUG", thread: "motion", cls: "tracker", method: "UpdatePosition",
          msg: "Position update x=" + p.x.toFixed(3) + " y=" + p.y.toFixed(3) + " z=" + p.z.toFixed(3),
          json: { pos: { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) } },
        };
      },
    },

    motion: {
      label: "Move/reached pairs (Link)",
      weight: 8,
      hint: "'Move requested axis=N target=T job=J' followed 50ms-4s later by 'Position reached axis=N actual=A job=J' on thread axis-N; ~6% aborted (no pair), ~5% slow. Link filter, 'Match only same' Thread or pattern 'axis=[*:int]', Δt condition, Δt (ms) column.",
      make(g, ts) {
        const axis = g.int(1, 4);
        const job = "J-" + pad(++g.state.job, 5);
        const target = g.float(-50, 50);
        const thread = "axis-" + axis;
        const req = { level: "INFO", thread, cls: "axis", method: "MoveTo", msg: "Move requested axis=" + axis + " target=" + target.toFixed(3) + " job=" + job, json: { axis, job } };
        if (g.chance(0.06)) {
          g.schedule(ts + g.int(20, 400), { level: "WARN", thread, cls: "axis", method: "Abort", msg: "Move aborted axis=" + axis + " job=" + job + " reason=" + g.pick(["limit switch", "emergency stop", "timeout"]), json: { axis, job } });
        } else {
          const dt = g.chance(0.05) ? g.int(1500, 4000) : g.int(50, 600);
          const actual = target + (g.rnd() - 0.5) * 0.02;
          g.schedule(ts + dt, { level: "INFO", thread, cls: "axis", method: "OnPositionReached", msg: "Position reached axis=" + axis + " actual=" + actual.toFixed(3) + " job=" + job, json: { axis, job } });
        }
        return req;
      },
    },

    timing: {
      label: "Durations & clock times",
      weight: 8,
      hint: "Durations with units and clock times ('completed in 87ms', 'took 3.5s', 'started at 10:15:02.113', GC pauses) plus HTTP status. [*:time] extraction, value conditions, statistics. Filter: completed in [*:int]ms",
      make(g, ts) {
        const r = g.int(0, 9);
        if (r < 5) {
          const ms = Math.round(Math.exp(g.float(2.5, 6.5)));
          const status = g.chance(0.9) ? 200 : g.pick([404, 500, 503]);
          return { level: status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO", cls: "http", method: "Send", msg: "Request GET /api/orders/" + g.int(1, 99999) + " completed in " + ms + "ms status=" + status, ctx: { req: g.reqId(), user: g.pick(USERS) }, json: { "http.status": status, durationMs: ms } };
        }
        if (r < 7) return { level: "INFO", cls: "scheduler", method: "RunBatch", msg: "Batch import finished, took " + g.float(0.5, 12).toFixed(1) + "s" };
        if (r < 9) return { level: "INFO", cls: "scheduler", method: "StartJob", msg: "Job J-" + pad(g.int(1, 99999), 5) + " started at " + formatTs(ts - g.int(0, 5000), "HH:mm:ss.SSS") };
        return { level: "DEBUG", cls: "diag", method: "OnGc", msg: "GC pause " + g.float(0.5, 40).toFixed(1) + "ms (gen" + g.int(0, 2) + ")" };
      },
    },

    sensors: {
      label: "Sensor telemetry",
      weight: 8,
      hint: "'Sensor T1 temperature=45.2 C pressure=1.013 bar voltage=229.8 V' with drifting values and rare out-of-range spikes (WARN). Value assertions, statistics, facets, line plots. Filter: temperature=[*:float>85]",
      make(g) {
        const id = g.int(1, 3);
        const s = g.state.sensors[id - 1];
        s.t += (45 - s.t) * 0.02 + (g.rnd() - 0.5) * 1.2;
        s.p += (1.013 - s.p) * 0.05 + (g.rnd() - 0.5) * 0.01;
        s.v += (230 - s.v) * 0.1 + (g.rnd() - 0.5) * 1.5;
        const spike = g.chance(0.02);
        const t = spike ? s.t + g.float(40, 60) : s.t;
        return {
          level: spike ? "WARN" : "INFO", thread: "sensor-poll", cls: "sensors", method: "Poll",
          msg: "Sensor T" + id + " temperature=" + t.toFixed(1) + " C pressure=" + s.p.toFixed(3) + " bar voltage=" + s.v.toFixed(1) + " V",
          json: { sensor: { id: "T" + id, temperature: +t.toFixed(1), pressure: +s.p.toFixed(3), voltage: +s.v.toFixed(1) } },
        };
      },
    },

    arrays: {
      label: "Array values (heatmap)",
      weight: 4,
      hint: "'Spectrum channel=A bins=[...]' — a 16-bin JSON array whose peak drifts over time (JSON Lines: 'spectrum' field). Array columns (Joined/Per index/Aggregate/Explode), Heatmap and Profile plots. Filter: Spectrum channel=[*:word] bins=[*]",
      make(g, ts) {
        const phase = (ts / 60000) % (2 * Math.PI);
        const peak = 7.5 + 6 * Math.sin(phase);
        const bins = [];
        for (let i = 0; i < 16; i++) bins.push(+(Math.exp(-((i - peak) ** 2) / 6) * 10 + g.rnd() * 0.8).toFixed(2));
        const channel = g.pick(["A", "B"]);
        return { level: "DEBUG", thread: "sensor-poll", cls: "spectro", method: "Acquire", msg: "Spectrum channel=" + channel + " bins=" + JSON.stringify(bins), json: { channel, spectrum: bins } };
      },
    },

    embedded: {
      label: "Embedded XML/JSON/dumps",
      weight: 4,
      hint: "XML and JSON fragments inside messages, .NET 'Type { A = 1, B = x }' dumps, and a pretty-printed multi-line JSON payload. Entry detail formatting/syntax highlight.",
      make(g) {
        const r = g.int(0, 3);
        if (r === 0) return { level: "INFO", cls: "control", method: "Send", msg: 'Sending control message <ctrl id="' + g.int(1, 99) + '"><cmd>' + g.pick(["reset", "home", "stop", "calibrate"]) + '</cmd><axis id="' + g.int(1, 4) + '" speed="' + g.float(0.1, 2).toFixed(2) + '"/></ctrl> successful' };
        if (r === 1) return { level: "DEBUG", cls: "http", method: "Receive", msg: 'Response received: {"status":"' + g.pick(["ok", "partial", "queued"]) + '","items":' + g.int(0, 20) + ',"latencyMs":' + g.int(1, 400) + ',"tags":["' + g.pick(TABLES) + '","v2"]} done' };
        if (r === 2) return { level: "INFO", cls: "orders", method: "Apply", msg: "Applying OrderParameters { Type = " + g.pick(["Express", "Standard", "Pickup"]) + ", Priority = " + g.int(1, 5) + ", CustomerId = " + g.guid() + ", Note =  }" };
        const payload = { orderId: "O-" + pad(g.int(1, 99999), 5), lines: [{ sku: "SKU-" + g.int(100, 999), qty: g.int(1, 9) }, { sku: "SKU-" + g.int(100, 999), qty: g.int(1, 9) }], express: g.chance(0.5) };
        return { level: "DEBUG", cls: "orders", method: "Serialize", msg: "Outgoing payload:", cont: JSON.stringify(payload, null, 2).split("\n"), json: { payload } };
      },
    },

    paths: {
      label: "File paths",
      weight: 3,
      hint: "Absolute Windows, UNC and Unix paths, quoted and bare, with spaces. Clickable file paths (desktop build), Patterns tab <path> placeholder.",
      make(g) {
        const n = g.int(1, 999);
        return g.pick([
          { level: "INFO", cls: "files", method: "LoadConfig", msg: "Loaded config from C:\\Program Files\\" + g.svc + "\\config.xml" },
          { level: "ERROR", cls: "files", method: "Export", msg: "Could not find file '\\\\fileserver\\share\\exports\\report " + (2020 + g.int(0, 6)) + ".csv'" },
          { level: "INFO", cls: "files", method: "Rotate", msg: "/var/log/" + g.svc.toLowerCase() + "/app.log rotated (" + g.int(1, 99) + " MB)" },
          { level: "DEBUG", cls: "files", method: "Snapshot", msg: "Wrote snapshot to 'D:\\Data\\Snapshots\\run " + n + "\\frame_" + pad(n, 4) + ".png'" },
          { level: "WARN", cls: "files", method: "Cleanup", msg: "Temp file \"C:\\Users\\" + g.pick(USERS) + "\\AppData\\Local\\Temp\\sim " + n + ".tmp\" still locked" },
        ]);
      },
    },

    ids: {
      label: "IDs, IPs, hex, URLs",
      weight: 5,
      hint: "GUIDs, IPv4:port, hex checksums/hashes, quoted strings and URLs in otherwise identical messages. Patterns tab clustering (<guid>, <ip>, <hex>, \"<str>\", <#>), facets, correlation keys.",
      make(g) {
        const r = g.int(0, 4);
        const user = g.pick(USERS);
        if (r === 0) return { level: "INFO", cls: "session", method: "Open", msg: "Session " + g.guid() + " opened for user \"" + user + "\" from 10.0." + g.int(0, 9) + "." + g.int(2, 250) + ":" + g.int(40000, 65000), ctx: { user } };
        if (r === 1) return { level: "WARN", cls: "files", method: "Verify", msg: "Checksum mismatch for block 0x" + g.hex(8) + ": expected 0x" + g.hex(8) + " got 0x" + g.hex(8) };
        if (r === 2) return { level: "DEBUG", cls: "http", method: "Send", msg: "GET https://api.example.com/v2/orders/" + g.int(1, 99999) + " -> 200 (" + g.int(5, 300) + " ms)", ctx: { req: g.reqId() } };
        if (r === 3) return { level: "DEBUG", cls: "repo", method: "Evict", msg: "Cache key " + g.hex(16) + " evicted" };
        return { level: "INFO", cls: "scheduler", method: "Dispatch", msg: "Worker-" + g.int(1, 8) + " picked up task " + g.int(1, 99999) };
      },
    },

    bursts: {
      label: "Error bursts",
      weight: 0.08,
      hint: "Rare bursts of 20-80 WARN/ERROR lines within about a second. Timeline minimap bars, level bar counts, Count/Time context filters, find bar navigation.",
      make(g, ts) {
        const n = g.int(20, 80);
        let t = ts;
        for (let i = 1; i < n; i++) {
          t += g.int(2, 30);
          g.schedule(t, g.chance(0.6)
            ? { level: "WARN", thread: g.pick(BASE_THREADS), cls: "repo", method: "Acquire", msg: "Connection pool exhausted (active=" + g.int(45, 50) + ", max=50)" }
            : { level: "ERROR", thread: g.pick(BASE_THREADS), cls: "http", method: "Handle", msg: "Request " + g.reqId() + " rejected: 503 Service Unavailable" });
        }
        return { level: "ERROR", cls: "repo", method: "Acquire", msg: "Connection pool saturated, rejecting new requests" };
      },
    },

    tuples: {
      label: "Tuples (name list -> value list)",
      weight: 6,
      optIn: true, // named explicitly only, never part of "all" — keeps every existing seed's output byte-identical
      hint: "Messages that list names first and values after: 'Probe offset (xo, yo, zo): (1.4 , 7.98, 9.76)', '=(1.4mm , ...)', '[cx; cy] -> [12px; 40px]', '{a/b}={3/4}', 'xs, ys: 1.2mu, 3.4mu', '<u, v> = <1.2 m, 3.4 m>', group units '(xo, yo, zo) [mm]: (...)', '(tx, ty) = (...) mm', 'xs, ys, zs: ... µm', space-separated '(gx gy gz) = (1 2 3)'. Speaking column names + units. Filters: Probe offset (xo, yo, zo)=([*:float]mm , [*:float]mm, [*:float]mm) / Gantry (gx gy gz) = ([*:float] [*:float] [*:float])",
      make(g) {
        const st = g.state.tuples || (g.state.tuples = Array.from({ length: 11 }, (_, i) => [10 + i, 20 + i, 30 + i]));
        const shape = g.int(0, 10);
        const v = st[shape];
        for (let i = 0; i < 3; i++) v[i] += (g.rnd() - 0.5) * 0.8;
        const f = (i, d) => v[i].toFixed(d === undefined ? 2 : d);
        const msgs = [
          () => "Probe offset (xo, yo, zo): (" + f(0) + " , " + f(1) + ", " + f(2) + ")",
          () => "Probe offset (xo, yo, zo)=(" + f(0) + "mm , " + f(1) + "mm, " + f(2) + "mm)",
          () => "Camera center [cx; cy] -> [" + f(0, 1) + "px; " + f(1, 1) + "px]",
          () => "Stage {a/b}={" + Math.round(v[0]) + "/" + Math.round(v[1]) + "}",
          () => "Laser xs, ys: " + f(0) + "mu, " + f(1) + "mu",
          () => "Fiducial <u, v> = <" + f(0) + " m, " + f(1) + " m>",
          () => "Probe offset (xo, yo, zo) [mm]: (" + f(0) + ", " + f(1) + ", " + f(2) + ")",
          () => "Tool tip (tx, ty) = (" + f(0) + ", " + f(1) + ") mm",
          () => "Scan pos xs, ys, zs: " + f(0) + ", " + f(1) + ", " + f(2) + " \u00b5m",
          () => "Gantry (gx gy gz) = (" + f(0) + " " + f(1) + " " + f(2) + ")",
          () => "Head (hx hy) [px]: " + f(0, 1) + " " + f(1, 1),
        ];
        return { level: "INFO", thread: "tuple-src", cls: "tracker", method: "Report", msg: msgs[shape](), json: { shape, values: v.map(x => +x.toFixed(2)) } };
      },
    },

    pytrace: {
      label: "Python tracebacks",
      weight: 2,
      optIn: true, // named explicitly only, never part of "all" — keeps every existing seed's output byte-identical
      hint: "Opt-in (not part of 'all'): multi-line ERROR entries with a Python traceback ('Traceback (most recent call last):', '  File \"x.py\", line N, in func', final 'SomeError: msg'), mixing application and site-packages frames. Entry detail Pretty view.",
      make(g) {
        const job = "J-" + pad(g.int(1, 99999), 5);
        const cont = [
          "Traceback (most recent call last):",
          '  File "/srv/app/worker.py", line ' + g.int(20, 90) + ", in run_job",
          "    result = handler(payload)",
          '  File "/srv/app/handlers.py", line ' + g.int(100, 300) + ", in handle",
          "    return client.fetch(url)",
          '  File "/usr/lib/python3.11/site-packages/requests/api.py", line ' + g.int(50, 80) + ", in get",
          "    return request('get', url, params=params, **kwargs)",
          "requests.exceptions.ConnectionError: HTTPSConnectionPool(host='api.example.org', port=443): Max retries exceeded",
        ];
        return { level: "ERROR", cls: "worker", method: "run", msg: "Job " + job + " failed", cont, json: { exception: cont.join("\n") } };
      },
    },

    ties: {
      label: "Same-timestamp clusters",
      weight: 1,
      optIn: true, // named explicitly only, never part of "all" — keeps every existing seed's output byte-identical
      hint: "Opt-in (not part of 'all'): one control-loop tick logs 3-6 steps 'Tick N step k/M' at the exact same millisecond; under the mixed format the steps alternate between default and syslog lines. Same-timestamp log order (merge, meta format split, OR filter).",
      make(g, ts) {
        const tick = ++g.state.tick;
        const n = g.int(3, 6);
        const step = k => ({ level: "DEBUG", thread: "control-loop", cls: "scheduler", method: "Tick", msg: "Tick " + tick + " step " + k + "/" + n, syslog: k % 2 === 0 });
        for (let k = 2; k <= n; k++) g.schedule(ts, step(k));
        return step(1);
      },
    },

    grouped: {
      label: "Thousands separators",
      weight: 4,
      optIn: true, // named explicitly only, never part of "all" — keeps every existing seed's output byte-identical
      hint: "Opt-in (not part of 'all'): numbers written with thousands separators, below and above 1000 — 'Throughput 1,234.5 msg/s' (en), 'Meter reading 12.345,6 kWh' (de), both unambiguous, and 'Batch imported 12,345 records' (en integer, ambiguous without a format). Filters: Throughput [*:float] msg/s, Batch imported [*:int@en] records",
      make(g) {
        const r = g.int(0, 2);
        if (r === 0) return { level: "INFO", cls: "scheduler", method: "Report", msg: "Throughput " + groupThousands(g.float(200, 5000), 1, ",", ".") + " msg/s" };
        if (r === 1) return { level: "INFO", cls: "sensors", method: "Poll", msg: "Meter reading " + groupThousands(g.float(500, 50000), 1, ".", ",") + " kWh" };
        return { level: "INFO", cls: "repo", method: "Import", msg: "Batch imported " + groupThousands(g.int(100, 20000), 0, ",", ".") + " records" };
      },
    },

    gaps: {
      label: "Idle gaps",
      weight: 0,
      hint: "Occasional pauses of 5 s to 10 min between entries (no lines of its own). Gap filter, timeline minimap holes, time-range filters, folder-watch time ranges.",
    },

    levels: {
      label: "Extra levels",
      weight: 3,
      hint: "TRACE, VERBOSE, NOTICE and FATAL entries. Per-format custom levels/colors (the exported formats declare them); under the default format FATAL cascades to ERROR and NOTICE/VERBOSE land in OTHER.",
      make(g) {
        return g.pick([
          { level: "TRACE", cls: "diag", method: "Enter", msg: "Entering " + g.pick(["Submit", "Poll", "MoveTo", "Save"]) + "()" },
          { level: "VERBOSE", cls: "diag", method: "Dump", msg: "Dumping state of " + g.int(8, 64) + " registers" },
          { level: "NOTICE", cls: "diag", method: "Reload", msg: "Configuration reloaded (" + g.int(1, 12) + " keys changed)" },
          { level: "FATAL", cls: "diag", method: "OnCrash", msg: "Out of memory in worker pool, shutting down worker-" + g.int(1, 4) },
        ]);
      },
    },

    text: {
      label: "Unicode & long lines",
      weight: 2,
      hint: "Umlauts, CJK, emoji, typographic quotes and occasional 2-4 KB single-line messages. Word wrap toggle, find bar, text rendering.",
      make(g) {
        const n = g.int(1, 99999);
        if (g.chance(0.1)) {
          const parts = [];
          const len = g.int(2000, 4000);
          for (let i = 0; parts.join("; ").length < len; i++) parts.push("key" + i + "=" + g.hex(6));
          return { level: "DEBUG", cls: "l10n", method: "Trace", msg: "Long payload: " + parts.join("; ") };
        }
        return g.pick([
          { level: "INFO", cls: "l10n", method: "Audit", msg: "Benutzer „Jürgen Müller“ hat Auftrag " + n + " geändert ✓" },
          { level: "INFO", cls: "l10n", method: "Audit", msg: "注文 " + n + " を処理しました" },
          { level: "INFO", cls: "l10n", method: "Deploy", msg: "Deploy " + n + " finished 🚀 status=green 🎉" },
          { level: "WARN", cls: "l10n", method: "Render", msg: "Glyph missing for 'Ω≈ç√∫' in font \"Segoe UI\"" },
        ]);
      },
    },
  };

  // ---------------------------------------------------------------- formats
  //
  // render(e, g) -> array of physical lines. `exportFormat(prefix, ext)`
  // returns PhiLogg's own log-format export ({format:"philogg-log-format"}),
  // importable via Open -> Import..., or null when PhiLogg parses the output
  // out of the box. Keep the regexes in sync with what render() writes.

  const LEVEL_COLORS = { FATAL: "#b0306a", NOTICE: "#3d8bd9", VERBOSE: "#8a8f98" };
  const TEXT_LEVELS = ["FATAL", "ERROR", "WARN", "NOTICE", "INFO", "DEBUG", "VERBOSE", "TRACE"];
  const textLevelDefs = () => TEXT_LEVELS.map(n => ({ value: n, name: n, color: LEVEL_COLORS[n] || null }));

  // RFC 5424 PRI for facility local0 (16): 128 + severity.
  const SYSLOG_PRI = { FATAL: 130, ERROR: 131, WARN: 132, NOTICE: 133, INFO: 134, DEBUG: 135, VERBOSE: 135, TRACE: 135 };
  const SYSLOG_LEVEL_DEFS = [
    { value: "130", name: "FATAL", color: LEVEL_COLORS.FATAL },
    { value: "131", name: "ERROR", color: null },
    { value: "132", name: "WARN", color: null },
    { value: "133", name: "NOTICE", color: LEVEL_COLORS.NOTICE },
    { value: "134", name: "INFO", color: null },
    { value: "135", name: "DEBUG", color: null },
  ];

  const oneLine = s => String(s).replace(/[\t\r\n]+/g, " ");

  function exportDoc(logFormat, prefix, ext) {
    return { format: "philogg-log-format", version: 1, savedAt: "2026-01-01T00:00:00.000Z", logFormat, fileNamePatterns: [prefix + "*" + ext] };
  }

  const DEFAULT_COLS = [
    { key: "thread", kind: "default", label: "Thread" },
    { key: "location", kind: "default", label: "Location" },
    { key: "method", kind: "default", label: "Method" },
  ];

  function renderDefault(e) {
    return [formatTs(e.ts, "yyyy-MM-dd HH:mm:ss,SSS") + "\t" + e.level + '\t"' + e.thread + '"\t' + e.file + "\tline " + e.line + "\t[" + e.method + ']\t"' + oneLine(e.msg) + '"'].concat(e.cont || []);
  }

  // --ts-offset <Z|±HH:MM>: the ISO timestamps (syslog, JSON Lines) are written
  // as that zone's wall clock plus its offset suffix — the same instant as
  // the unshifted time, which syslog has always written as UTC ("…Z").
  // "Z" and "+00:00" are the same instant, only the suffix differs.
  function parseTsOffset(s) {
    if (s == null || s === "") return null;
    const m = /^(?:(Z)|([+-])(\d{2}):(\d{2}))$/.exec(String(s).trim());
    if (!m || (m[3] !== undefined && (+m[3] > 23 || +m[4] > 59))) throw new Error("Invalid --ts-offset '" + s + "' (expected Z or +HH:MM / -HH:MM)");
    return m[1] ? { minutes: 0, label: "Z" } : { minutes: (m[2] === "-" ? -1 : 1) * (+m[3] * 60 + +m[4]), label: m[2] + m[3] + ":" + m[4] };
  }
  function formatTsOffset(ms, fmt, g) {
    const off = g && g.tsOffset;
    return off ? formatTs(ms + off.minutes * 60000, fmt) + off.label : null;
  }

  function renderSyslog(e, g) {
    const sd = e.ctx.req || e.ctx.user ? '[ctx@32473' + (e.ctx.req ? ' req="' + e.ctx.req + '"' : "") + (e.ctx.user ? ' user="' + e.ctx.user + '"' : "") + "]" : "-";
    return ["<" + SYSLOG_PRI[e.level] + ">1 " + (formatTsOffset(e.ts, "yyyy-MM-ddTHH:mm:ss.SSS", g) || formatTs(e.ts, "yyyy-MM-ddTHH:mm:ss.SSS") + "Z") + " " + e.host + " " + e.app + " " + e.thread + " " + e.cls.toUpperCase() + " " + sd + " " + oneLine(e.msg)].concat(e.cont || []);
  }

  const SYSLOG_EXPORT = {
    name: "Simulator: RFC 5424 syslog",
    mode: "regex",
    regex: "^<(?<level>\\d{1,3})>1 (?<ts>\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}(?:Z|[+-]\\d{2}:?\\d{2})) (?<host>\\S+) (?<app>\\S+) (?<thread>\\S+) (?<msgid>\\S+) (?<sd>-|\\[[^\\]]*\\]) (?<message>.*)$",
    tsFormat: "yyyy-MM-ddTHH:mm:ss.SSSXXX",
    levels: SYSLOG_LEVEL_DEFS,
    levelValueType: "int",
    columnDefs: [
      { key: "host", kind: "custom", label: "Host" },
      { key: "app", kind: "custom", label: "App" },
      { key: "thread", kind: "default", label: "Thread" },
      { key: "msgid", kind: "custom", label: "Msg ID" },
      { key: "sd", kind: "custom", label: "Structured data" },
    ],
    messageVisible: true,
  };

  const JSON_COLUMNS = [
    ["thread_", "thread"], ["logger", "logger"], ["ctx_req_id", "ctx.req.id"], ["ctx_user", "ctx.user"], ["ctx_tenant", "ctx.tenant"],
    ["http_status", '["http.status"]'], ["durationMs", "durationMs"], ["tags", "tags"], ["axis", "axis"], ["job", "job"],
    ["pos_x", "pos.x"], ["pos_y", "pos.y"], ["pos_z", "pos.z"], ["sensor_id", "sensor.id"], ["sensor_temperature", "sensor.temperature"],
    ["channel", "channel"], ["spectrum", "spectrum"], ["exception", "exception"],
  ];

  const FORMATS = {
    default: {
      label: "Default (log4net-style, builtin)",
      ext: ".log",
      hint: "PhiLogg's builtin format %d\\t%p\\t\"%t\"\\t%c\\t[%M]\\t\"%m\"%n — opens with no setup; native parser eligible.",
      render: renderDefault,
      exportFormat: () => null,
    },
    custom: {
      label: "Custom columns (regex format)",
      ext: ".log",
      hint: "log4j-like line with MDC custom columns requestId/user/tenant. Needs the format definition PhiLogg imports (written next to the output). Custom columns, column visibility, 'Filter for this ___', Link key on a custom column.",
      render(e) {
        return [formatTs(e.ts, "yyyy-MM-dd HH:mm:ss.SSS") + " [" + e.thread + "] " + e.level.padEnd(5) + " " + e.logger + "#" + e.method +
          " {req=" + (e.ctx.req || "-") + " user=" + (e.ctx.user || "-") + " tenant=" + e.ctx.tenant + "} " + oneLine(e.msg)].concat(e.cont || []);
      },
      exportFormat: (prefix, ext) => exportDoc({
        name: "Simulator: custom columns",
        mode: "regex",
        regex: "^(?<ts>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3}) \\[(?<thread>[^\\]]+)\\] (?<level>[A-Z]+)\\s+(?<location>[^#\\s]+)#(?<method>\\S+) \\{req=(?<requestId>\\S+) user=(?<user>\\S+) tenant=(?<tenant>[^}]*)\\} (?<message>.*)$",
        tsFormat: "yyyy-MM-dd HH:mm:ss.SSS",
        levels: textLevelDefs(),
        columnDefs: DEFAULT_COLS.concat([
          { key: "requestId", kind: "custom", label: "Request Id" },
          { key: "user", kind: "custom", label: "User" },
          { key: "tenant", kind: "custom", label: "Tenant" },
        ]),
        messageVisible: true,
      }, prefix, ext),
    },
    bracket: {
      label: "Bracket (like examples/bracket-format.log)",
      ext: ".log",
      hint: "'[ts] LEVEL (thread) message' — needs the format definition PhiLogg imports (written next to the output). Format dialog examples, custom level colors (FATAL/NOTICE/VERBOSE).",
      render(e) {
        return ["[" + formatTs(e.ts, "yyyy-MM-dd HH:mm:ss.SSS") + "] " + e.level + " (" + e.thread + ") " + oneLine(e.msg)].concat(e.cont || []);
      },
      exportFormat: (prefix, ext) => exportDoc({
        name: "Simulator: bracket",
        mode: "regex",
        regex: "^\\[(?<ts>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\] (?<level>[A-Z]+) \\((?<thread>[^)]*)\\) (?<message>.*)$",
        tsFormat: "yyyy-MM-dd HH:mm:ss.SSS",
        levels: textLevelDefs(),
        columnDefs: [{ key: "thread", kind: "default", label: "Thread" }],
        messageVisible: true,
      }, prefix, ext),
    },
    jsonl: {
      label: "JSON Lines",
      ext: ".jsonl",
      hint: "One JSON object per line: nested ctx, a literal dotted key \"http.status\", arrays (tags, spectrum), pos/sensor objects, exception text. Needs the format definition PhiLogg imports (written next to the output). JSON Lines kind, JSON path columns, array columns.",
      render(e, g) {
        const o = { ts: formatTsOffset(e.ts, "yyyy-MM-ddTHH:mm:ss.SSS", g) || formatTs(e.ts, "yyyy-MM-ddTHH:mm:ss.SSS"), level: e.level.toLowerCase(), msg: e.cont && !e.json.exception ? e.msg + "\n" + e.cont.join("\n") : e.msg, thread: e.thread, logger: e.logger };
        const ctx = {};
        if (e.ctx.req) ctx.req = { id: e.ctx.req };
        if (e.ctx.user) ctx.user = e.ctx.user;
        ctx.tenant = e.ctx.tenant;
        o.ctx = ctx;
        Object.assign(o, e.json);
        return [JSON.stringify(o)];
      },
      exportFormat: (prefix, ext) => exportDoc({
        name: "Simulator: JSON Lines",
        mode: "json",
        tsKey: "ts", levelKey: "level", messageKey: "msg", tsFormat: "",
        levels: textLevelDefs(),
        columnDefs: JSON_COLUMNS.map(([key, path]) => ({ key, kind: "custom", label: path, path })),
        messageVisible: true,
      }, prefix, ext),
    },
    syslog: {
      label: "RFC 5424 syslog (numeric levels)",
      ext: ".log",
      hint: "'<134>1 ts host app procid MSGID [sd] msg' — the level is the numeric PRI (local0), mapped per code. Needs the format definition PhiLogg imports (written next to the output). Integer level mode, custom columns Host/App/Msg ID.",
      render: renderSyslog,
      exportFormat: (prefix, ext) => exportDoc(SYSLOG_EXPORT, prefix, ext),
    },
    mixed: {
      label: "Mixed default + syslog (meta format)",
      ext: ".log",
      hint: "Default-format lines interleaved with syslog lines (sensor/position telemetry). Import the syslog format definition (written next to the output), then add a Meta format with targets [Simulator: RFC 5424 syslog, Default] and a filename rule. Meta format split, Sources grouping.",
      render: (e, g) => (e.syslog || e.scenario === "sensors" || e.scenario === "position" ? renderSyslog(e, g) : renderDefault(e, g)),
      exportFormat: (prefix, ext) => exportDoc(SYSLOG_EXPORT, prefix, ext),
    },
    plain: {
      label: "Plain text (no timestamps)",
      ext: ".txt",
      hint: "Bare messages, one per line, continuation lines as their own lines. Loads as one plain-text file node (line-number time axis).",
      render: e => [oneLine(e.msg)].concat(e.cont || []),
      exportFormat: () => null,
    },
    jsondoc: {
      label: "JSON document (single minified document)",
      ext: ".json",
      hint: "ONE valid JSON document written minified on a single line: {service, entries:[{ts, level, thread, logger, msg, data}]} with nested objects/arrays from the scenarios' payloads. Loads as one plain-text file node; Pretty vs Raw layout, JSON folding/highlighting. Not tailable (--follow).",
      document: { head: g => '{"service":"' + g.svc + '","format":1,"entries":[', sep: ",", tail: "]}" },
      render(e) {
        return [JSON.stringify({ ts: formatTs(e.ts, "yyyy-MM-ddTHH:mm:ss.SSS"), level: e.level.toLowerCase(), thread: e.thread, logger: e.logger, msg: e.cont && !e.json.exception ? e.msg + "\n" + e.cont.join("\n") : e.msg, data: e.json })];
      },
      exportFormat: () => null,
    },
    xmldoc: {
      label: "XML document (single document)",
      ext: ".xml",
      hint: "ONE well-formed XML document, one <entry> per line under <log service=...>, with the scenarios' payloads as nested elements. Loads as one plain-text file node; XML folding/highlighting. Not tailable (--follow).",
      document: { head: g => '<?xml version="1.0" encoding="UTF-8"?>\n<log service="' + g.svc + '">\n', sep: "\n", tail: "\n</log>\n" },
      render(e) {
        const esc = v => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const tag = k => String(k).replace(/[^A-Za-z0-9_.-]/g, "_").replace(/^([^A-Za-z_])/, "_$1");
        const el = (k, v) => Array.isArray(v) ? v.map(x => el(k, x)).join("")
          : v && typeof v === "object" ? "<" + tag(k) + ">" + Object.keys(v).map(kk => el(kk, v[kk])).join("") + "</" + tag(k) + ">"
          : "<" + tag(k) + ">" + esc(v) + "</" + tag(k) + ">";
        const msg = e.cont && !e.json.exception ? e.msg + "\n" + e.cont.join("\n") : e.msg;
        return ['  <entry ts="' + formatTs(e.ts, "yyyy-MM-ddTHH:mm:ss.SSS") + '" level="' + e.level + '" thread="' + esc(e.thread) + '"><message>' + esc(msg) + "</message>" + el("data", e.json) + "</entry>"];
      },
      exportFormat: () => null,
    },
  };

  // ---------------------------------------------------------------- generator

  const DEFAULTS = {
    format: "default",
    scenarios: "all",
    seed: 1,
    start: "2026-01-15T08:00:00",
    rate: 10,          // average entries per second
    service: 0,        // index into SERVICES (parallel files get distinct ones)
    eol: "\n",
  };

  function normalizeScenarios(list) {
    const all = () => Object.keys(SCENARIOS).filter(n => !SCENARIOS[n].optIn);
    if (list == null || list === "all") return all();
    const arr = Array.isArray(list) ? list : String(list).split(",");
    const names = arr.map(s => String(s).trim()).filter(Boolean);
    if (names.includes("all")) {
      const excluded = new Set(names.filter(n => n.startsWith("-")).map(n => n.slice(1)));
      return all().filter(n => !excluded.has(n));
    }
    names.forEach(n => { if (!SCENARIOS[n]) throw new Error("Unknown scenario '" + n + "' (known: " + Object.keys(SCENARIOS).join(", ") + ")"); });
    return names;
  }

  function createGenerator(options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const fmt = FORMATS[o.format];
    if (!fmt) throw new Error("Unknown format '" + o.format + "' (known: " + Object.keys(FORMATS).join(", ") + ")");
    const enabled = normalizeScenarios(o.scenarios);
    const active = enabled.filter(n => SCENARIOS[n].weight > 0);
    if (!active.length) active.push("basic");
    const totalWeight = active.reduce((s, n) => s + SCENARIOS[n].weight, 0);
    const gaps = enabled.includes("gaps");
    const rnd = mulberry32(o.seed);
    const svc = SERVICES[o.service % SERVICES.length];
    const start = typeof o.start === "number" ? o.start : parseNaive(o.start);
    if (isNaN(start)) throw new Error("Invalid start time '" + o.start + "' (expected e.g. 2026-01-15T08:00:00)");
    const meanGap = 1000 / Math.max(0.001, +o.rate || DEFAULTS.rate);
    const tsOffset = parseTsOffset(o.tsOffset);

    const pending = []; // follow-up entries, kept sorted by ts
    let lastTs = start;
    let emitted = 0;

    const g = {
      svc,
      rnd,
      int: (a, b) => a + Math.floor(rnd() * (b - a + 1)),
      float: (a, b) => a + rnd() * (b - a),
      chance: p => rnd() < p,
      pick: arr => arr[Math.floor(rnd() * arr.length)],
      tsOffset,
      hex: n => { let s = ""; for (let i = 0; i < n; i++) s += "0123456789abcdef"[Math.floor(rnd() * 16)]; return s; },
      guid: () => g.hex(8) + "-" + g.hex(4) + "-4" + g.hex(3) + "-a" + g.hex(3) + "-" + g.hex(12),
      reqId: () => "r-" + g.hex(6),
      svcRoot: () => "C:\\src\\" + svc,
      schedule(ts, entry) {
        entry.ts = ts;
        let i = pending.length;
        while (i > 0 && pending[i - 1].ts > ts) i--;
        pending.splice(i, 0, entry);
      },
      state: {
        pos: { x: 0, y: 0, z: 1, heading: 0 },
        job: 0,
        sensors: [0, 1, 2].map(i => ({ t: 40 + i * 5, p: 1.013, v: 230 })),
        tick: 0,
      },
    };

    function pickScenario() {
      let r = rnd() * totalWeight;
      for (const n of active) { r -= SCENARIOS[n].weight; if (r < 0) return n; }
      return active[active.length - 1];
    }

    function finish(e) {
      const c = CLASSES[e.cls] || CLASSES.scheduler;
      e.thread = e.thread || g.pick(BASE_THREADS);
      e.method = e.method || "Run";
      e.logger = svc + "." + c[0] + "." + c[1];
      e.file = "C:\\src\\" + svc + "\\" + c[0] + "\\" + c[1] + ".cs";
      e.line = 10 + strHash(e.cls + "." + e.method) % 400;
      e.ctx = Object.assign({ tenant: TENANTS[strHash(e.thread + svc) % TENANTS.length] }, e.ctx);
      e.json = e.json || {};
      e.host = svc.toLowerCase() + "-01";
      e.app = svc.toLowerCase() + "-svc";
      return e;
    }

    // One entry. `now` (live mode) pins the new entry's time instead of the
    // simulated inter-arrival clock; due follow-ups are still emitted first.
    function next(now) {
      let t;
      if (now != null) t = Math.max(now, lastTs);
      else {
        t = lastTs + Math.max(1, Math.round(-Math.log(1 - rnd()) * meanGap));
        if (gaps && emitted > 0 && rnd() < 0.003) t += g.int(5000, 600000);
      }
      let e;
      if (pending.length && pending[0].ts <= t) e = pending.shift();
      else {
        const name = pickScenario();
        e = SCENARIOS[name].make(g, t);
        e.scenario = e.scenario || name;
        e.ts = t;
        // Scheduled follow-ups inherit the scenario of the entry that made them.
        pending.forEach(p => { if (!p.scenario) p.scenario = name; });
      }
      lastTs = e.ts;
      emitted++;
      return finish(e);
    }

    return {
      options: o,
      format: fmt,
      generator: g,
      next,
      render: e => fmt.document ? fmt.render(e, g).join("") : fmt.render(e, g).join(o.eol) + o.eol,
      get lastTs() { return lastTs; },
    };
  }

  // ---------------------------------------------------------------- batch output
  //
  // generateFiles(opts) yields { type: "file", name, index } before each file
  // and { type: "chunk", text } for its content (~64 KB pieces), so a caller
  // can stream 1 GB without holding it. Limits (entries / size) are per file.
  //   files: N, layout: "rotate" (one timeline split across files, oldest
  //   first — folder watch) | "parallel" (one service per file, same time
  //   range, own seed — merging), skew: ms added per file index (clock offset).
  function* generateFiles(options) {
    const o = Object.assign({ files: 1, layout: "rotate", skew: 0, prefix: null }, options || {});
    const fmt = FORMATS[o.format || DEFAULTS.format];
    if (!fmt) throw new Error("Unknown format '" + o.format + "'");
    const maxEntries = o.entries != null ? +o.entries : (o.size != null ? Infinity : 1000);
    const maxBytes = o.size != null ? (typeof o.size === "number" ? o.size : parseSize(o.size)) : Infinity;
    if (isNaN(maxBytes)) throw new Error("Invalid size '" + o.size + "' (e.g. 500k, 10MB, 1.5GB)");
    const prefix = o.prefix || "sim-" + (o.format || DEFAULTS.format);
    const fileCount = Math.max(1, o.files | 0);
    let shared = null;
    for (let i = 0; i < fileCount; i++) {
      const name = fileCount === 1 && o.singleName ? o.singleName : prefix + "-" + (i + 1) + fmt.ext;
      let gen;
      if (o.layout === "parallel") {
        const startMs = typeof o.start === "number" ? o.start : parseNaive(o.start || DEFAULTS.start);
        gen = createGenerator(Object.assign({}, o, { seed: (o.seed || DEFAULTS.seed) + i * 7919, service: i, start: startMs + i * (+o.skew || 0) }));
      } else gen = shared = shared || createGenerator(o);
      yield { type: "file", name, index: i };
      const doc = fmt.document;
      let buf = doc ? doc.head(gen.generator) : "", bytes = utf8Length(buf), n = 0;
      while (n < maxEntries && bytes < maxBytes) {
        const text = (doc && n ? doc.sep : "") + gen.render(gen.next());
        buf += text;
        bytes += utf8Length(text);
        n++;
        if (buf.length >= 65536) { yield { type: "chunk", text: buf }; buf = ""; }
      }
      if (doc) { buf += doc.tail; bytes += utf8Length(doc.tail); }
      if (buf) yield { type: "chunk", text: buf };
      yield { type: "end", name, entries: n, bytes };
    }
  }

  // Convenience for small outputs/tests: [{ name, text, entries, bytes }].
  function generateToStrings(options) {
    const out = [];
    let cur = null;
    for (const ev of generateFiles(options)) {
      if (ev.type === "file") out.push(cur = { name: ev.name, text: "" });
      else if (ev.type === "chunk") cur.text += ev.text;
      else { cur.entries = ev.entries; cur.bytes = ev.bytes; }
    }
    return out;
  }

  function formatExport(formatName, prefix) {
    const fmt = FORMATS[formatName];
    if (!fmt) throw new Error("Unknown format '" + formatName + "'");
    return fmt.exportFormat(prefix || "sim-" + formatName, fmt.ext);
  }

  // ---------------------------------------------------------------- ZIP (stored)
  //
  // Minimal ZIP writer (method 0, no compression) — PhiLogg's ZIP reader
  // accepts stored entries, and a writer this small needs no dependency.
  let CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const DOS_DATE_1980 = (1 << 5) | 1; // 1980-01-01, the DOS epoch — keeps output deterministic

  // files: [{ name, data: Uint8Array }] -> Uint8Array
  function zipStore(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const crc = crc32(f.data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint16(12, DOS_DATE_1980, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, f.data.length, true);
      local.setUint32(22, f.data.length, true);
      local.setUint16(26, nameBytes.length, true);
      parts.push(new Uint8Array(local.buffer), nameBytes, f.data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(14, DOS_DATE_1980, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, f.data.length, true);
      cd.setUint32(24, f.data.length, true);
      cd.setUint16(28, nameBytes.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nameBytes);
      offset += 30 + nameBytes.length + f.data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let pos = 0;
    for (const p of all) { out.set(p, pos); pos += p.length; }
    return out;
  }

  return {
    SCENARIOS, FORMATS, DEFAULTS,
    createGenerator, generateFiles, generateToStrings, formatExport, normalizeScenarios,
    formatTs, parseTsOffset, parseNaive, naiveNow, parseSize, utf8Length, zipStore, crc32,
  };
});
