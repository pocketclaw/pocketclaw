// Bypass for os.networkInterfaces() crash under proot/Android
// Load with: NODE_OPTIONS='-r /path/to/hijack.js'
const os = require("os"); os.networkInterfaces = () => ({});
