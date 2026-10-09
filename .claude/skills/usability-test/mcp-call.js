// MCP client for the usability driver's mcp mode — what Claude Code would send and show.
// Usage: node mcp-call.js --list [port]                  tools/list: name, description, input schema
//        node mcp-call.js <tool> ['<json args>'] [port]  tools/call: prints the tool's text answer
// After a call it prints a "--" line with isError, the screenshot of what the person now sees
// in the PhiLogg window, and the page errors the call caused (if any).
const http = require("http");
const [first, second, third] = process.argv.slice(2);
if (!first) { console.error("usage: mcp-call.js --list [port] | <tool> ['<json args>'] [port]"); process.exit(2); }
const list = first === "--list";
const port = +(list ? second : third) || 9333;
let args = {};
if (!list && second) {
  try { args = JSON.parse(second); } catch (e) { console.error("arguments are not JSON: " + e.message); process.exit(2); }
}
const msg = list ? { jsonrpc: "2.0", id: 1, method: "tools/list" }
  : { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: first, arguments: args } };
const req = http.request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { "Content-Type": "application/json" } }, res => {
  let body = "";
  res.on("data", c => body += c);
  res.on("end", () => {
    const reply = JSON.parse(body);
    if (reply.error) { console.log(`JSON-RPC error ${reply.error.code}: ${reply.error.message}`); process.exit(1); }
    if (list) {
      for (const t of reply.result.tools) console.log(`## ${t.name}\n${t.description}\ninput: ${JSON.stringify(t.inputSchema)}\n`);
      return;
    }
    console.log(reply.result.content.map(c => c.text).join("\n"));
    const errors = JSON.parse(decodeURIComponent(res.headers["x-driver-page-errors"] || "%5B%5D"));
    console.log(`-- isError: ${reply.result.isError} · person sees: ${res.headers["x-driver-shot"]}` +
      (errors.length ? ` · page errors: ${JSON.stringify(errors)}` : ""));
  });
});
req.on("error", e => { console.error("driver not reachable: " + e.message); process.exit(1); });
req.end(JSON.stringify(msg));
