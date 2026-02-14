#!/bin/bash
# PocketClaw — stub unused packages at the file level
# Replaces entry files of unused packages with tiny proxy stubs
# This works regardless of module loader (CJS, ESM, jiti)
# Run inside proot with correct PATH
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/root

NM=/data/data/com.termux/files/usr/lib/node_modules/openclaw/node_modules

# The universal stub — works as both CJS and ESM
STUB='const h={get:(t,p)=>{if(p==="__esModule")return true;if(p==="default")return x;if(p==="then")return void 0;if(typeof p==="symbol")return p===Symbol.toPrimitive?()=>"":p===Symbol.iterator?function*(){}:x;return x},apply:()=>x,construct:()=>x};const x=new Proxy(function(){},h);module.exports=x;module.exports.default=x;module.exports.__esModule=true;'

# ESM stub for .mjs files
STUB_ESM='const h={get:(t,p)=>{if(p==="then")return void 0;if(typeof p==="symbol")return void 0;return x},apply:()=>x,construct:()=>x};const x=new Proxy(function(){},h);export default x;export {x as __esModule};'

echo "=== POCKETCLAW PACKAGE STUBBER ==="
echo ""

TOTAL_SAVED=0
TOTAL_STUBBED=0

stub_file() {
  local file="$1"
  local label="$2"
  if [ ! -f "$file" ]; then
    return
  fi
  local size=$(wc -c < "$file")
  if [ "$size" -lt 500 ]; then
    # Already stubbed or too small to matter
    return
  fi
  # Backup
  if [ ! -f "${file}.orig" ]; then
    cp "$file" "${file}.orig"
  fi
  # Write stub
  if echo "$file" | grep -q '\.mjs$'; then
    echo "$STUB_ESM" > "$file"
  else
    echo "$STUB" > "$file"
  fi
  local new_size=$(wc -c < "$file")
  local saved=$((size - new_size))
  TOTAL_SAVED=$((TOTAL_SAVED + saved))
  TOTAL_STUBBED=$((TOTAL_STUBBED + 1))
  echo "  $label: $(basename $file) ${size}B -> ${new_size}B (saved ${saved}B)"
}

stub_package() {
  local pkg="$1"
  local dir="$NM/$pkg"
  if [ ! -d "$dir" ]; then
    echo "  SKIP: $pkg (not installed)"
    return
  fi
  echo "[$pkg]"
  # Find entry points from package.json
  local main=$(node -e "try{const p=require('$dir/package.json');console.log(p.main||'')}catch(e){}" 2>/dev/null)
  local exports_default=$(node -e "try{const p=require('$dir/package.json');const e=p.exports;if(typeof e==='string')console.log(e);else if(e&&e['.']){const d=e['.'];if(typeof d==='string')console.log(d);else if(d.require)console.log(typeof d.require==='string'?d.require:d.require.default||'');else if(d.default)console.log(d.default)}}catch(e){}" 2>/dev/null)

  # Stub main entry
  if [ -n "$main" ] && [ -f "$dir/$main" ]; then
    stub_file "$dir/$main" "$pkg"
  fi
  # Stub exports default
  if [ -n "$exports_default" ] && [ "$exports_default" != "$main" ] && [ -f "$dir/$exports_default" ]; then
    stub_file "$dir/$exports_default" "$pkg/exports"
  fi
  # Stub common entry points
  for entry in index.js index.mjs dist/index.js dist/index.mjs lib/index.js lib/index.mjs; do
    if [ -f "$dir/$entry" ]; then
      stub_file "$dir/$entry" "$pkg/$entry"
    fi
  done
}

# === Unused AI providers ===
stub_package "@anthropic-ai/sdk"
stub_package "@google/genai"
stub_package "@aws-sdk/client-bedrock-runtime"
stub_package "@aws-sdk/client-bedrock"

# === Unused channels ===
stub_package "@slack/web-api"
stub_package "@slack/bolt"
stub_package "@line/bot-sdk"
stub_package "@whiskeysockets/baileys"
stub_package "@buape/carbon"
stub_package "discord-api-types"

# === Unused features ===
stub_package "@homebridge/ciao"
stub_package "@mariozechner/pi-tui"
stub_package "qrcode-terminal"
stub_package "source-map"
stub_package "source-map-support"
stub_package "node-edge-tts"
stub_package "@clack/prompts"
stub_package "@clack/core"
stub_package "cli-highlight"
stub_package "osc-progress"
stub_package "highlight.js"

echo ""
echo "=== DONE ==="
echo "Files stubbed: $TOTAL_STUBBED"
echo "Bytes saved on disk: $TOTAL_SAVED"
echo ""
echo "Restart gateway to see RAM impact."
