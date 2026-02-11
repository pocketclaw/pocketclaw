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
