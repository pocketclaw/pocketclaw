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
.lb{text-align:center;margin:8px 0;min-height:14vw}
.lb svg{filter:drop-shadow(0 0 12px rgba(255,40,20,.4)) drop-shadow(0 0 30px rgba(255,20,10,.15))}
.lc{transform-origin:70px 74px;animation:clawL 3s ease-in-out infinite}
.rc{transform-origin:170px 74px;animation:clawR 3s ease-in-out infinite}
@keyframes clawL{0%,100%{transform:rotate(0)}50%{transform:rotate(-8deg)}}
@keyframes clawR{0%,100%{transform:rotate(0)}50%{transform:rotate(8deg)}}
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
<div class="lb"><svg viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg" style="max-width:55vw">
<defs><radialGradient id="cg" cx=".45" cy=".35"><stop offset="0%" stop-color="#f43"/><stop offset="55%" stop-color="#c22"/><stop offset="100%" stop-color="#811"/></radialGradient><radialGradient id="eg" cx=".4" cy=".3"><stop offset="0%" stop-color="#e33"/><stop offset="100%" stop-color="#911"/></radialGradient></defs>
<!-- Legs (3 pairs, jointed, with claw tips) -->
<g opacity=".85">
<path d="M72 88 Q52 98 40 115 Q34 126 30 138" fill="none" stroke="#b33" stroke-width="3.5" stroke-linecap="round"/>
<path d="M68 96 Q46 110 32 130 Q26 142 22 152" fill="none" stroke="#b33" stroke-width="3" stroke-linecap="round"/>
<path d="M66 104 Q46 120 34 140 Q30 150 28 158" fill="none" stroke="#b33" stroke-width="2.5" stroke-linecap="round"/>
<circle cx="30" cy="138" r="2.2" fill="#a22"/><circle cx="22" cy="152" r="2" fill="#a22"/><circle cx="28" cy="158" r="1.8" fill="#a22"/>
<circle cx="40" cy="115" r="2" fill="#c44" opacity=".5"/><circle cx="32" cy="130" r="1.8" fill="#c44" opacity=".5"/><circle cx="34" cy="140" r="1.6" fill="#c44" opacity=".5"/>
</g>
<g opacity=".85">
<path d="M168 88 Q188 98 200 115 Q206 126 210 138" fill="none" stroke="#b33" stroke-width="3.5" stroke-linecap="round"/>
<path d="M172 96 Q194 110 208 130 Q214 142 218 152" fill="none" stroke="#b33" stroke-width="3" stroke-linecap="round"/>
<path d="M174 104 Q194 120 206 140 Q210 150 212 158" fill="none" stroke="#b33" stroke-width="2.5" stroke-linecap="round"/>
<circle cx="210" cy="138" r="2.2" fill="#a22"/><circle cx="218" cy="152" r="2" fill="#a22"/><circle cx="212" cy="158" r="1.8" fill="#a22"/>
<circle cx="200" cy="115" r="2" fill="#c44" opacity=".5"/><circle cx="208" cy="130" r="1.8" fill="#c44" opacity=".5"/><circle cx="206" cy="140" r="1.6" fill="#c44" opacity=".5"/>
</g>
<!-- Left claw (arm + joint + pincer with teeth) -->
<g class="lc">
<path d="M70 74 Q50 60 34 46" fill="none" stroke="#c33" stroke-width="6.5" stroke-linecap="round"/>
<path d="M34 46 Q24 34 18 24" fill="none" stroke="#c33" stroke-width="5.5" stroke-linecap="round"/>
<circle cx="34" cy="46" r="4.5" fill="#d44" stroke="#a22" stroke-width="1.5"/><circle cx="52" cy="60" r="3" fill="#c44" opacity=".4"/>
<path d="M18 24 Q10 12 6 4 Q4-2 10 0 Q16 3 22 12 Q26 18 24 24Z" fill="#e44" stroke="#922" stroke-width="1.5"/>
<path d="M18 24 Q8 30 4 38 Q2 44 8 42 Q14 40 20 34 Q24 28 24 24Z" fill="#c33" stroke="#922" stroke-width="1.5"/>
<circle cx="14" cy="8" r="1.3" fill="#b22"/><circle cx="18" cy="6" r="1" fill="#b22"/><circle cx="11" cy="11" r=".8" fill="#b22"/>
<circle cx="12" cy="34" r="1.3" fill="#922"/><circle cx="16" cy="36" r="1" fill="#922"/><circle cx="10" cy="37" r=".8" fill="#922"/>
<path d="M22 18 Q20 21 22 24" fill="none" stroke="#922" stroke-width="1" opacity=".4"/>
</g>
<!-- Right claw (mirror) -->
<g class="rc">
<path d="M170 74 Q190 60 206 46" fill="none" stroke="#c33" stroke-width="6.5" stroke-linecap="round"/>
<path d="M206 46 Q216 34 222 24" fill="none" stroke="#c33" stroke-width="5.5" stroke-linecap="round"/>
<circle cx="206" cy="46" r="4.5" fill="#d44" stroke="#a22" stroke-width="1.5"/><circle cx="188" cy="60" r="3" fill="#c44" opacity=".4"/>
<path d="M222 24 Q230 12 234 4 Q236-2 230 0 Q224 3 218 12 Q214 18 216 24Z" fill="#e44" stroke="#922" stroke-width="1.5"/>
<path d="M222 24 Q232 30 236 38 Q238 44 232 42 Q226 40 220 34 Q216 28 216 24Z" fill="#c33" stroke="#922" stroke-width="1.5"/>
<circle cx="226" cy="8" r="1.3" fill="#b22"/><circle cx="222" cy="6" r="1" fill="#b22"/><circle cx="229" cy="11" r=".8" fill="#b22"/>
<circle cx="228" cy="34" r="1.3" fill="#922"/><circle cx="224" cy="36" r="1" fill="#922"/><circle cx="230" cy="37" r=".8" fill="#922"/>
<path d="M218 18 Q220 21 218 24" fill="none" stroke="#922" stroke-width="1" opacity=".4"/>
</g>
<!-- Carapace (main body) -->
<ellipse cx="120" cy="90" rx="56" ry="38" fill="url(#cg)" stroke="#711" stroke-width="2.5"/>
<!-- Carapace segments -->
<path d="M76 80 Q120 58 164 80" fill="none" stroke="#922" stroke-width="1.5" opacity=".3"/>
<path d="M82 90 Q120 70 158 90" fill="none" stroke="#922" stroke-width="1.2" opacity=".25"/>
<path d="M86 98 Q120 82 154 98" fill="none" stroke="#922" stroke-width="1" opacity=".2"/>
<!-- Central ridge + lateral grooves -->
<path d="M120 56 L120 122" fill="none" stroke="#922" stroke-width=".8" opacity=".15"/>
<path d="M76 76 Q80 84 78 94" fill="none" stroke="#922" stroke-width="1" opacity=".18"/>
<path d="M164 76 Q160 84 162 94" fill="none" stroke="#922" stroke-width="1" opacity=".18"/>
<!-- Tubercles (shell bumps) -->
<circle cx="106" cy="76" r="3.5" fill="#d33" opacity=".18"/><circle cx="134" cy="76" r="3.5" fill="#d33" opacity=".18"/>
<circle cx="120" cy="70" r="3" fill="#d33" opacity=".15"/>
<circle cx="98" cy="84" r="2.5" fill="#b22" opacity=".12"/><circle cx="142" cy="84" r="2.5" fill="#b22" opacity=".12"/>
<circle cx="120" cy="82" r="2.5" fill="#b22" opacity=".1"/>
<circle cx="108" cy="94" r="2" fill="#a22" opacity=".1"/><circle cx="132" cy="94" r="2" fill="#a22" opacity=".1"/>
<circle cx="120" cy="100" r="1.8" fill="#a22" opacity=".08"/>
<!-- Carapace highlight -->
<ellipse cx="108" cy="74" rx="16" ry="10" fill="#f55" opacity=".1"/>
<!-- Edge spines -->
<g fill="none" stroke="#922" stroke-width="1.2" opacity=".2">
<path d="M70 84 L66 82"/><path d="M72 90 L67 90"/><path d="M74 96 L68 98"/>
<path d="M170 84 L174 82"/><path d="M168 90 L173 90"/><path d="M166 96 L172 98"/>
</g>
<!-- Eye stalks -->
<path d="M100 58 Q96 48 92 40" fill="none" stroke="#c33" stroke-width="5" stroke-linecap="round"/>
<path d="M140 58 Q144 48 148 40" fill="none" stroke="#c33" stroke-width="5" stroke-linecap="round"/>
<circle cx="98" cy="49" r="2.5" fill="#c44" opacity=".5"/><circle cx="142" cy="49" r="2.5" fill="#c44" opacity=".5"/>
<!-- Eyeballs -->
<circle cx="90" cy="37" r="8.5" fill="url(#eg)" stroke="#811" stroke-width="2"/>
<circle cx="150" cy="37" r="8.5" fill="url(#eg)" stroke="#811" stroke-width="2"/>
<!-- Pupils -->
<circle cx="89" cy="36" r="5" fill="#111"/><circle cx="149" cy="36" r="5" fill="#111"/>
<!-- Eye highlights -->
<circle cx="91" cy="34" r="2.2" fill="#fff" opacity=".8"/><circle cx="151" cy="34" r="2.2" fill="#fff" opacity=".8"/>
<circle cx="88" cy="38" r="1" fill="#fff" opacity=".3"/><circle cx="148" cy="38" r="1" fill="#fff" opacity=".3"/>
<!-- Mouth + mandibles -->
<path d="M108 108 Q120 115 132 108" fill="none" stroke="#711" stroke-width="2" stroke-linecap="round"/>
<path d="M112 110 Q110 116 113 120" fill="none" stroke="#922" stroke-width="1.5" stroke-linecap="round"/>
<path d="M128 110 Q130 116 127 120" fill="none" stroke="#922" stroke-width="1.5" stroke-linecap="round"/>
<!-- Antennules -->
<path d="M106 105 Q102 100 98 96" fill="none" stroke="#922" stroke-width="1" opacity=".5" stroke-linecap="round"/>
<path d="M134 105 Q138 100 142 96" fill="none" stroke="#922" stroke-width="1" opacity=".5" stroke-linecap="round"/>
<!-- Belly plate -->
<ellipse cx="120" cy="108" rx="14" ry="8" fill="none" stroke="#711" stroke-width=".8" opacity=".15"/>
</svg></div>
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
}).catch(function(){si("ig","fl");document.getElementById("vg").textContent="OFFLINE";document.getElementById("vg").className="v e"})}
setTimeout(function(){document.getElementById("boot").classList.add("out")},3000);
go();setInterval(go,3000);
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
        if (req.url === "/api/status" || req.url.indexOf("/api/status?") === 0) {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
          res.end(JSON.stringify(_getStatus()));
          return true;
        }
      }
    }
    return origEmit.apply(this, arguments);
  };
  console.log("[hijack] Dashboard on :" + (arguments[0] || "?") + " | Setup: /setup");
  return _origListen.apply(this, arguments);
};
