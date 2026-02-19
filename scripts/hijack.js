// PocketClaw hijack.js — Loaded via NODE_OPTIONS="-r /root/hijack.js"

// 0. Enable V8 compile cache (caches bytecode to disk, faster restarts)
try { require("module").enableCompileCache(); } catch (e) {}

// NOTE: node22 (no ICU) CANNOT work — OpenClaw uses Unicode regex \p{L} which requires ICU.
// node22-icu is mandatory. The 7 MB binary size overhead is the cost of Unicode support.

// 1. Fix os.networkInterfaces (broken in proot)
const os = require("os");
os.networkInterfaces = () => ({});

// 1a. Redirect /tmp and /root → real paths (Android has no /tmp or writable /root)
const _fs0 = require("fs");
const _REAL_TMP = (process.env.TMPDIR || "/data/data/com.termux/files/usr/tmp");
const _REAL_HOME = (process.env.HOME || "/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu/root");
function _fixPath(p) {
  if (typeof p !== "string") return p;
  if (p === "/tmp" || p.startsWith("/tmp/")) return _REAL_TMP + p.slice(4);
  if (p === "/root" || p.startsWith("/root/")) return _REAL_HOME + p.slice(5);
  return p;
}
["mkdirSync","mkdir","writeFileSync","writeFile","readFileSync","readFile",
 "openSync","open","statSync","stat","lstatSync","lstat","existsSync",
 "unlinkSync","unlink","readdirSync","readdir","rmdirSync","rmdir",
 "appendFileSync","appendFile","createWriteStream","createReadStream",
 "renameSync","rename","chmodSync","chmod","accessSync","access",
 "copyFileSync","copyFile","rmSync","rm"].forEach(function(fn) {
  if (typeof _fs0[fn] === "function") {
    var orig = _fs0[fn];
    _fs0[fn] = function() {
      if (arguments.length > 0) arguments[0] = _fixPath(arguments[0]);
      return orig.apply(this, arguments);
    };
  }
});
// Also patch fs.promises (OpenClaw uses async fs operations like fs.promises.mkdir)
if (_fs0.promises) {
  ["mkdir","writeFile","readFile","open","stat","lstat","unlink",
   "readdir","rmdir","appendFile","rename","chmod","access",
   "copyFile","rm"].forEach(function(fn) {
    if (typeof _fs0.promises[fn] === "function") {
      var orig = _fs0.promises[fn];
      _fs0.promises[fn] = function() {
        if (arguments.length > 0) arguments[0] = _fixPath(arguments[0]);
        return orig.apply(this, arguments);
      };
    }
  });
}

// 1b. Lazy loading — defer unused modules until first access (v3: lazy proxies)
// Unlike stubs, lazy-loaded modules are NOT broken — they load on first real use.
// This makes PocketClaw MORE capable than base OpenClaw: everything works, only what
// you use consumes RAM. Add Discord on Tuesday, it loads on the first message.
const _Module = require("module");
const _origRequire = _Module.prototype.require;
const _origLoad = _Module._load;

// Module registry — ALL OpenClaw providers and channels with metadata.
// Status per module: "active" (always loaded), "lazy" (deferred), "dead" (stubbed).
// User overrides stored in modules.json survive restarts.
const _MODULES_FILE = "/sdcard/pocketclaw/modules.json";
const _ALL_MODULES = [
  // AI Providers
  { id:"openai",     name:"OpenAI",       type:"provider", key:"OPENAI_API_KEY",     pkgs:["openai"],                                    ram:4, def:"lazy" },
  { id:"anthropic",  name:"Anthropic",    type:"provider", key:"ANTHROPIC_API_KEY",  pkgs:["@anthropic-ai"],                             ram:3, def:"dead" },
  { id:"google",     name:"Google Gemini",type:"provider", key:"GEMINI_API_KEY",     pkgs:["@google"],                                   ram:5, def:"dead" },
  { id:"mistral",    name:"Mistral",      type:"provider", key:"MISTRAL_API_KEY",    pkgs:["@mistralai"],                                ram:2, def:"dead" },
  { id:"cohere",     name:"Cohere",       type:"provider", key:"COHERE_API_KEY",     pkgs:["cohere-ai"],                                 ram:2, def:"dead" },
  { id:"aws",        name:"AWS Bedrock",  type:"provider", key:"AWS_ACCESS_KEY_ID",  pkgs:["@aws-sdk","@aws-crypto","@aws","@smithy"],   ram:8, def:"dead" },
  { id:"huggingface",name:"HuggingFace",  type:"provider", key:"HF_TOKEN",           pkgs:["@huggingface"],                              ram:2, def:"dead" },
  { id:"cloudflare", name:"Cloudflare",   type:"provider", key:"CF_API_TOKEN",       pkgs:["@cloudflare"],                               ram:2, def:"dead" },
  { id:"groq",       name:"Groq",         type:"provider", key:"GROQ_API_KEY",       pkgs:[],                                            ram:0, def:"lazy" },
  { id:"xai",        name:"xAI (Grok)",   type:"provider", key:"XAI_API_KEY",        pkgs:[],                                            ram:0, def:"lazy" },
  { id:"cerebras",   name:"Cerebras",     type:"provider", key:"CEREBRAS_API_KEY",   pkgs:[],                                            ram:0, def:"lazy" },
  { id:"openrouter", name:"OpenRouter",   type:"provider", key:"OPENROUTER_API_KEY", pkgs:[],                                            ram:0, def:"lazy" },
  // Channels
  { id:"telegram",   name:"Telegram",     type:"channel",  key:"TELEGRAM_BOT_TOKEN", pkgs:[],                                            ram:0, def:"active" },
  { id:"discord",    name:"Discord",      type:"channel",  key:"DISCORD_BOT_TOKEN",  pkgs:["discord.js","@discordjs","@buape/carbon"],   ram:8, def:"dead" },
  { id:"whatsapp",   name:"WhatsApp",     type:"channel",  key:null,                 pkgs:["@whiskeysockets","libsignal"],                ram:12,def:"dead" },
  { id:"slack",      name:"Slack",        type:"channel",  key:"SLACK_BOT_TOKEN",    pkgs:["@slack"],                                    ram:4, def:"dead" },
  { id:"line",       name:"LINE",         type:"channel",  key:"LINE_CHANNEL_TOKEN", pkgs:["@line"],                                     ram:3, def:"dead" },
  { id:"lark",       name:"Lark/Feishu",  type:"channel",  key:"LARK_APP_ID",        pkgs:["@larksuiteoapi"],                            ram:3, def:"dead" },
];

// Read user overrides (dead↔lazy) from modules.json
let _moduleOverrides = {};
try {
  _moduleOverrides = JSON.parse(_fs0.readFileSync(_MODULES_FILE, "utf8"));
} catch(e) {}

// Compute _DEAD_PKGS and _LAZY_PKGS from registry + overrides
let _restartNeeded = false;
function _getModuleStatus(m) {
  if (_moduleOverrides[m.id] !== undefined) return _moduleOverrides[m.id];
  return m.def;
}
const _DEAD_PKGS = [];
const _LAZY_PKGS_FROM_MODULES = [];
_ALL_MODULES.forEach(function(m) {
  var st = _getModuleStatus(m);
  if (st === "dead") m.pkgs.forEach(function(p) { _DEAD_PKGS.push(p); });
  else if (st === "lazy") m.pkgs.forEach(function(p) { _LAZY_PKGS_FROM_MODULES.push(p); });
});

// Packages to lazy-load (by category). All are available — just deferred.
// Using namespace prefixes (e.g. "@smithy") catches ALL sub-packages.
const _LAZY_PKGS = _LAZY_PKGS_FROM_MODULES.concat([
  // --- GitHub / Octokit ---
  "octokit", "@octokit",
  // --- Heavy features (load on first use) ---
  "highlight.js", "highlight.js/lib/core", "cli-highlight",
  "source-map", "source-map-support",
  "@homebridge",
  "@mariozechner",
  "qrcode-terminal",
  "node-edge-tts",
  "@clack",
  "osc-progress",
  "diff",
  "marked", "turndown", "markdown-it",
  "sharp", "@img", "@silvia-odwyer",
  "pdfjs-dist", "photon-node",
  // --- Build/dev tools (never needed at runtime) ---
  "node-llama-cpp", "@node-llama-cpp",
  "playwright-core",
  "cmake-js",
  "bun-types", "@types",
  "@napi-rs", "@emnapi",
  "@reflink",
  // --- Heavy utilities (defer until needed) ---
  "linkedom",
  "jszip",
  "music-metadata", "@borewit", "@tokenizer",
  "simple-git", "@kwsites",
  "lowdb", "steno",
  "ipull",
  // undici NOT lazy: @mariozechner/pi-ai needs EnvHttpProxyAgent constructor eagerly
  "@agentclientprotocol",
  "@mozilla",
  "css-select", "css-what", "cssom",
  "ora",
  "file-type",
]);

// Lazy loading state
const _lazyCache = new Map();
const _loadingSet = new Set();
const _lazyLog = [];
let _lazyTotal = 0;
let _lazyLoaded = 0;

// Dead stub fallback (only used when lazy load FAILS — module not installed)
const _deadStub = new Proxy(function(){}, {
  get: (_, p) => {
    if (p === "__esModule") return true;
    if (p === "default") return _deadStub;
    if (p === Symbol.toPrimitive) return () => "";
    if (p === Symbol.iterator) return function*(){};
    if (p === "then") return undefined;
    return _deadStub;
  },
  apply: () => _deadStub,
  construct: () => _deadStub,
});

function _createLazy(request, parentModule) {
  let _real = null;
  function _resolve() {
    if (_real !== null) return _real;
    if (_loadingSet.has(request)) {
      try { return _origLoad.call(_Module, request, parentModule, false); }
      catch (e) { return _deadStub; }
    }
    _loadingSet.add(request);
    const t0 = Date.now();
    const heapBefore = process.memoryUsage().heapUsed;
    try {
      _real = _origRequire.call(parentModule, request);
    } catch (e) {
      _real = _deadStub;
    } finally {
      _loadingSet.delete(request);
    }
    const dt = Date.now() - t0;
    const heapMB = Math.round((process.memoryUsage().heapUsed - heapBefore) / 1048576);
    _lazyLog.push({ pkg: request, mb: heapMB, ms: dt, t: Date.now() });
    _lazyLoaded++;
    if (heapMB > 0) console.log("[lazy] " + request + " +" + heapMB + "MB (" + dt + "ms)");
    return _real;
  }
  return new Proxy(function(){}, {
    get(_, prop) {
      if (prop === "then") return undefined;
      if (prop === "__lazy__") return request;
      if (prop === "__esModule") return true;
      if (typeof prop === "symbol") {
        if (prop === Symbol.toPrimitive) return () => "";
        if (prop === Symbol.toStringTag) return "Lazy(" + request + ")";
      }
      return _resolve()[prop];
    },
    set(_, prop, value) { _resolve()[prop] = value; return true; },
    apply(_, thisArg, args) {
      const mod = _resolve();
      if (typeof mod === "function") return mod.apply(thisArg, args);
      if (mod && typeof mod.default === "function") return mod.default.apply(thisArg, args);
      return _deadStub;
    },
    construct(_, args, newTarget) {
      const mod = _resolve();
      if (typeof mod === "function") return Reflect.construct(mod, args, newTarget);
      if (mod && typeof mod.default === "function") return Reflect.construct(mod.default, args, newTarget);
      return {};
    },
    has(_, prop) {
      if (prop === "__lazy__" || prop === "__esModule") return true;
      return prop in _resolve();
    },
    ownKeys() { return Reflect.ownKeys(_resolve()); },
    getOwnPropertyDescriptor(_, prop) {
      if (prop === "__esModule") return { value: true, writable: true, enumerable: false, configurable: true };
      if (prop === "__lazy__") return { value: request, writable: true, enumerable: false, configurable: true };
      return Object.getOwnPropertyDescriptor(_resolve(), prop);
    },
    getPrototypeOf() { return Object.getPrototypeOf(_resolve()); },
  });
}

