// PocketClaw hijack.js
// Loaded via NODE_OPTIONS="-r /root/hijack.js"

// 1. Fix os.networkInterfaces (broken in proot)
const os = require("os");
os.networkInterfaces = () => ({});

// 2. Periodic GC if --expose-gc is active (frees ~10 MB per cycle)
if (typeof global.gc === "function") {
  setInterval(() => {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const after = process.memoryUsage().heapUsed;
    const freed = Math.round((before - after) / 1024 / 1024);
    if (freed > 5) {
      console.log("[hijack] GC freed " + freed + " MB");
    }
  }, 60000);
}

// 3. Dashboard — inject /dashboard and /api/status into OpenClaw's HTTP server
const _http = require("http");
const _fs = require("fs");

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
setInterval(_checkWifi, 10000);
setTimeout(_checkWifi, 3000);

// --- Status (all from /proc, zero shell commands) ---
function _getStatus() {
  const s = {
    gateway: { status: "up", code: 200 },
    wifi: _wifiOk,
    ram: { used: 0, total: 0 },
    swap: { used: 0, total: 0 },
    uptime: "0m",
    lastError: null,
    telegram: true,
    groq: !!process.env.GROQ_API_KEY
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
const _DASH = '<!DOCTYPE html><html><head>\
<meta charset="utf-8">\
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">\
<meta name="mobile-web-app-capable" content="yes">\
<meta name="theme-color" content="#000000">\
<title>PocketClaw</title>\
<style>\
*{margin:0;padding:0;box-sizing:border-box}\
body{background:#000;color:#0fc;font-family:Courier New,Courier,monospace;height:100vh;overflow:hidden;-webkit-user-select:none}\
body::after{content:\"\";position:fixed;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.12) 0px,rgba(0,0,0,.12) 1px,transparent 1px,transparent 3px);pointer-events:none;z-index:100}\
.c{padding:16px 14px;height:100vh;display:flex;flex-direction:column}\
.t{text-align:center;font-size:16px;letter-spacing:6px;color:#0fc;margin:8px 0 4px;text-shadow:0 0 10px rgba(0,255,204,.4)}\
.s{text-align:center;font-size:10px;color:#555;margin-bottom:8px}\
.lb{text-align:center;color:#ff8c00;font-size:12px;line-height:1.3;margin:4px 0;white-space:pre}\
.bd{flex:1;display:flex;flex-direction:column;justify-content:center}\
.r{display:flex;align-items:center;padding:3px 0;font-size:13px}\
.i{width:14px;text-align:center;margin-right:6px;font-size:10px}\
.ok{color:#0f4;animation:p 2s ease-in-out infinite}\
.fl{color:#f04}\
.of{color:#555}\
@keyframes p{0%,100%{opacity:.6}50%{opacity:1}}\
.l{width:80px;color:#666}\
.v{flex:1;color:#0f4}\
.v.e{color:#f04}\
.v.d{color:#555}\
.sp{border-top:1px solid #1a1a1a;margin:6px 0}\
.br{font-size:12px;padding:2px 0;color:#0f4}\
.br .x{color:#1a3a1a}\
.lg{margin-top:4px;font-size:11px;color:#555}\
.lg .e{padding:2px 0}\
.lg .e::before{content:\"> \";color:#0fc}\
.lg .er{color:#f04}\
.lg .er::before{color:#f04}\
.ft{text-align:center;font-size:9px;color:#222;margin-top:8px}\
</style></head><body>\
<div class="c">\
<div class="t">P O C K E T C L A W</div>\
<div class="s">Moto E2 1GB &#x2022; Android 6 &#x2022; Node 22</div>\
<pre class="lb" id="lb"></pre>\
<pre id="f0" hidden>       ,---./\\\n      / ,-.||]  bzzz\n  ___/ /   \\|\n /   \\/  o  |\n \\___/\\    /=\\\n  ||| |`     |\n  ||| | |  |  |\n  ^^^ ^ ^  ^  ^</pre>\
<pre id="f1" hidden>       ,---.\n      / ,-./ \\\n  ___/ /  ||]  bzzz\n /   \\/  o\\|\n \\___/\\    /=\\\n  ||| |`     |\n  ||| | |  |  |\n  ^^^ ^ ^  ^  ^</pre>\
<div class="bd">\
<div class="r"><span class="i" id="ig">&#x25CF;</span><span class="l">Gateway</span><span class="v" id="vg">...</span></div>\
<div class="r"><span class="i" id="iw">&#x25CF;</span><span class="l">WiFi</span><span class="v" id="vw">...</span></div>\
<div class="r"><span class="i" id="it">&#x25CF;</span><span class="l">Telegram</span><span class="v" id="vt">...</span></div>\
<div class="r"><span class="i" id="iq">&#x25CF;</span><span class="l">Groq</span><span class="v" id="vq">...</span></div>\
<div class="sp"></div>\
<div class="r"><span class="i"></span><span class="l">RAM</span><span class="v" id="vr">...</span></div>\
<div class="br" id="rb"></div>\
<div class="r"><span class="i"></span><span class="l">Swap</span><span class="v" id="vs">...</span></div>\
<div class="sp"></div>\
<div class="lg">\
<div class="e" id="lu">uptime: ...</div>\
<div class="e" id="le">errors: ...</div>\
</div></div>\
<div class="ft">heap 128 MB &#x2022; V8 + proot &#x2022; demoscene edition</div>\
</div>\
<script>\
var t=0,F=[document.getElementById("f0").textContent,document.getElementById("f1").textContent];\
function si(id,c){document.getElementById(id).className="i "+c}\
function go(){\
fetch("/api/status").then(function(r){return r.json()}).then(function(d){\
si("ig",d.gateway.status==="up"?"ok":"fl");\
document.getElementById("vg").textContent=d.gateway.code+" OK";\
document.getElementById("vg").className="v"+(d.gateway.status==="up"?"":" e");\
si("iw",d.wifi?"ok":"fl");\
document.getElementById("vw").textContent=d.wifi?"Online":"Offline";\
document.getElementById("vw").className="v"+(d.wifi?"":" e");\
si("it",d.telegram?"ok":"fl");\
document.getElementById("vt").textContent=d.telegram?"Live":"Down";\
document.getElementById("vt").className="v"+(d.telegram?"":" e");\
si("iq",d.groq?"ok":"of");\
document.getElementById("vq").textContent=d.groq?"Ready":"No Key";\
document.getElementById("vq").className="v"+(d.groq?"":" d");\
document.getElementById("vr").textContent=d.ram.used+"/"+d.ram.total+" MB";\
var p=Math.round(d.ram.used/d.ram.total*100),f=Math.round(p/5),e=20-f;\
document.getElementById("rb").innerHTML="  ["+String.fromCharCode(9608).repeat(f)+"<span class=x>"+String.fromCharCode(9617).repeat(e)+"</span>] "+p+"%";\
document.getElementById("vs").textContent=d.swap.used+"/"+d.swap.total+" MB";\
document.getElementById("lu").textContent="uptime: "+d.uptime;\
if(d.lastError){document.getElementById("le").textContent="err: "+d.lastError;document.getElementById("le").className="e er"}\
else{document.getElementById("le").textContent="errors: 0";document.getElementById("le").className="e";document.getElementById("le").style.color="#0f4"}\
}).catch(function(){si("ig","fl");document.getElementById("vg").textContent="OFFLINE";document.getElementById("vg").className="v e"});\
document.getElementById("lb").textContent=F[t%2];t++}\
go();setInterval(go,3000);\
</script></body></html>';

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
        if (req.url === "/api/status" || req.url.indexOf("/api/status?") === 0) {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
          res.end(JSON.stringify(_getStatus()));
          return true;
        }
      }
    }
    return origEmit.apply(this, arguments);
  };
  console.log("[hijack] Dashboard on :" + (arguments[0] || "?"));
  return _origListen.apply(this, arguments);
};
