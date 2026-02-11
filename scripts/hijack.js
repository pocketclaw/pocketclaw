// PocketClaw hijack.js — Loaded via NODE_OPTIONS="-r /root/hijack.js"

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
    if (freed > 5) console.log("[hijack] GC freed " + freed + " MB");
  }, 60000);
}

// 3. Dashboard — inject /dashboard, /api/status into OpenClaw's HTTP server
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
    telegram: true,
    kimi: !!(process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY),
    procs: _getProcs()
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
.frame{margin:6px;flex:1;border:1px solid rgba(0,255,65,.12);border-radius:5px;box-shadow:0 0 25px rgba(0,255,65,.04),inset 0 0 50px rgba(0,0,0,.5);overflow-y:auto;-webkit-overflow-scrolling:touch;position:relative}
.frame::before{content:"";position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(0,255,65,.2),transparent);animation:scanl 4s linear infinite;z-index:5;pointer-events:none}
@keyframes scanl{0%{top:0}100%{top:100%}}
.pad{padding:10px 12px}
.t{text-align:center;font-size:5vw;letter-spacing:.8em;color:#0f0;margin:8px 0 2px;padding-right:-.8em;text-shadow:0 0 10px rgba(0,255,65,.5),0 0 30px rgba(0,255,65,.15);animation:glow 3s ease-in-out infinite}
@keyframes glow{0%,100%{text-shadow:0 0 10px rgba(0,255,65,.5),0 0 30px rgba(0,255,65,.15)}50%{text-shadow:0 0 20px rgba(0,255,65,.7),0 0 50px rgba(0,255,65,.25)}}
.sub{text-align:center;font-size:2vw;color:#1a3a1a;margin-bottom:2px;letter-spacing:.3em}
.lb{text-align:center;color:#f90;font-size:4vw;line-height:1.3;margin:4px 0;white-space:pre;text-shadow:0 0 10px rgba(255,153,0,.6),0 0 20px rgba(255,100,0,.25);min-height:14vw;font-weight:bold}
.sec-t{font-size:1.8vw;color:#0a3a0a;letter-spacing:.4em;text-transform:uppercase;margin:4px 0 2px 18px}
.r{display:flex;align-items:center;padding:1vw 0;font-size:3vw}
.i{width:16px;text-align:center;margin-right:4px;font-size:2.2vw}
.ok{color:#0f0;text-shadow:0 0 6px rgba(0,255,65,.7);animation:pulse 2.5s ease-in-out infinite}
.fl{color:#555}.of{color:#0a3a0a}
@keyframes pulse{0%,100%{opacity:.45}50%{opacity:1}}
.l{width:22vw;color:#073;font-size:2.8vw}
.v{flex:1;color:#0f0;font-size:2.8vw}.v.e{color:#555}.v.d{color:#0a3a0a}
.sp{border-top:1px solid rgba(0,255,65,.06);margin:1.5vw 0}
.bw{padding:2px 0 2px 20px;padding-right:8px}
.bar{height:2.4vw;border-radius:2px;background:#001a00;border:1px solid #0a2a0a;overflow:hidden}
.bf{height:100%;border-radius:1px;transition:width .6s ease}
.bf.lo{background:linear-gradient(90deg,#040,#0c0)}
.bf.md{background:linear-gradient(90deg,#060,#0f0)}
.bf.hi{background:linear-gradient(90deg,#080,#4f4);animation:barP 1.5s ease-in-out infinite}
@keyframes barP{0%,100%{opacity:.8}50%{opacity:1}}
.bl{font-size:1.8vw;color:#1a3a1a;text-align:right;margin-top:1px;padding-right:2px}
.pr{display:flex;align-items:center;padding:.6vw 0 .6vw 20px;font-size:2.4vw}
.pn{width:28vw;color:#073;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pm{width:14vw;text-align:right;color:#0a0;font-size:2.2vw;padding-right:2vw}
.pb{flex:1;height:1.8vw;background:#001a00;border-radius:1px;overflow:hidden}
.pf{height:100%;background:linear-gradient(90deg,#040,#0c0);border-radius:1px;transition:width .6s}
.lg{margin-top:2px;font-size:2.4vw;color:#073}
.lg .e{padding:1px 0;padding-left:20px}
.lg .e::before{content:"\\203A ";color:#0a0}
.lg .er{color:#f66}.lg .er::before{color:#f66}
.ft{text-align:center;font-size:1.6vw;color:#082a08;padding:6px 0;letter-spacing:.2em}
</style></head><body>
<div class="boot" id="boot">
<div class="ln">&gt; POCKETCLAW v4.0</div>
<div class="ln">&gt; GATEWAY .............. <span class="val" id="bs1">---</span></div>
<div class="ln">&gt; WIFI ................. <span class="val" id="bs2">---</span></div>
<div class="ln">&gt; TELEGRAM ............. <span class="val" id="bs3">---</span></div>
<div class="ln">&gt; KIMI K2.5 ............ <span class="val" id="bs4">---</span></div>
<div class="ln">&gt; RAM .................. <span class="val" id="bs5">---</span></div>
<div class="ln">&gt; SYSTEM ONLINE<span class="cur">_</span></div>
</div>
<div class="shell">
<div class="frame">
<div class="pad">
<div class="t">POCKETCLAW</div>
<div class="sub">MOTO E2 &#x2022; 1GB &#x2022; ANDROID 6</div>
<pre class="lb" id="lb"></pre>
<pre id="f0" hidden>      )\\.----./(
     /( o    o )\\
    /  |\\    /|  \\
    \\ /  \\--/  \\ /
     V  /(  )\\  V
     | |  ()  | |
     |  '----'  |
     | /||  ||\\ |
     |/ ||  || \\|
        ^^  ^^</pre>
<pre id="f1" hidden>      )(.----.)(
     /( o    o )\\
    /  |\\    /|  \\
    \\ /  \\--/  \\ /
     V  /(  )\\  V
     | |  ()  | |
     |  '----'  |
     | /||  ||\\ |
     |/ ||  || \\|
        ^^  ^^</pre>
<div class="sec-t">services</div>
<div class="r"><span class="i" id="ig">&#x25CF;</span><span class="l">Gateway</span><span class="v" id="vg">...</span></div>
<div class="r"><span class="i" id="iw">&#x25CF;</span><span class="l">WiFi</span><span class="v" id="vw">...</span></div>
<div class="r"><span class="i" id="it">&#x25CF;</span><span class="l">Telegram</span><span class="v" id="vt">...</span></div>
<div class="r"><span class="i" id="ik">&#x25CF;</span><span class="l">Kimi K2.5</span><span class="v" id="vk">...</span></div>
<div class="sp"></div>
<div class="sec-t">ram</div>
<div class="r"><span class="i"></span><span class="l">Used</span><span class="v" id="vr">...</span></div>
<div class="bw"><div class="bar"><div class="bf lo" id="bf" style="width:0%"></div></div></div>
<div class="bw"><div class="bl" id="bl"></div></div>
<div class="r"><span class="i"></span><span class="l">Swap</span><span class="v" id="vs">...</span></div>
<div class="sp"></div>
<div class="sec-t">top processes</div>
<div id="procs"></div>
<div class="sp"></div>
<div class="lg">
<div class="e" id="lu">uptime: ...</div>
<div class="e" id="le">errors: ...</div>
</div>
<div class="ft">V8 128MB &#x2022; PROOT &#x2022; NODE 22 &#x2022; KIMI K2.5</div>
</div>
</div>
</div>
<script>
var t=0,F=[document.getElementById("f0").textContent,document.getElementById("f1").textContent];
var bootDone=false;
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
document.getElementById("bl").textContent=p+"%";
document.getElementById("vs").textContent=d.swap.used+"/"+d.swap.total+" MB";
var procs=d.procs||[],html="",mx=procs.length>0?procs[0].m:1;
for(var i=0;i<procs.length;i++){var pr=procs[i],pct=Math.round(pr.m/mx*100);
html+='<div class="pr"><span class="pn">'+pr.n.substring(0,15)+'</span><span class="pm">'+pr.m+' MB</span><div class="pb"><div class="pf" style="width:'+pct+'%"></div></div></div>';}
document.getElementById("procs").innerHTML=html;
document.getElementById("lu").textContent="uptime: "+d.uptime;
if(d.lastError){document.getElementById("le").textContent="err: "+d.lastError;document.getElementById("le").className="e er"}
else{document.getElementById("le").textContent="errors: none";document.getElementById("le").className="e"}
}).catch(function(){si("ig","fl");document.getElementById("vg").textContent="OFFLINE";document.getElementById("vg").className="v e"});
document.getElementById("lb").textContent=F[t%2];t++}
setTimeout(function(){document.getElementById("boot").classList.add("out")},3000);
go();setInterval(go,3000);
</script></body></html>`;

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