function _matchPkgList(request, list) {
  if (typeof request !== "string") return false;
  if (list.some(p => request === p || request.startsWith(p + "/"))) return true;
  const nm = request.lastIndexOf("/node_modules/");
  if (nm !== -1) {
    const rest = request.substring(nm + 14);
    return list.some(p => rest === p || rest.startsWith(p + "/"));
  }
  return false;
}

let _deadCount = 0;
_Module.prototype.require = function(request) {
  if (_matchPkgList(request, _DEAD_PKGS)) { _deadCount++; _lazyTotal++; return _deadStub; }
  if (_matchPkgList(request, _LAZY_PKGS) && !_loadingSet.has(request)) {
    _lazyTotal++;
    if (!_lazyCache.has(request)) _lazyCache.set(request, _createLazy(request, this));
    return _lazyCache.get(request);
  }
  return _origRequire.apply(this, arguments);
};
_Module._load = function(request, parent, isMain) {
  if (_matchPkgList(request, _DEAD_PKGS)) { _deadCount++; _lazyTotal++; return _deadStub; }
  if (_matchPkgList(request, _LAZY_PKGS) && !_loadingSet.has(request)) {
    _lazyTotal++;
    if (!_lazyCache.has(request)) _lazyCache.set(request, _createLazy(request, parent));
    return _lazyCache.get(request);
  }
  return _origLoad.apply(this, arguments);
};

// 2. Periodic GC if --expose-gc is active (frees ~10 MB per cycle)
if (typeof global.gc === "function") {
  setInterval(() => {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const after = process.memoryUsage().heapUsed;
    const freed = Math.round((before - after) / 1024 / 1024);
    if (freed > 5) console.log("[hijack] GC freed " + freed + " MB");
  }, 30000);
}

// 3. Log capture for launcher dashboard (real OpenClaw logs)
const _logBuffer = [];
const _origLog = console.log;
const _origErr = console.error;
function _clean(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
          .replace(/\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}):\d{2}\.\d+Z\s*/g, '$1 ');
}
console.log = function() {
  const msg = _clean(Array.from(arguments).join(' '));
  _logBuffer.push(msg.substring(0, 120));
  if (_logBuffer.length > 50) _logBuffer.shift();
  _origLog.apply(console, arguments);
};
console.error = function() {
  const msg = "! " + _clean(Array.from(arguments).join(' '));
  _logBuffer.push(msg.substring(0, 120));
  if (_logBuffer.length > 50) _logBuffer.shift();
  _origErr.apply(console, arguments);
};

// 4. Dashboard — inject /dashboard, /api/status, /api/heap into OpenClaw's HTTP server
const _http = require("http");
const _fs = require("fs");
const _v8 = require("v8");

// --- WiFi check (async, non-blocking, cached) ---
let _wifiOk = false;
function _checkWifi() {
  const req = _http.get("http://clients3.google.com/generate_204", { timeout: 3000 }, (res) => {
    _wifiOk = res.statusCode === 204;
    res.resume();
  });
  req.on("error", () => { _wifiOk = false; });
  req.on("timeout", () => { req.destroy(); _wifiOk = false; });
}
setInterval(_checkWifi, 30000);
setTimeout(_checkWifi, 3000);

// --- Top processes (from /proc, zero shell commands) ---
function _getProcs() {
  try {
    const dirs = _fs.readdirSync("/proc").filter(d => /^\d+$/.test(d));
    const procs = [];
    for (const pid of dirs) {
      try {
        const st = _fs.readFileSync("/proc/" + pid + "/status", "utf8");
        const rm = st.match(/VmRSS:\s+(\d+)/);
        if (!rm) continue;
        const rss = Math.round(+rm[1] / 1024);
        if (rss < 5) continue;
        let name = (st.match(/Name:\s+(.+)/) || [, "?"])[1].trim();
        try {
          const cl = _fs.readFileSync("/proc/" + pid + "/cmdline", "utf8").split("\0").filter(Boolean);
          if (cl.length > 0) {
            let c = cl[0].split("/").pop();
            if (c === "app_process32" || c === "app_process64") c = cl[cl.length - 1] || name;
            name = c;
          }
        } catch (e) {}
        name = name
          .replace(/^com\.android\./, "")
          .replace(/^android\.process\./, "")
          .replace(/^com\.motorola\./, "moto.")
          .replace(/^com\.google\.android\./, "goog.")
          .replace(/^com\.pocketclaw\./, "")
          .replace(/^com\.qualcomm\./, "qc.")
          .replace(/^com\.termux\.?/, "termux")
          .replace(/^fr\.neamar\./, "");
        procs.push({ n: name, m: rss });
      } catch (e) {}
    }
    procs.sort((a, b) => b.m - a.m);
    return procs.slice(0, 8);
  } catch (e) { return []; }
}

// --- Status (all from /proc, zero shell commands) ---
function _getStatus() {
  const s = {
    gateway: { status: "up", code: 200 },
    wifi: _wifiOk,
    ram: { used: 0, total: 0 },
    swap: { used: 0, total: 0 },
    uptime: "0m",
    lastError: null,
    telegram: _getModuleStatus(_ALL_MODULES.find(function(m) { return m.id === "telegram"; })) === "active" && !!(process.env.TELEGRAM_BOT_TOKEN),
    kimi: !!(process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY),
    procs: _getProcs(),
    logs: _logBuffer.slice(),
    lazy: { total: _lazyTotal, loaded: _lazyLoaded, deferred: _lazyCache.size - _lazyLoaded, dead: _deadCount }
  };
  try {
    const mi = _fs.readFileSync("/proc/meminfo", "utf8");
    const g = (k) => { const m = mi.match(new RegExp(k + ":\\s+(\\d+)")); return m ? Math.round(+m[1] / 1024) : 0; };
    s.ram.total = g("MemTotal");
    const avail = g("MemAvailable");
    s.ram.used = avail > 0 ? s.ram.total - avail : s.ram.total - g("MemFree") - g("Buffers") - g("Cached");
    s.swap.total = g("SwapTotal");
    s.swap.used = s.swap.total - g("SwapFree");
  } catch (e) {}
  try {
    const sec = parseInt(_fs.readFileSync("/proc/uptime", "utf8"));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    s.uptime = h > 0 ? h + "h " + m + "m" : m + "m";
  } catch (e) {}
  try {
    const files = _fs.readdirSync("/tmp/openclaw").filter(f => f.endsWith(".log")).reverse();
    for (const file of files) {
      const c = _fs.readFileSync("/tmp/openclaw/" + file, "utf8");
      const lines = c.split("\n").filter(l => l.includes("ERROR"));
      if (lines.length > 0) {
        const m = lines[lines.length - 1].match(/"1":"([^"]+)"/);
        if (m) s.lastError = m[1].substring(0, 60);
        break;
      }
    }
  } catch (e) {}
  return s;
}

