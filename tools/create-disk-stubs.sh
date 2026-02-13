#!/data/data/com.termux/files/usr/bin/bash
# Create on-disk stubs for unused packages (bypasses jiti loader)
# Run inside Termux (not proot)
PREFIX=/data/data/com.termux/files/usr
NM="$PREFIX/lib/node_modules/openclaw/node_modules"

STUB='module.exports=new Proxy(function(){},{get:(t,p)=>p==="__esModule"?true:p==="default"?module.exports:module.exports,apply:()=>module.exports,construct:()=>module.exports});'

PACKAGES=(
  "@anthropic-ai/sdk"
  "@homebridge/ciao"
  "@mariozechner/pi-tui"
  "qrcode-terminal"
  "@slack/web-api"
  "@slack/bolt"
  "@line/bot-sdk"
  "@whiskeysockets/baileys"
  "@buape/carbon"
  "discord-api-types"
  "node-edge-tts"
  "@clack/prompts"
  "@clack/core"
  "@google/genai"
  "@aws-sdk/client-bedrock-runtime"
  "@aws-sdk/client-bedrock"
)

for pkg in "${PACKAGES[@]}"; do
  dir="$NM/$pkg"
  if [ -d "$dir" ]; then
    # Find entry point from package.json
    entry=""
    if [ -f "$dir/package.json" ]; then
      # Try main, then exports, fallback to index.js
      entry=$(grep -o '"main"[[:space:]]*:[[:space:]]*"[^"]*"' "$dir/package.json" | head -1 | sed 's/.*"main"[[:space:]]*:[[:space:]]*"\(.*\)"/\1/')
    fi
    [ -z "$entry" ] && entry="index.js"
    target="$dir/$entry"
    if [ -f "$target" ]; then
      echo "STUB: $pkg ($entry)"
      echo "$STUB" > "$target"
    else
      echo "SKIP: $pkg (no $entry)"
    fi
  else
    echo "MISS: $pkg (not installed)"
  fi
done
echo "Done. Restart gateway to apply."