// --- Dashboard HTML ---
const _DASH = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#000a00">
<title>PocketClaw</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden}
body{background:#000a00;color:#0f0;font-family:'Courier New',monospace;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
body::before{content:"";position:fixed;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,10,0,.7));pointer-events:none;z-index:90}
body::after{content:"";position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.1) 0px,rgba(0,0,0,.1) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:91}
.boot{position:fixed;inset:0;background:#000;z-index:100;display:flex;flex-direction:column;justify-content:center;padding:8vw;font-size:3vw;line-height:2.4;color:#0a0;opacity:1;transition:opacity .6s ease}
.boot.out{opacity:0;pointer-events:none}
.boot .ln{opacity:0;animation:bln .15s ease forwards}
.boot .ln:nth-child(1){animation-delay:.1s}
.boot .ln:nth-child(2){animation-delay:.4s}
.boot .ln:nth-child(3){animation-delay:.7s}
.boot .ln:nth-child(4){animation-delay:1s}
.boot .ln:nth-child(5){animation-delay:1.3s}
.boot .ln:nth-child(6){animation-delay:1.6s}
.boot .ln:nth-child(7){animation-delay:2s;color:#0f0;font-weight:bold}
@keyframes bln{to{opacity:1}}
.boot .ok{color:#0f0}.boot .fail{color:#f33}.boot .val{color:#073}
.cur{display:inline-block;animation:cblink .5s step-end infinite}
@keyframes cblink{0%,100%{opacity:1}50%{opacity:0}}
.shell{height:100%;display:flex;flex-direction:column}
.frame{margin:0 6px 6px;flex:1;border:1px solid rgba(0,255,65,.12);border-radius:0 0 5px 5px;box-shadow:0 0 25px rgba(0,255,65,.04),inset 0 0 50px rgba(0,0,0,.5);overflow-y:auto;-webkit-overflow-scrolling:touch;position:relative}
.frame::before{content:"";position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(0,255,65,.2),transparent);animation:scanl 4s linear infinite;z-index:5;pointer-events:none}
@keyframes scanl{0%{top:0}100%{top:100%}}
.pad{padding:10px 12px 6px}
.t{text-align:center;font-size:5vw;letter-spacing:.8em;color:#0f0;margin:4px 0 2px;padding-right:-.8em;text-shadow:0 0 10px rgba(0,255,65,.5),0 0 30px rgba(0,255,65,.15);animation:glow 3s ease-in-out infinite}
@keyframes glow{0%,100%{text-shadow:0 0 10px rgba(0,255,65,.5),0 0 30px rgba(0,255,65,.15)}50%{text-shadow:0 0 20px rgba(0,255,65,.7),0 0 50px rgba(0,255,65,.25)}}
.sub{text-align:center;font-size:2vw;color:#1a3a1a;margin-bottom:2px;letter-spacing:.3em}
.lb{text-align:center;color:#e33;font-size:2.2vw;line-height:1.2;margin:2px 0;white-space:pre;text-shadow:0 0 8px rgba(255,50,30,.6),0 0 20px rgba(255,30,10,.2);min-height:12vw;font-weight:bold}
.sec-t{font-size:1.8vw;color:#0a3a0a;letter-spacing:.4em;text-transform:uppercase;margin:6px 0 2px 18px}
.r{display:flex;align-items:center;padding:.8vw 0;font-size:3vw}
.i{width:16px;text-align:center;margin-right:4px;font-size:2.2vw}
.ok{color:#0f0;text-shadow:0 0 6px rgba(0,255,65,.7);animation:pulse 2.5s ease-in-out infinite}
.fl{color:#555}.of{color:#0a3a0a}
@keyframes pulse{0%,100%{opacity:.45}50%{opacity:1}}
.l{width:22vw;color:#073;font-size:2.8vw}
.v{flex:1;color:#0f0;font-size:2.8vw}.v.e{color:#555}.v.d{color:#0a3a0a}
.sp{border-top:1px solid rgba(0,255,65,.06);margin:1.5vw 0}
.bw{padding:1px 8px 1px 20px}
.bar{height:2.4vw;border-radius:2px;background:#001a00;border:1px solid #0a2a0a;overflow:hidden}
.bf{height:100%;border-radius:1px;transition:width .6s ease}
.bf.lo{background:linear-gradient(90deg,#040,#0c0)}
.bf.md{background:linear-gradient(90deg,#060,#0f0)}
.bf.hi{background:linear-gradient(90deg,#080,#4f4);animation:barP 1.5s ease-in-out infinite}
@keyframes barP{0%,100%{opacity:.8}50%{opacity:1}}
.bl{font-size:1.6vw;color:#1a3a1a;text-align:right;margin-top:0;padding-right:2px}
.pr{display:flex;align-items:center;padding:.5vw 0 .5vw 20px;font-size:2.4vw}
.pn{width:28vw;color:#073;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pm{width:14vw;text-align:right;color:#0a0;font-size:2.2vw;padding-right:2vw}
.pb{flex:1;height:1.8vw;background:#001a00;border-radius:1px;overflow:hidden}
.pf{height:100%;background:linear-gradient(90deg,#040,#0c0);border-radius:1px;transition:width .6s}
.lg{margin-top:2px;font-size:2.2vw;color:#073}
.lg .e{padding:1px 0;padding-left:20px;line-height:1.3}
.lg .e::before{content:"\\203A ";color:#0a0}
.lg .er{color:#f66}.lg .er::before{color:#f66}
.lz{font-size:2vw;color:#073;padding:0 0 0 20px}
.lz span{color:#0a0}
.ft{text-align:center;font-size:1.5vw;color:#082a08;padding:4px 0;letter-spacing:.2em}
.nav{display:flex;padding:4px 6px 0;gap:4px;position:relative;z-index:10}
.nav a{flex:1;text-align:center;padding:1.8vw 0;font-size:2.6vw;text-decoration:none;letter-spacing:.2em;border:1px solid #0a3a0a;border-bottom:none;border-radius:4px 4px 0 0;color:#073;background:#000a00;transition:all .2s}
.nav a.act{color:#0f0;background:#001a00;border-color:rgba(0,255,65,.2);text-shadow:0 0 6px rgba(0,255,65,.4)}
.sw{height:1.8vw;margin-top:1px}
.sf{height:100%;border-radius:1px;background:linear-gradient(90deg,#330,#aa0);transition:width .6s}
</style></head><body>
<div class="boot" id="boot">
<div class="ln">&gt; POCKETCLAW v4.0 [NATIVE]</div>
<div class="ln">&gt; GATEWAY .............. <span class="val" id="bs1">---</span></div>
<div class="ln">&gt; WIFI ................. <span class="val" id="bs2">---</span></div>
<div class="ln">&gt; TELEGRAM ............. <span class="val" id="bs3">---</span></div>
<div class="ln">&gt; KIMI K2.5 ............ <span class="val" id="bs4">---</span></div>
<div class="ln">&gt; RAM .................. <span class="val" id="bs5">---</span></div>
<div class="ln">&gt; SYSTEM ONLINE<span class="cur">_</span></div>
</div>
<div class="shell">
<div class="nav"><a href="/dashboard" class="act">STATUS</a><a href="/keys">KEYS</a><a href="/logs">LOGS</a><a href="/control">CTRL</a></div>
<div class="frame">
<div class="pad">
<div class="t">POCKETCLAW</div>
<div class="sub">MOTO E2 &#x2022; 1GB &#x2022; ANDROID 6</div>
<pre class="lb" id="lb"></pre>
<div class="sec-t">services</div>
<div class="r"><span class="i" id="ig">&#x25CF;</span><span class="l">Gateway</span><span class="v" id="vg">...</span></div>
<div class="r"><span class="i" id="iw">&#x25CF;</span><span class="l">WiFi</span><span class="v" id="vw">...</span></div>
<div class="r"><span class="i" id="it">&#x25CF;</span><span class="l">Telegram</span><span class="v" id="vt">...</span></div>
<div class="r"><span class="i" id="ik">&#x25CF;</span><span class="l">Kimi K2.5</span><span class="v" id="vk">...</span></div>
<div class="sp"></div>
<div class="sec-t">memory</div>
<div class="r"><span class="i"></span><span class="l">RAM</span><span class="v" id="vr">...</span></div>
<div class="bw"><div class="bar"><div class="bf lo" id="bf" style="width:0%"></div></div><div class="bl" id="bl"></div></div>
<div class="r"><span class="i"></span><span class="l">Swap</span><span class="v" id="vs">...</span></div>
<div class="bw"><div class="bar sw"><div class="sf" id="sf" style="width:0%"></div></div></div>
<div class="sp"></div>
<div class="sec-t">top processes</div>
<div id="procs"></div>
<div class="sp"></div>
<div class="sec-t">system</div>
<div class="lg">
<div class="e" id="lu">uptime: ...</div>
<div class="e" id="le">errors: none</div>
<div class="lz" id="lz"></div>
</div>
<div class="sp"></div>
<div class="ft">V8 112MB &#x2022; NATIVE &#x2022; NODE 22</div>
</div>
</div>
</div>
<script>
var F=["            __              __\\n           / <\`            '> \\\\\\n          (  / @          @ \\\\  )\\n           \\\\(_ _\\\\  .--.  /_ _)/\\n         (\\\\ \`-/  .'  '.  \\\\-' /)\\n          \\"===\\\\ / .::. \\\\ /=== \\"\\n           .==')(.:::::.)(\`==.\\n          ' .='  ':::::' \`=. '\\n         /  / .::::::::::. \\\\  \\\\\\n        |  | (::::::::::::) |  |\\n         \\\\  \\\\ '::::::::::' /  /\\n          \\\\  \\\\  |  ||  |  /  /\\n           \\\\  \\\\ |  ||  | /  /\\n            '-.\\\\|__||__|/.-'\\n                ^^  ^^","            __              __\\n           ( <\`            '> )\\n          (  / @          @ \\\\  )\\n           \\\\(_ _\\\\  .--.  /_ _)/\\n         (\\\\ \`-/  .'  '.  \\\\-' /)\\n          \\"===\\\\ / .::. \\\\ /=== \\"\\n           .==')(.:::::.)(\`==.\\n          ' .='  ':::::' \`=. '\\n         /  / .::::::::::. \\\\  \\\\\\n        |  | (::::::::::::) |  |\\n         \\\\  \\\\ '::::::::::' /  /\\n          \\\\  \\\\  |  ||  |  /  /\\n           \\\\  \\\\ |  ||  | /  /\\n            '-.\\\\|__||__|/.-'\\n                ^^  ^^"];
var t=0,bootDone=false;
function si(id,c){document.getElementById(id).className="i "+c}
function updateBoot(d){
if(bootDone)return;bootDone=true;
var s=function(id,txt,ok){var e=document.getElementById(id);e.textContent=txt;e.className=ok?"ok":"fail"};
s("bs1",d.gateway.status==="up"?"[OK]":"[FAIL]",d.gateway.status==="up");
s("bs2",d.wifi?"[OK]":"[FAIL]",d.wifi);
s("bs3",d.telegram?"[LIVE]":"[DOWN]",d.telegram);
s("bs4",d.kimi?"[READY]":"[N/A]",d.kimi);
var p=Math.round(d.ram.used/d.ram.total*100);
s("bs5",d.ram.used+"/"+d.ram.total+" MB ["+p+"%]",p<80);
}
function go(){
fetch("/api/status").then(function(r){return r.json()}).then(function(d){
if(!bootDone)updateBoot(d);
si("ig",d.gateway.status==="up"?"ok":"fl");
document.getElementById("vg").textContent=d.gateway.code+" OK";
document.getElementById("vg").className="v"+(d.gateway.status==="up"?"":" e");
si("iw",d.wifi?"ok":"fl");
document.getElementById("vw").textContent=d.wifi?"Online":"Offline";
document.getElementById("vw").className="v"+(d.wifi?"":" e");
si("it",d.telegram?"ok":"fl");
document.getElementById("vt").textContent=d.telegram?"Live":"Down";
document.getElementById("vt").className="v"+(d.telegram?"":" e");
si("ik",d.kimi?"ok":"of");
document.getElementById("vk").textContent=d.kimi?"Connected":"No Key";
document.getElementById("vk").className="v"+(d.kimi?"":" d");
document.getElementById("vr").textContent=d.ram.used+"/"+d.ram.total+" MB";
var p=Math.round(d.ram.used/d.ram.total*100),bf=document.getElementById("bf");
bf.style.width=p+"%";bf.className="bf "+(p<60?"lo":p<80?"md":"hi");
document.getElementById("bl").textContent=p+"% used \\u2022 "+(d.ram.total-d.ram.used)+" MB free";
document.getElementById("vs").textContent=d.swap.used+"/"+d.swap.total+" MB";
var sp=d.swap.total>0?Math.round(d.swap.used/d.swap.total*100):0;
document.getElementById("sf").style.width=sp+"%";
var procs=d.procs||[],html="",mx=procs.length>0?procs[0].m:1;
for(var i=0;i<procs.length;i++){var pr=procs[i],pct=Math.round(pr.m/mx*100);
html+='<div class="pr"><span class="pn">'+pr.n.substring(0,15)+'</span><span class="pm">'+pr.m+' MB</span><div class="pb"><div class="pf" style="width:'+pct+'%"></div></div></div>';}
document.getElementById("procs").innerHTML=html;
document.getElementById("lu").textContent="uptime: "+d.uptime;
if(d.lastError){document.getElementById("le").textContent="err: "+d.lastError;document.getElementById("le").className="e er"}
else{document.getElementById("le").textContent="errors: none";document.getElementById("le").className="e"}
if(d.lazy)document.getElementById("lz").innerHTML="lazy: <span>"+d.lazy.loaded+"</span>/"+d.lazy.total+" loaded \\u2022 <span>"+d.lazy.deferred+"</span> deferred \\u2022 <span>"+(d.lazy.dead||0)+"</span> dead";
}).catch(function(){si("ig","fl");document.getElementById("vg").textContent="OFFLINE";document.getElementById("vg").className="v e"});
document.getElementById("lb").textContent=F[t%2];t++}
setTimeout(function(){document.getElementById("boot").classList.add("out")},3000);
go();setInterval(go,3000);
</script></body></html>`;

// --- Logs Page HTML ---
const _LOGS = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#000a00">
<title>PocketClaw Logs</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000a00;color:#0f0;font-family:'Courier New',monospace;min-height:100vh;-webkit-user-select:none}
body::before{content:"";position:fixed;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,10,0,.7));pointer-events:none;z-index:90}
body::after{content:"";position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.1) 0px,rgba(0,0,0,.1) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:91}
.nav{display:flex;padding:4px 6px 0;gap:4px;position:relative;z-index:10}
.nav a{flex:1;text-align:center;padding:1.8vw 0;font-size:2.6vw;text-decoration:none;letter-spacing:.2em;border:1px solid #0a3a0a;border-bottom:none;border-radius:4px 4px 0 0;color:#073;background:#000a00;transition:all .2s}
.nav a.act{color:#0f0;background:#001a00;border-color:rgba(0,255,65,.2);text-shadow:0 0 6px rgba(0,255,65,.4)}
.frame{margin:0 6px 6px;border:1px solid rgba(0,255,65,.12);border-radius:0 0 5px 5px;box-shadow:0 0 25px rgba(0,255,65,.04),inset 0 0 50px rgba(0,0,0,.5);min-height:90vh;display:flex;flex-direction:column}
.t{text-align:center;font-size:4vw;letter-spacing:.5em;color:#0f0;margin:8px 0 2px;text-shadow:0 0 10px rgba(0,255,65,.5)}
.sub{text-align:center;font-size:2vw;color:#1a3a1a;margin-bottom:6px;letter-spacing:.2em}
.log-area{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 8px 8px;font-size:2.4vw;line-height:1.5}
.log-area div{padding:1px 0;border-bottom:1px solid rgba(0,255,65,.03)}
.log-area .err{color:#f66}
.log-area .warn{color:#aa0}
.log-area .info{color:#073}
.log-area .time{color:#0a3a0a}
.lazy-log{padding:8px;border-top:1px solid rgba(0,255,65,.08)}
.lazy-t{font-size:2vw;color:#0a3a0a;letter-spacing:.3em;margin-bottom:4px}
.lazy-e{font-size:2.2vw;padding:1px 0;color:#073}
.lazy-e span{color:#0a0}
.ctrl{display:flex;gap:4px;padding:4px 8px;border-top:1px solid rgba(0,255,65,.08)}
.ctrl button{flex:1;background:#001a00;border:1px solid #0a3a0a;color:#073;font-family:'Courier New',monospace;font-size:2.4vw;padding:1.5vw;border-radius:3px;cursor:pointer}
.ctrl button:active{background:#002a00;border-color:#0f0;color:#0f0}
.ctrl button.on{border-color:#0f0;color:#0f0}
</style></head><body>
<div class="nav"><a href="/dashboard">STATUS</a><a href="/keys">KEYS</a><a href="/logs" class="act">LOGS</a><a href="/control">CTRL</a></div>
<div class="frame">
<div class="t">LOGS</div>
<div class="sub">REAL-TIME GATEWAY OUTPUT</div>
<div class="log-area" id="logs"></div>
<div class="lazy-log" id="lazy"></div>
<div class="ctrl">
<button id="ab" class="on" onclick="toggleAuto()">AUTO-SCROLL</button>
<button onclick="clr()">CLEAR</button>
</div>
</div>
<script>
var auto=true,seen=0;
function toggleAuto(){auto=!auto;document.getElementById("ab").className=auto?"on":""}
function clr(){document.getElementById("logs").innerHTML="";seen=0}
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;")}
function cls(s){if(s.indexOf("ERROR")>-1||s.indexOf("!")===0)return"err";if(s.indexOf("warn")>-1||s.indexOf("WARN")>-1)return"warn";return"info"}
function poll(){
fetch("/api/logs").then(function(r){return r.json()}).then(function(d){
var el=document.getElementById("logs"),h="";
d.lines.forEach(function(l){h+='<div class="'+cls(l)+'">'+esc(l)+"</div>"});
el.innerHTML=h;
if(auto)el.scrollTop=el.scrollHeight;
var lz=d.lazy||[];
if(lz.length>0){var lh='<div class="lazy-t">LAZY MODULES LOADED</div>';
lz.forEach(function(e){lh+='<div class="lazy-e">'+esc(e.pkg)+' <span>+'+e.mb+'MB</span> ('+e.ms+'ms)</div>'});
document.getElementById("lazy").innerHTML=lh}
}).catch(function(){})}
poll();setInterval(poll,2000);
</script></body></html>`;

// --- Setup Wizard HTML ---
const _SETUP = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#000a00">
<title>PocketClaw Setup</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000a00;color:#0f0;font-family:'Courier New',monospace;min-height:100vh;padding:6vw}
body::after{content:"";position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.1) 0px,rgba(0,0,0,.1) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:91}
h1{text-align:center;font-size:5vw;letter-spacing:.5em;color:#0f0;text-shadow:0 0 10px rgba(0,255,65,.5);margin-bottom:1vw}
.sub{text-align:center;color:#1a3a1a;font-size:2.5vw;margin-bottom:4vw;letter-spacing:.2em}
.step{margin-bottom:4vw;border:1px solid rgba(0,255,65,.1);border-radius:4px;padding:3vw;background:rgba(0,10,0,.5)}
.step-t{font-size:3vw;color:#0a0;margin-bottom:2vw;letter-spacing:.15em}
.step-t span{color:#073}
label{display:block;font-size:2.5vw;color:#073;margin:1.5vw 0 .5vw}
input,select{width:100%;background:#001a00;border:1px solid #0a3a0a;color:#0f0;font-family:'Courier New',monospace;font-size:3vw;padding:2vw;border-radius:3px;outline:none}
input:focus,select:focus{border-color:#0f0;box-shadow:0 0 8px rgba(0,255,65,.3)}
input::placeholder{color:#0a3a0a}
select option{background:#001a00;color:#0f0}
.ch-grid{display:grid;grid-template-columns:1fr 1fr;gap:2vw}
.ch-btn{background:#001a00;border:2px solid #0a3a0a;border-radius:4px;padding:3vw 2vw;text-align:center;cursor:pointer;transition:all .2s}
.ch-btn.sel{border-color:#0f0;background:#002a00;box-shadow:0 0 12px rgba(0,255,65,.2)}
.ch-btn .icon{font-size:6vw;display:block;margin-bottom:1vw}
.ch-btn .name{font-size:3vw;color:#0f0}
.ch-btn .cost{font-size:2vw;color:#073;margin-top:.5vw}
.providers{margin-top:1.5vw}
.prov{display:flex;align-items:center;padding:1.5vw;border:1px solid #0a3a0a;border-radius:3px;margin-bottom:1vw;cursor:pointer;transition:all .2s}
.prov.sel{border-color:#0f0;background:#002a00}
.prov .dot{width:3vw;height:3vw;border-radius:50%;border:2px solid #0a3a0a;margin-right:2vw;transition:all .2s}
.prov.sel .dot{background:#0f0;border-color:#0f0;box-shadow:0 0 6px #0f0}
.prov .info{flex:1}
.prov .pname{font-size:2.8vw;color:#0f0}
.prov .pdesc{font-size:2vw;color:#073}
.hint{font-size:2vw;color:#0a3a0a;margin-top:1vw;line-height:1.4}
.hint a{color:#073}
.go{display:block;width:100%;background:#002a00;border:2px solid #0f0;color:#0f0;font-family:'Courier New',monospace;font-size:4vw;padding:3vw;border-radius:4px;cursor:pointer;letter-spacing:.3em;text-shadow:0 0 8px rgba(0,255,65,.5);transition:all .2s;margin-top:2vw}
.go:hover,.go:active{background:#004a00;box-shadow:0 0 20px rgba(0,255,65,.3)}
.go:disabled{opacity:.3;cursor:not-allowed}
.msg{text-align:center;padding:3vw;font-size:3vw;display:none}
.msg.ok{color:#0f0;display:block}.msg.err{color:#f66;display:block}
</style></head><body>
<h1>POCKETCLAW</h1>
<div class="sub">SETUP WIZARD</div>
<form id="fm" onsubmit="return save()">
<div class="step">
<div class="step-t"><span>01</span> CHANNEL</div>
<div class="ch-grid">
<div class="ch-btn sel" id="ch-telegram" onclick="setCh('telegram')"><span class="icon">&#x2708;</span><span class="name">Telegram</span><span class="cost">+35 MB RAM</span></div>
<div class="ch-btn" id="ch-discord" onclick="setCh('discord')"><span class="icon">&#x1F3AE;</span><span class="name">Discord</span><span class="cost">+60 MB RAM</span></div>
</div>
<label id="token-label">Bot Token (from @BotFather)</label>
<input id="token" type="text" placeholder="123456:ABC-DEF..." autocomplete="off" spellcheck="false">
<div class="hint" id="token-hint">Telegram: message <b>@BotFather</b> on Telegram, /newbot</div>
</div>
<div class="step">
<div class="step-t"><span>02</span> AI PROVIDER</div>
<div class="providers">
<div class="prov sel" onclick="setProv('kimi')"><div class="dot" id="d-kimi"></div><div class="info"><div class="pname">Kimi K2.5</div><div class="pdesc">Free, unlimited, fast</div></div></div>
<div class="prov" onclick="setProv('groq')"><div class="dot" id="d-groq"></div><div class="info"><div class="pname">Groq (Llama 3.3 70B)</div><div class="pdesc">Free tier, very fast</div></div></div>
<div class="prov" onclick="setProv('openai')"><div class="dot" id="d-openai"></div><div class="info"><div class="pname">OpenAI (GPT-4o)</div><div class="pdesc">Paid, most capable</div></div></div>
</div>
<label id="key-label">API Key</label>
<input id="apikey" type="password" placeholder="sk-..." autocomplete="off" spellcheck="false">
<div class="hint" id="key-hint">Get free key: <b>platform.moonshot.cn</b></div>
</div>
<div class="sp"></div>
<div class="step">
<div class="step-t"><span>03</span> SYSTEM</div>
<button class="go" style="background:#001a00;border-color:#0a3a0a;font-size:3vw;color:#073;margin:1vw 0" type="button" onclick="debloat()">DEBLOAT ANDROID (126 packages)</button>
<button class="go" style="background:#001a00;border-color:#0a3a0a;font-size:3vw;color:#073;margin:1vw 0" type="button" onclick="setHome()">SET HOME SCREEN</button>
<button class="go" style="background:#001a00;border-color:#0a3a0a;font-size:3vw;color:#073;margin:1vw 0" type="button" onclick="harden()">HARDEN SYSTEM</button>
<div class="hint" id="sys-msg"></div>
</div>
<button class="go" type="submit" id="gobtn">&#x25B6; DEPLOY</button>
</form>
<div class="msg" id="msg"></div>
<script>
var ch="telegram",prov="kimi";
function setCh(c){ch=c;
document.getElementById("ch-telegram").className="ch-btn"+(c==="telegram"?" sel":"");
document.getElementById("ch-discord").className="ch-btn"+(c==="discord"?" sel":"");
document.getElementById("token-label").textContent=c==="telegram"?"Bot Token (from @BotFather)":"Bot Token (Discord Developer Portal)";
document.getElementById("token-hint").innerHTML=c==="telegram"?'Telegram: message <b>@BotFather</b>, /newbot':'Discord: <b>discord.com/developers</b> > New App > Bot > Token'}
function setProv(p){prov=p;
["kimi","groq","openai"].forEach(function(x){
var el=document.getElementById("d-"+x).parentElement;el.className="prov"+(x===p?" sel":"")});
var hints={"kimi":"Get free key: <b>platform.moonshot.cn</b>","groq":"Get free key: <b>console.groq.com</b>","openai":"Get key: <b>platform.openai.com</b> (paid)"};
document.getElementById("key-hint").innerHTML=hints[p];
document.getElementById("key-label").textContent="API Key"+(p==="kimi"?" (Kimi)":p==="groq"?" (Groq)":"  (OpenAI)")}
function save(){
var t=document.getElementById("token").value.trim(),k=document.getElementById("apikey").value.trim();
if(!t){show("Enter your bot token","err");return false}
if(!k){show("Enter your API key","err");return false}
document.getElementById("gobtn").disabled=true;
document.getElementById("gobtn").textContent="DEPLOYING...";
fetch("/api/setup",{method:"POST",headers:{"Content-Type":"application/json"},
body:JSON.stringify({channel:ch,provider:prov,token:t,apiKey:k})
}).then(function(r){return r.json()}).then(function(d){
if(d.ok){show("Setup complete! Restarting gateway...","ok");
setTimeout(function(){window.location.href="/dashboard"},8000)}
else{show("Error: "+d.error,"err");document.getElementById("gobtn").disabled=false;document.getElementById("gobtn").textContent="\\u25B6 DEPLOY"}
}).catch(function(e){show("Connection error","err");document.getElementById("gobtn").disabled=false;document.getElementById("gobtn").textContent="\\u25B6 DEPLOY"});
return false}
function show(t,c){var m=document.getElementById("msg");m.textContent=t;m.className="msg "+c}
function sysMsg(t){document.getElementById("sys-msg").textContent=t}
function debloat(){sysMsg("Debloating...");
fetch("/api/setup/debloat",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
sysMsg("Done: "+d.done+"/"+d.total+" disabled")}).catch(function(){sysMsg("Error")})}
function setHome(){
fetch("/api/setup/launcher",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
sysMsg(d.ok?"PocketClaw set as home":"Error")}).catch(function(){sysMsg("Error")})}
function harden(){
fetch("/api/setup/harden",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
sysMsg("Applied "+d.applied+"/"+d.total+" settings")}).catch(function(){sysMsg("Error")})}
</script></body></html>`;

// --- Keys Management Page ---
const _KEYS = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#000a00">
<title>PocketClaw Keys</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000a00;color:#0f0;font-family:'Courier New',monospace;min-height:100vh;-webkit-user-select:none}
body::before{content:"";position:fixed;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,10,0,.7));pointer-events:none;z-index:90}
body::after{content:"";position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.1) 0px,rgba(0,0,0,.1) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:91}
.nav{display:flex;padding:4px 6px 0;gap:4px;position:relative;z-index:10}
.nav a{flex:1;text-align:center;padding:1.8vw 0;font-size:2.6vw;text-decoration:none;letter-spacing:.2em;border:1px solid #0a3a0a;border-bottom:none;border-radius:4px 4px 0 0;color:#073;background:#000a00;transition:all .2s}
.nav a.act{color:#0f0;background:#001a00;border-color:rgba(0,255,65,.2);text-shadow:0 0 6px rgba(0,255,65,.4)}
.frame{margin:0 6px 6px;border:1px solid rgba(0,255,65,.12);border-radius:0 0 5px 5px;box-shadow:0 0 25px rgba(0,255,65,.04),inset 0 0 50px rgba(0,0,0,.5);overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:85vh}
.pad{padding:12px 14px}
.t{text-align:center;font-size:4.5vw;letter-spacing:.5em;color:#0f0;margin:6px 0 2px;text-shadow:0 0 10px rgba(0,255,65,.5)}
.sub{text-align:center;font-size:2vw;color:#1a3a1a;margin-bottom:10px;letter-spacing:.2em}
.key{border:1px solid #0a3a0a;border-radius:4px;padding:3vw;margin-bottom:2vw;background:rgba(0,10,0,.3)}
.key-hd{display:flex;align-items:center;gap:2vw}
.key-dot{width:2.5vw;height:2.5vw;border-radius:50%;flex-shrink:0}
.key-dot.on{background:#0f0;box-shadow:0 0 6px #0f0}
.key-dot.off{background:#333}
.key-name{font-size:2.8vw;color:#0a0;flex:1;word-break:break-all}
.key-val{font-size:2.4vw;color:#073;margin:1vw 0;font-family:monospace}
.key-btns{display:flex;gap:2vw;margin-top:1.5vw}
.btn{background:#001a00;border:1px solid #0a3a0a;color:#073;font-family:'Courier New',monospace;font-size:2.4vw;padding:1.5vw 3vw;border-radius:3px;cursor:pointer;transition:all .2s}
.btn:active{background:#002a00;border-color:#0f0;color:#0f0}
.btn.ok{border-color:#0f0;color:#0f0}
.btn.err{border-color:#f66;color:#f66}
.key-edit{display:none;margin-top:1.5vw}
.key-edit.show{display:flex;gap:2vw;align-items:center}
.key-edit input{flex:1;background:#001a00;border:1px solid #0a3a0a;color:#0f0;font-family:monospace;font-size:2.6vw;padding:1.5vw;border-radius:3px;outline:none}
.key-edit input:focus{border-color:#0f0;box-shadow:0 0 6px rgba(0,255,65,.3)}
.test-res{font-size:2.2vw;margin-top:1vw;min-height:3vw}
.test-res.ok{color:#0f0}.test-res.err{color:#f66}
.msg{text-align:center;padding:2vw;font-size:2.8vw;min-height:4vw}
.msg.ok{color:#0f0}.msg.err{color:#f66}
.sp{border-top:1px solid rgba(0,255,65,.06);margin:3vw 0}
.add{border:1px dashed #0a3a0a;border-radius:4px;padding:3vw;margin-top:2vw}
.add-t{font-size:2.4vw;color:#073;margin-bottom:1.5vw;letter-spacing:.2em}
.add-row{display:flex;gap:2vw;margin-bottom:1.5vw}
.add-row input{flex:1;background:#001a00;border:1px solid #0a3a0a;color:#0f0;font-family:monospace;font-size:2.6vw;padding:1.5vw;border-radius:3px;outline:none}
.ft{text-align:center;font-size:1.6vw;color:#082a08;padding:8px 0;letter-spacing:.2em}
</style></head><body>
<div class="nav"><a href="/dashboard">STATUS</a><a href="/keys" class="act">KEYS</a><a href="/logs">LOGS</a><a href="/control">CTRL</a></div>
<div class="frame"><div class="pad">
<div class="t">API KEYS</div>
<div class="sub">MANAGE YOUR CREDENTIALS</div>
<div id="keys"></div>
<div class="msg" id="msg"></div>
<div class="sp"></div>
<div class="add">
<div class="add-t">+ ADD NEW KEY</div>
<div class="add-row"><input id="nk" placeholder="KEY_NAME" spellcheck="false"><input id="nv" placeholder="value..." type="password" spellcheck="false"></div>
<button class="btn" onclick="addKey()">ADD</button>
</div>
<div class="sp"></div>
<div class="ft">ALL KEYS STORED LOCALLY ON DEVICE</div>
</div></div>
<script>
function load(){
fetch("/api/keys").then(function(r){return r.json()}).then(function(d){
var h="";
d.keys.forEach(function(k){
h+='<div class="key" id="k-'+k.name+'">';
h+='<div class="key-hd"><div class="key-dot '+(k.set?"on":"off")+'"></div>';
h+='<div class="key-name">'+k.name+'</div></div>';
h+='<div class="key-val">'+(k.set?k.masked:'<span style="color:#555">not set</span>')+'</div>';
h+='<div class="key-btns">';
h+='<button class="btn" onclick="toggleEdit(this,\\''+k.name+'\\')">EDIT</button>';
if(k.set)h+='<button class="btn" onclick="testKey(this,\\''+k.name+'\\')">TEST</button>';
h+='</div>';
h+='<div class="key-edit" id="e-'+k.name+'"><input type="password" placeholder="new value..." id="v-'+k.name+'">';
h+='<button class="btn" onclick="saveKey(\\''+k.name+'\\')">SAVE</button></div>';
h+='<div class="test-res" id="t-'+k.name+'"></div>';
h+='</div>';
});
document.getElementById("keys").innerHTML=h;
}).catch(function(){document.getElementById("msg").textContent="Failed to load keys";document.getElementById("msg").className="msg err"});}
function toggleEdit(btn,name){var el=document.getElementById("e-"+name);el.className=el.className.indexOf("show")>-1?"key-edit":"key-edit show";}
function saveKey(name){
var v=document.getElementById("v-"+name).value;
fetch("/api/keys",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name,value:v})})
.then(function(r){return r.json()}).then(function(d){
if(d.ok){document.getElementById("msg").textContent=name+" updated";document.getElementById("msg").className="msg ok";load();}
else{document.getElementById("msg").textContent="Error: "+d.error;document.getElementById("msg").className="msg err";}
}).catch(function(){document.getElementById("msg").textContent="Connection error";document.getElementById("msg").className="msg err";});}
function testKey(btn,name){
btn.textContent="...";
var el=document.getElementById("t-"+name);
fetch("/api/keys/test?key="+name).then(function(r){return r.json()}).then(function(d){
if(d.ok){el.textContent="\\u2713 Valid"+(d.info?" ("+d.info+")":"");el.className="test-res ok";btn.textContent="TEST";btn.className="btn ok";}
else{el.textContent="\\u2717 "+(d.error||"Failed ("+d.status+")");el.className="test-res err";btn.textContent="TEST";btn.className="btn err";}
}).catch(function(){el.textContent="Connection error";el.className="test-res err";btn.textContent="TEST";});}
function addKey(){
var n=document.getElementById("nk").value.trim().toUpperCase(),v=document.getElementById("nv").value.trim();
if(!n||!v){document.getElementById("msg").textContent="Enter name and value";document.getElementById("msg").className="msg err";return;}
fetch("/api/keys",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n,value:v})})
.then(function(r){return r.json()}).then(function(d){
if(d.ok){document.getElementById("msg").textContent=n+" added";document.getElementById("msg").className="msg ok";document.getElementById("nk").value="";document.getElementById("nv").value="";load();}
}).catch(function(){document.getElementById("msg").textContent="Error";document.getElementById("msg").className="msg err";});}
load();
</script></body></html>`;

// --- Setup API handler ---
function _handleSetup(req, res) {
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    try {
      const d = JSON.parse(body);
      const confPath = (process.env.HOME || "/root") + "/.openclaw/openclaw.json";
      const envPath = (process.env.HOME || "/root") + "/.openclaw/env";

      // Read existing config
      let conf = {};
      try { conf = JSON.parse(_fs.readFileSync(confPath, "utf8")); } catch (e) {}

      // Set channel
      const isTg = d.channel === "telegram";
      if (isTg) {
        conf.channels = conf.channels || {};
        conf.channels.telegram = { enabled: true, dmPolicy: "open", botToken: d.token, allowFrom: ["*"], groupPolicy: "allowlist", streamMode: "partial", network: { autoSelectFamily: true } };
        delete conf.channels.discord;
        conf.plugins = conf.plugins || {};
        conf.plugins.entries = { telegram: { enabled: true } };
      } else {
        conf.channels = conf.channels || {};
        conf.channels.discord = { enabled: true, botToken: d.token, allowFrom: ["*"] };
        delete conf.channels.telegram;
        conf.plugins = conf.plugins || {};
        conf.plugins.entries = { discord: { enabled: true } };
      }

      // Set provider
      conf.models = conf.models || {};
      conf.models.providers = conf.models.providers || {};
      conf.agents = conf.agents || {};
      conf.agents.defaults = conf.agents.defaults || {};
      conf.agents.defaults.maxConcurrent = 1;
      conf.agents.defaults.subagents = { maxConcurrent: 2 };

      if (d.provider === "kimi") {
        conf.models.providers["kimi-coding"] = {
          baseUrl: "https://api.kimi.com/coding/v1", apiKey: d.apiKey, api: "openai-completions",
          headers: { "User-Agent": "claude-code/1.0" },
          models: [{ id: "kimi-for-coding", name: "Kimi For Coding", reasoning: false, input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262144, maxTokens: 8192,
            headers: { "User-Agent": "claude-code/1.0" } }]
        };
        conf.agents.defaults.model = { primary: "kimi-coding/kimi-for-coding", fallbacks: [] };
      } else if (d.provider === "groq") {
        conf.models.providers.groq = {
          baseUrl: "https://api.groq.com/openai/v1", apiKey: d.apiKey, api: "openai-completions",
          models: [{ id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", reasoning: false, input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 131072, maxTokens: 8192 }]
        };
        conf.agents.defaults.model = { primary: "groq/llama-3.3-70b-versatile", fallbacks: [] };
      } else {
        conf.models.providers.openai = {
          apiKey: d.apiKey, api: "openai-completions",
          models: [{ id: "gpt-4o", name: "GPT-4o", reasoning: false, input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 }]
        };
        conf.agents.defaults.model = { primary: "openai/gpt-4o", fallbacks: [] };
      }

      // Identity
      conf.agents.list = [{ id: "pocketclaw", identity: {
        name: "PocketClaw", emoji: "\ud83d\udcf1",
        theme: "You are PocketClaw, an AI agent living inside an old phone. You are proud of running on impossible hardware. You are concise, helpful, and have a dry humor about your hardware constraints. Answer in the same language as the user."
      }}];

      // Gateway
      conf.gateway = conf.gateway || {};
      conf.gateway.port = 9000;
      conf.gateway.mode = "local";
      conf.commands = { native: "auto", nativeSkills: "auto" };

      // Write config
      _fs.writeFileSync(confPath, JSON.stringify(conf, null, 2));

      // Write env
      let envLines = [];
      if (d.provider === "kimi") {
        envLines.push("KIMI_API_KEY=" + d.apiKey);
        envLines.push("MOONSHOT_API_KEY=" + d.apiKey);
      } else if (d.provider === "groq") {
        envLines.push("GROQ_API_KEY=" + d.apiKey);
      } else {
        envLines.push("OPENAI_API_KEY=" + d.apiKey);
      }
      if (isTg) envLines.push("TELEGRAM_BOT_TOKEN=" + d.token);
      else envLines.push("DISCORD_BOT_TOKEN=" + d.token);
      _fs.writeFileSync(envPath, envLines.join("\n") + "\n", { mode: 0o600 });

      console.log("[hijack] Setup complete — " + d.channel + " + " + d.provider);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));

      // Restart gateway after response is sent
      setTimeout(() => { console.log("[hijack] Restarting for setup..."); process.exit(0); }, 2000);

    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
}

// --- Key Management API ---
const _ENV_FILE = (process.env.HOME || "/root") + "/.openclaw/env";
// Build key list from module registry + Kimi aliases (deduplicated)
const _KEY_NAMES = (function() {
  var keys = [];
  _ALL_MODULES.forEach(function(m) { if (m.key && keys.indexOf(m.key) < 0) keys.push(m.key); });
  // Kimi aliases (not in module registry — uses OpenAI SDK)
  ["KIMI_API_KEY", "MOONSHOT_API_KEY"].forEach(function(k) { if (keys.indexOf(k) < 0) keys.push(k); });
  return keys;
})();

function _getKeys() {
  const keys = [];
  let envData = {};
  try {
    const lines = _fs.readFileSync(_ENV_FILE, "utf8").split("\n");
    lines.forEach(function(l) {
      const eq = l.indexOf("=");
      if (eq > 0) envData[l.substring(0, eq).trim()] = l.substring(eq + 1).trim();
    });
  } catch (e) {}
  _KEY_NAMES.forEach(function(name) {
    const val = envData[name] || process.env[name] || "";
    keys.push({
      name: name,
      set: val.length > 0,
      masked: val.length > 12 ? val.substring(0, 8) + "..." + val.slice(-4) : (val.length > 0 ? val.substring(0, 4) + "..." : ""),
      len: val.length
    });
  });
  return { keys: keys, envFile: _ENV_FILE };
}

function _handleKeySave(req, res) {
  let body = "";
  req.on("data", function(c) { body += c; });
  req.on("end", function() {
    try {
      const d = JSON.parse(body);
      // Read existing env
      let envData = {};
      try {
        _fs.readFileSync(_ENV_FILE, "utf8").split("\n").forEach(function(l) {
          const eq = l.indexOf("=");
          if (eq > 0) envData[l.substring(0, eq).trim()] = l.substring(eq + 1).trim();
        });
      } catch (e) {}
      // Update keys
      if (d.name && typeof d.value === "string") {
        if (d.value === "") delete envData[d.name];
        else envData[d.name] = d.value;
        // Also update process.env so it takes effect immediately
        if (d.value === "") delete process.env[d.name];
        else process.env[d.name] = d.value;
      }
      // Write back
      const lines = Object.keys(envData).map(function(k) { return k + "=" + envData[k]; });
      _fs.writeFileSync(_ENV_FILE, lines.join("\n") + "\n", { mode: 0o600 });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
}

function _handleKeyTest(req, res) {
  const url = require("url").parse(req.url, true);
  const keyName = url.query.key;
  const val = process.env[keyName] || "";
  if (!val) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Key not set" }));
    return;
  }
  // Quick validation based on key type
  let testUrl = null, testOpts = {};
  if (keyName === "KIMI_API_KEY" || keyName === "MOONSHOT_API_KEY") {
    testUrl = "https://api.kimi.com/coding/v1/models";
    testOpts = { headers: { "Authorization": "Bearer " + val, "User-Agent": "claude-code/1.0" }, timeout: 5000 };
  } else if (keyName === "OPENAI_API_KEY") {
    testUrl = "https://api.openai.com/v1/models";
    testOpts = { headers: { "Authorization": "Bearer " + val }, timeout: 5000 };
  } else if (keyName === "GROQ_API_KEY") {
    testUrl = "https://api.groq.com/openai/v1/models";
    testOpts = { headers: { "Authorization": "Bearer " + val }, timeout: 5000 };
  } else if (keyName === "TELEGRAM_BOT_TOKEN") {
    testUrl = "https://api.telegram.org/bot" + val + "/getMe";
    testOpts = { timeout: 5000 };
  } else if (keyName === "DISCORD_BOT_TOKEN") {
    testUrl = "https://discord.com/api/v10/users/@me";
    testOpts = { headers: { "Authorization": "Bot " + val }, timeout: 5000 };
  } else if (keyName === "ANTHROPIC_API_KEY") {
    testUrl = "https://api.anthropic.com/v1/models";
    testOpts = { headers: { "x-api-key": val, "anthropic-version": "2023-06-01" }, timeout: 5000 };
  } else if (keyName === "GEMINI_API_KEY") {
    testUrl = "https://generativelanguage.googleapis.com/v1beta/models?key=" + val;
    testOpts = { timeout: 5000 };
  } else if (keyName === "MISTRAL_API_KEY") {
    testUrl = "https://api.mistral.ai/v1/models";
    testOpts = { headers: { "Authorization": "Bearer " + val }, timeout: 5000 };
  } else if (keyName === "XAI_API_KEY") {
    testUrl = "https://api.x.ai/v1/models";
    testOpts = { headers: { "Authorization": "Bearer " + val }, timeout: 5000 };
  } else if (keyName === "OPENROUTER_API_KEY") {
    testUrl = "https://openrouter.ai/api/v1/models";
    testOpts = { headers: { "Authorization": "Bearer " + val }, timeout: 5000 };
  } else if (keyName === "CEREBRAS_API_KEY") {
    testUrl = "https://api.cerebras.ai/v1/models";
    testOpts = { headers: { "Authorization": "Bearer " + val }, timeout: 5000 };
  } else if (keyName === "COHERE_API_KEY") {
    testUrl = "https://api.cohere.ai/v1/models";
    testOpts = { headers: { "Authorization": "Bearer " + val }, timeout: 5000 };
  } else if (keyName === "HF_TOKEN") {
    testUrl = "https://huggingface.co/api/whoami-v2";
    testOpts = { headers: { "Authorization": "Bearer " + val }, timeout: 5000 };
  }
  if (!testUrl) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Unknown key type" }));
    return;
  }
  const https = require("https");
  const r = https.get(testUrl, testOpts, function(resp) {
    let data = "";
    resp.on("data", function(c) { data += c; });
    resp.on("end", function() {
      const ok = resp.statusCode >= 200 && resp.statusCode < 300;
      let info = "";
      try {
        const j = JSON.parse(data);
        if (keyName === "TELEGRAM_BOT_TOKEN" && j.result) info = "@" + j.result.username;
        else if (j.data && j.data.length) info = j.data.length + " models";
        else if (j.error) info = j.error.message || j.error.type || "";
      } catch (e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: ok, status: resp.statusCode, info: info }));
    });
  });
  r.on("error", function(e) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  });
  r.on("timeout", function() { r.destroy(); });
}

// --- Module Management API ---
function _handleModules(req, res) {
  var envData = {};
  try {
    _fs.readFileSync(_ENV_FILE, "utf8").split("\n").forEach(function(l) {
      var eq = l.indexOf("=");
      if (eq > 0) envData[l.substring(0, eq).trim()] = l.substring(eq + 1).trim();
    });
  } catch (e) {}
  var modules = _ALL_MODULES.map(function(m) {
    var st = _getModuleStatus(m);
    var keySet = m.key ? !!(envData[m.key] || process.env[m.key]) : false;
    // canToggle: false for modules with no pkgs (use openai SDK) or always-active (telegram)
    var canToggle = m.pkgs.length > 0 && m.def !== "active";
    return { id: m.id, name: m.name, type: m.type, key: m.key, keySet: keySet, status: st, ram: m.ram, canToggle: canToggle };
  });
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({ modules: modules, restartNeeded: _restartNeeded }));
}

function _handleModuleToggle(req, res) {
  var body = "";
  req.on("data", function(c) { body += c; });
  req.on("end", function() {
    try {
      var d = JSON.parse(body);
      var mod = _ALL_MODULES.find(function(m) { return m.id === d.id; });
      if (!mod || mod.pkgs.length === 0 || mod.def === "active") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Cannot toggle this module" }));
        return;
      }
      _moduleOverrides[d.id] = d.enabled ? "lazy" : "dead";
      // Ensure /sdcard/pocketclaw/ directory exists
      try { _fs.mkdirSync("/sdcard/pocketclaw", { recursive: true }); } catch(e) {}
      _fs.writeFileSync(_MODULES_FILE, JSON.stringify(_moduleOverrides, null, 2));
      _restartNeeded = true;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, restartNeeded: true, module: { id: mod.id, status: _moduleOverrides[d.id] } }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
}

// --- Auth token for API endpoints (C2) ---
const _AUTH_TOKEN = process.env.POCKETCLAW_TOKEN || "";
function _checkAuth(req, res) {
  if (!_AUTH_TOKEN) return true; // no token configured = open access
  const hdr = req.headers["x-pocketclaw-token"];
  const url = require("url").parse(req.url, true);
  if (hdr === _AUTH_TOKEN || url.query.token === _AUTH_TOKEN) return true;
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
  return false;
}

// --- Server mode + Control state ---
let _serverMode = false;
let _serverModeStarted = 0;

// --- Debloat package list (126 packages from restore-debloat.sh) ---
const _DEBLOAT_PKGS = [
  "com.google.android.apps.docs","com.google.android.apps.docs.editors.docs",
  "com.google.android.apps.inputmethod.hindi","com.google.android.apps.magazines",
  "com.google.android.apps.maps","com.google.android.apps.photos",
  "com.google.android.apps.plus","com.google.android.gm",
  "com.google.android.gms","com.google.android.googlequicksearchbox",
  "com.google.android.gsf","com.google.android.gsf.login",
  "com.google.android.inputmethod.latin","com.google.android.music",
  "com.google.android.talk","com.google.android.tts",
  "com.google.android.videos","com.google.android.youtube",
  "com.google.android.apps.books","com.google.android.apps.cloudprint",
  "com.google.android.backuptransport","com.google.android.calendar",
  "com.google.android.configupdater","com.google.android.deskclock",
  "com.google.android.feedback","com.google.android.gallery3d",
  "com.google.android.gm.exchange","com.google.android.inputmethod.korean",
  "com.google.android.inputmethod.pinyin","com.google.android.launcher",
  "com.google.android.marvin.talkback","com.google.android.onetimeinitializer",
  "com.google.android.partnersetup","com.google.android.play.games",
  "com.google.android.setupwizard","com.google.android.syncadapters.contacts",
  "com.lmi.motorola.rescuesecurity","com.motorola.actions",
  "com.motorola.android.fmradio","com.motorola.android.jvtcmd",
  "com.motorola.android.nativedropboxagent","com.motorola.android.provisioning",
  "com.motorola.android.settings.diag_mdlog","com.motorola.android.settings.modemdebug",
  "com.motorola.appdirectedsmsproxy","com.motorola.audioeffects",
  "com.motorola.bach.modemstats","com.motorola.bodyguard",
  "com.motorola.bug2go","com.motorola.camera",
  "com.motorola.ccc.checkin","com.motorola.ccc.devicemanagement",
  "com.motorola.ccc.mainplm","com.motorola.ccc.notification",
  "com.motorola.ccc.ota","com.motorola.contacts.preloadcontacts",
  "com.motorola.context","com.motorola.coresettingsext",
  "com.motorola.demo","com.motorola.emaraphoneextns",
  "com.motorola.fmplayer","com.motorola.genie",
  "com.motorola.groundloopnoisepreventer","com.motorola.launcherconfig",
  "com.motorola.moodles","com.motorola.MotGallery2",
  "com.motorola.motgeofencesvc","com.motorola.moto",
  "com.motorola.motocare","com.motorola.motocare.internal",
  "com.motorola.motocit","com.motorola.motodisplay",
  "com.motorola.motodisplay.env","com.motorola.onetimeinitializer",
  "com.motorola.sensorhub.stml0.updater","com.motorola.setup",
  "com.motorola.slpc","com.motorola.storageoptimizer",
  "com.motorola.wappushsi",
  "com.android.cellbroadcastreceiver","com.android.chrome",
  "com.android.documentsui","com.android.mms",
  "com.android.providers.calendar","com.android.vending",
  "com.android.backupconfirm","com.android.bluetooth",
  "com.android.bluetoothmidiservice","com.android.bookmarkprovider",
  "com.android.calculator2","com.android.captiveportallogin",
  "com.android.carrierconfig","com.android.certinstaller",
  "com.android.contacts","com.android.dialer",
  "com.android.dreams.basic","com.android.facelock",
  "com.android.htmlviewer","com.android.location.fused",
  "com.android.managedprovisioning","com.android.mms.service",
  "com.android.pacprocessor","com.android.printspooler",
  "com.android.providers.calllogbackup","com.android.providers.contacts",
  "com.android.providers.partnerbookmarks","com.android.providers.userdictionary",
  "com.android.proxyhandler","com.android.sharedstoragebackup",
  "com.android.statementservice","com.android.stk",
  "com.android.vpndialogs","com.android.wallpaper.livepicker",
  "com.android.wallpapercropper",
  "com.qualcomm.atfwd","com.qualcomm.location","com.qualcomm.timeservice",
  "com.android.phone","com.android.server.telecom",
  "com.android.providers.telephony","com.qualcomm.qcrilmsgtunnel",
  "com.motorola.android.dm.service","com.motorola.slpc_sys",
  "com.android.systemui"
];

// --- Control API handlers ---
function _handleControl(req, res) {
  const mem = process.memoryUsage();
  const data = {
    serverMode: _serverMode,
    serverModeUptime: _serverMode ? Math.round((Date.now() - _serverModeStarted) / 1000) : 0,
    gatewayPid: process.pid,
    rss: Math.round(mem.rss / 1048576),
    heap: Math.round(mem.heapUsed / 1048576),
    heapLimit: Math.round(require("v8").getHeapStatistics().heap_size_limit / 1048576)
  };
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function _handleServerMode(req, res) {
  let body = "";
  req.on("data", function(c) { body += c; });
  req.on("end", function() {
    try {
      const d = JSON.parse(body);
      _serverMode = !!d.enabled;
      if (_serverMode) {
        _serverModeStarted = Date.now();
        if (typeof global.gc === "function") global.gc();
        console.log("[hijack] Server mode ON — GC forced");
      } else {
        _serverModeStarted = 0;
        console.log("[hijack] Server mode OFF");
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, serverMode: _serverMode }));
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
}

function _handleReboot(req, res) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, message: "Rebooting in 3s" }));
  console.log("[hijack] Reboot requested — shutting down in 3s");
  setTimeout(function() {
    try {
      require("child_process").execSync("reboot", { timeout: 5000 });
    } catch (e) {
      try { require("child_process").execSync("su -c reboot", { timeout: 5000 }); }
      catch (e2) { console.error("[hijack] Reboot failed: " + e2.message); }
    }
  }, 3000);
}

function _handleRestart(req, res) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, message: "Gateway restarting in 2s" }));
  console.log("[hijack] Restart requested — exiting in 2s (wrapper will relaunch)");
  setTimeout(function() { process.exit(0); }, 2000);
}

function _handleGC(req, res) {
  if (typeof global.gc === "function") {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const after = process.memoryUsage().heapUsed;
    const freed = Math.round((before - after) / 1048576);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, freedMB: freed, heapMB: Math.round(after / 1048576) }));
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "GC not exposed (need --expose-gc)" }));
  }
}

function _handleDebloat(req, res) {
  res.writeHead(200, { "Content-Type": "application/json", "Transfer-Encoding": "chunked" });
  const cp = require("child_process");
  let done = 0, failed = 0, errors = [];
  function next(i) {
    if (i >= _DEBLOAT_PKGS.length) {
      res.end(JSON.stringify({ ok: true, total: _DEBLOAT_PKGS.length, done: done, failed: failed, errors: errors.slice(0, 10) }));
      return;
    }
    const pkg = _DEBLOAT_PKGS[i];
    try {
      cp.execSync("pm disable-user --user 0 " + pkg, { timeout: 5000 });
      done++;
    } catch (e) {
      try {
        cp.execSync("pm uninstall -k --user 0 " + pkg, { timeout: 5000 });
        done++;
      } catch (e2) {
        failed++;
        errors.push(pkg);
      }
    }
    // Yield to event loop every 10 packages
    if (i % 10 === 0) setTimeout(function() { next(i + 1); }, 0);
    else next(i + 1);
  }
  console.log("[hijack] Debloat starting — " + _DEBLOAT_PKGS.length + " packages");
  next(0);
}

function _handleSetLauncher(req, res) {
  const cp = require("child_process");
  try {
    // Disable stock launchers
    try { cp.execSync("pm disable-user --user 0 com.google.android.launcher", { timeout: 5000 }); } catch (e) {}
    try { cp.execSync("pm disable-user --user 0 com.motorola.launcherconfig", { timeout: 5000 }); } catch (e) {}
    console.log("[hijack] Stock launchers disabled — PocketClaw is default");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

function _handleHarden(req, res) {
  const cp = require("child_process");
  const cmds = [
    "settings put global window_animation_scale 0",
    "settings put global transition_animation_scale 0",
    "settings put global animator_duration_scale 0",
    "settings put system screen_brightness 0",
    "settings put system screen_off_timeout 15000",
    "settings put global wifi_sleep_policy 2"
  ];
  let ok = 0;
  cmds.forEach(function(cmd) {
    try { cp.execSync(cmd, { timeout: 5000 }); ok++; } catch (e) {}
  });
  console.log("[hijack] System hardened — " + ok + "/" + cmds.length + " settings applied");
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, applied: ok, total: cmds.length }));
}

// --- CTRL Web Page HTML ---
const _CTRL = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#000a00">
<title>PocketClaw Control</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000a00;color:#0f0;font-family:'Courier New',monospace;min-height:100vh;-webkit-user-select:none}
body::before{content:"";position:fixed;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,10,0,.7));pointer-events:none;z-index:90}
body::after{content:"";position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.1) 0px,rgba(0,0,0,.1) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:91}
.nav{display:flex;padding:4px 6px 0;gap:4px;position:relative;z-index:10}
.nav a{flex:1;text-align:center;padding:1.8vw 0;font-size:2.6vw;text-decoration:none;letter-spacing:.2em;border:1px solid #0a3a0a;border-bottom:none;border-radius:4px 4px 0 0;color:#073;background:#000a00;transition:all .2s}
.nav a.act{color:#0f0;background:#001a00;border-color:rgba(0,255,65,.2);text-shadow:0 0 6px rgba(0,255,65,.4)}
.frame{margin:0 6px 6px;border:1px solid rgba(0,255,65,.12);border-radius:0 0 5px 5px;box-shadow:0 0 25px rgba(0,255,65,.04),inset 0 0 50px rgba(0,0,0,.5);min-height:85vh;padding:12px 14px}
.t{text-align:center;font-size:4.5vw;letter-spacing:.5em;color:#0f0;margin:6px 0 2px;text-shadow:0 0 10px rgba(0,255,65,.5)}
.sub{text-align:center;font-size:2vw;color:#1a3a1a;margin-bottom:10px;letter-spacing:.2em}
.sec{font-size:1.8vw;color:#0a3a0a;letter-spacing:.4em;margin:12px 0 6px 4px}
.row{display:flex;align-items:center;padding:2vw 0;font-size:3vw}
.row .lbl{width:30vw;color:#073}.row .val{flex:1;color:#0f0;text-align:right}
.btn{display:block;width:100%;background:#001a00;border:2px solid #0a3a0a;color:#073;font-family:'Courier New',monospace;font-size:3.5vw;padding:3vw;border-radius:4px;cursor:pointer;letter-spacing:.2em;margin:2vw 0;transition:all .2s;text-align:center}
.btn:active{background:#002a00;border-color:#0f0;color:#0f0}
.btn.on{border-color:#0f0;color:#0f0;background:#002a00}
.btn.danger{border-color:#522;color:#e33}
.btn.danger:active{background:#200;border-color:#f66}
.stat{font-size:2.4vw;color:#073;padding:1vw 0}
.stat span{color:#0a0}
.sp{border-top:1px solid rgba(0,255,65,.06);margin:3vw 0}
.msg{text-align:center;padding:2vw;font-size:2.8vw;min-height:4vw;color:#0f0}
</style></head><body>
<div class="nav"><a href="/dashboard">STATUS</a><a href="/keys">KEYS</a><a href="/logs">LOGS</a><a href="/control" class="act">CTRL</a></div>
<div class="frame">
<div class="t">CONTROL</div>
<div class="sub">GATEWAY MANAGEMENT</div>
<div class="sec">SERVER</div>
<div class="row"><span class="lbl">PID</span><span class="val" id="pid">...</span></div>
<div class="row"><span class="lbl">RSS</span><span class="val" id="rss">...</span></div>
<div class="row"><span class="lbl">Heap</span><span class="val" id="heap">...</span></div>
<div class="row"><span class="lbl">Heap Limit</span><span class="val" id="hlimit">...</span></div>
<div class="sp"></div>
<div class="sec">ACTIONS</div>
<button class="btn" id="sm" onclick="toggleServer()">SERVER MODE: OFF</button>
<button class="btn" onclick="doGC()">FORCE GC</button>
<button class="btn danger" onclick="doReboot()">REBOOT DEVICE</button>
<div class="sp"></div>
<div class="sec">SETUP</div>
<button class="btn" onclick="doDebloat()">DEBLOAT ANDROID (126 pkgs)</button>
<button class="btn" onclick="doLauncher()">SET HOME SCREEN</button>
<button class="btn" onclick="doHarden()">HARDEN SYSTEM</button>
<div class="sp"></div>
<div class="sec">MODULES</div>
<div id="mods"></div>
<div class="sp"></div>
<div class="msg" id="msg"></div>
</div>
<script>
function poll(){
fetch("/api/control").then(function(r){return r.json()}).then(function(d){
document.getElementById("pid").textContent=d.gatewayPid;
document.getElementById("rss").textContent=d.rss+" MB";
document.getElementById("heap").textContent=d.heap+" MB";
document.getElementById("hlimit").textContent=d.heapLimit+" MB";
var btn=document.getElementById("sm");
btn.textContent="SERVER MODE: "+(d.serverMode?"ON":"OFF");
btn.className="btn"+(d.serverMode?" on":"");
}).catch(function(){})}
function toggleServer(){
fetch("/api/control").then(function(r){return r.json()}).then(function(d){
fetch("/api/control/server-mode",{method:"POST",headers:{"Content-Type":"application/json"},
body:JSON.stringify({enabled:!d.serverMode})}).then(function(){poll()})
})}
function doGC(){
fetch("/api/control/gc",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
msg(d.ok?"GC freed "+d.freedMB+" MB":"GC: "+d.error);poll()}).catch(function(){msg("Error")})}
function doReboot(){
if(!confirm("Reboot device?"))return;
fetch("/api/control/reboot",{method:"POST"}).then(function(){msg("Rebooting in 3s...")})}
function doDebloat(){
if(!confirm("Disable 126 packages?"))return;
msg("Debloating...");
fetch("/api/setup/debloat",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
msg("Done: "+d.done+"/"+d.total+" disabled, "+d.failed+" failed")}).catch(function(){msg("Error")})}
function doLauncher(){
fetch("/api/setup/launcher",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
msg(d.ok?"PocketClaw set as home":"Error: "+d.error)}).catch(function(){msg("Error")})}
function doHarden(){
fetch("/api/setup/harden",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
msg("Applied "+d.applied+"/"+d.total+" settings")}).catch(function(){msg("Error")})}
function msg(t){document.getElementById("msg").textContent=t;setTimeout(function(){document.getElementById("msg").textContent=""},5000)}
function pollMods(){
fetch("/api/modules").then(function(r){return r.json()}).then(function(d){
var h="";
d.modules.forEach(function(m){
var icon=m.status==="active"?"\u25CF":m.status==="lazy"?"\u25D0":"\u25CB";
h+='<div class="row"><span class="lbl">'+icon+" "+m.name+'</span>';
h+='<span class="val">'+m.status.toUpperCase()+(m.ram?(" ~"+m.ram+"MB"):"")+'</span></div>';
if(m.canToggle){var cls=m.status==="dead"?"":" on";
h+='<button class="btn'+cls+'" onclick="toggleMod(\''+m.id+'\','+(m.status==="dead"?"true":"false")+')">'+(m.status==="dead"?"ENABLE":"DISABLE")+'</button>';}
});
if(d.restartNeeded)h+='<div class="msg" style="color:#ee3">\u26A0 Restart needed for changes to take effect</div>';
document.getElementById("mods").innerHTML=h;
}).catch(function(){})}
function toggleMod(id,en){
fetch("/api/modules/toggle",{method:"POST",headers:{"Content-Type":"application/json"},
body:JSON.stringify({id:id,enabled:en})}).then(function(){pollMods();msg(en?"Enabled (restart needed)":"Disabled (restart needed)")}).catch(function(){msg("Toggle failed")})}
poll();setInterval(poll,5000);pollMods();
</script></body></html>`;

// C7: History ring buffer — RAM, heap, load avg every 30s (last 30 min = 60 entries)
const _historyBuf = [];
const _HISTORY_MAX = 60;
setInterval(function() {
  try {
    var mem = process.memoryUsage();
    var mi = _fs.readFileSync("/proc/meminfo", "utf8");
    var g = function(k) { var m = mi.match(new RegExp(k + ":\\s+(\\d+)")); return m ? Math.round(+m[1] / 1024) : 0; };
    var total = g("MemTotal");
    var avail = g("MemAvailable");
    var used = avail > 0 ? total - avail : total - g("MemFree") - g("Buffers") - g("Cached");
    _historyBuf.push({
      t: Date.now(),
      ram: used,
      ramTotal: total,
      heap: Math.round(mem.heapUsed / 1048576),
      rss: Math.round(mem.rss / 1048576)
    });
    if (_historyBuf.length > _HISTORY_MAX) _historyBuf.shift();
  } catch (e) {}
}, 30000);

// Add serverMode + V8 heap to _getStatus response
var _origGetStatus = _getStatus;
_getStatus = function() {
  var s = _origGetStatus();
  s.serverMode = _serverMode;
  var pm = process.memoryUsage();
  var hs = _v8.getHeapStatistics();
  s.heap = { used: Math.round(pm.heapUsed / 1048576), limit: Math.round(hs.heap_size_limit / 1048576) };
  return s;
};

// --- Intercept HTTP server ---
const _origListen = _http.Server.prototype.listen;
_http.Server.prototype.listen = function () {
  const origEmit = this.emit;
  this.emit = function (event) {
    if (event === "request") {
      const req = arguments[1], res = arguments[2];
      if (req && req.url) {
        if (req.url === "/dashboard") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(_DASH);
          return true;
        }
        if (req.url === "/setup") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(_SETUP);
          return true;
        }
        if (req.url === "/api/setup" && req.method === "POST") {
          _handleSetup(req, res);
          return true;
        }
        if (req.url === "/api/heap") {
          const mem = process.memoryUsage();
          const hs = _v8.getHeapStatistics();
          const spaces = _v8.getHeapSpaceStatistics();
          const mods = Object.keys(require.cache);
          const data = {
            process_mb: {
              rss: Math.round(mem.rss / 1048576),
              heapTotal: Math.round(mem.heapTotal / 1048576),
              heapUsed: Math.round(mem.heapUsed / 1048576),
              external: Math.round(mem.external / 1048576),
              arrayBuffers: Math.round(mem.arrayBuffers / 1048576)
            },
            v8_mb: {
              heapSizeLimit: Math.round(hs.heap_size_limit / 1048576),
              totalHeapSize: Math.round(hs.total_heap_size / 1048576),
              usedHeapSize: Math.round(hs.used_heap_size / 1048576),
              totalPhysical: Math.round(hs.total_physical_size / 1048576),
              malloced: Math.round(hs.malloced_memory / 1048576),
              externalMem: Math.round(hs.external_memory / 1048576),
              nativeContexts: hs.number_of_native_contexts,
              detachedContexts: hs.number_of_detached_contexts
            },
            spaces: spaces.map(s => ({
              name: s.space_name,
              size_mb: +(s.space_size / 1048576).toFixed(1),
              used_mb: +(s.space_used_size / 1048576).toFixed(1),
              avail_mb: +(s.space_available_size / 1048576).toFixed(1)
            })),
            modules: { count: mods.length, lazy: { intercepted: _lazyTotal, loaded: _lazyLoaded, pending: _lazyCache.size - _lazyLoaded, log: _lazyLog }, sample: mods.slice(-20).map(m => m.split("/").slice(-2).join("/")) },
            packages: (() => {
              const pkgs = {};
              mods.forEach(m => {
                const nm = m.lastIndexOf("node_modules/");
                if (nm === -1) { pkgs["[app]"] = (pkgs["[app]"] || 0) + 1; return; }
                const rest = m.substring(nm + 13);
                const pkg = rest.startsWith("@") ? rest.split("/").slice(0, 2).join("/") : rest.split("/")[0];
                pkgs[pkg] = (pkgs[pkg] || 0) + 1;
              });
              return Object.entries(pkgs).sort((a, b) => b[1] - a[1]).map(([n, c]) => n + ": " + c);
            })()
          };
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify(data, null, 2));
          return true;
        }
        if (req.url === "/keys") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(_KEYS);
          return true;
        }
        if (req.url === "/logs") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(_LOGS);
          return true;
        }
        if ((req.url === "/api/logs" || req.url.indexOf("/api/logs?") === 0) && req.method === "GET") {
          var logUrl = require("url").parse(req.url, true);
          var level = logUrl.query.level;
          var lines = _logBuffer.slice();
          if (level === "error") lines = lines.filter(function(l) { return l.indexOf("ERROR") > -1 || l.indexOf("!") === 0; });
          else if (level === "warn") lines = lines.filter(function(l) { return l.indexOf("WARN") > -1; });
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ lines: lines, lazy: _lazyLog.slice(-20) }));
          return true;
        }
        if (req.url === "/api/logs/stream") {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*" });
          res.write("data: " + JSON.stringify({ type: "init", lines: _logBuffer.slice() }) + "\n\n");
          var _sseLastLen = _logBuffer.length;
          var _sseTimer = setInterval(function() {
            if (_logBuffer.length !== _sseLastLen) {
              var newLines = _logBuffer.slice(Math.max(0, _sseLastLen));
              res.write("data: " + JSON.stringify({ type: "update", lines: newLines }) + "\n\n");
              _sseLastLen = _logBuffer.length;
            }
          }, 1000);
          req.on("close", function() { clearInterval(_sseTimer); });
          return true;
        }
        if (req.url === "/api/logs/clear" && req.method === "POST") {
          if (!_checkAuth(req, res)) return true;
          _logBuffer.length = 0;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return true;
        }
        if (req.url === "/api/keys" && req.method === "GET") {
          if (!_checkAuth(req, res)) return true;
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify(_getKeys()));
          return true;
        }
        if (req.url === "/api/keys" && req.method === "POST") {
          if (!_checkAuth(req, res)) return true;
          _handleKeySave(req, res);
          return true;
        }
        if (req.url && req.url.indexOf("/api/keys/test") === 0) {
          if (!_checkAuth(req, res)) return true;
          _handleKeyTest(req, res);
          return true;
        }
        if (req.url === "/api/history") {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ points: _historyBuf, interval: 30 }));
          return true;
        }
        if (req.url === "/api/status" || req.url.indexOf("/api/status?") === 0) {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
          res.end(JSON.stringify(_getStatus()));
          return true;
        }
        // --- v3.0 Control endpoints ---
        if (req.url === "/control") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(_CTRL);
          return true;
        }
        if (req.url === "/api/control" && req.method === "GET") {
          _handleControl(req, res);
          return true;
        }
        if (req.url === "/api/control/server-mode" && req.method === "POST") {
          if (!_checkAuth(req, res)) return true;
          _handleServerMode(req, res);
          return true;
        }
        if (req.url === "/api/control/reboot" && req.method === "POST") {
          if (!_checkAuth(req, res)) return true;
          _handleReboot(req, res);
          return true;
        }
        if (req.url === "/api/control/restart" && req.method === "POST") {
          if (!_checkAuth(req, res)) return true;
          _handleRestart(req, res);
          return true;
        }
        if (req.url === "/api/control/gc" && req.method === "POST") {
          if (!_checkAuth(req, res)) return true;
          _handleGC(req, res);
          return true;
        }
        if (req.url === "/api/setup/debloat" && req.method === "POST") {
          _handleDebloat(req, res);
          return true;
        }
        if (req.url === "/api/setup/launcher" && req.method === "POST") {
          _handleSetLauncher(req, res);
          return true;
        }
        if (req.url === "/api/setup/harden" && req.method === "POST") {
          _handleHarden(req, res);
          return true;
        }
        // --- Module management endpoints ---
        if (req.url === "/api/modules" && req.method === "GET") {
          _handleModules(req, res);
          return true;
        }
        if (req.url === "/api/modules/toggle" && req.method === "POST") {
          _handleModuleToggle(req, res);
          return true;
        }
      }
    }
    return origEmit.apply(this, arguments);
  };
  console.log("[hijack] Dashboard on :" + (arguments[0] || "?") + " | Setup: /setup | CTRL: /control");
  return _origListen.apply(this, arguments);
};
