#!/data/data/com.termux/files/usr/bin/bash
# Create ESM stub packages for deleted npm dependencies
# These satisfy ESM import resolution without installing the real packages
# The code paths that use these imports are never reached (channels disabled)
#
# Why stubs? OpenClaw bundles all channel SDKs via Rolldown (ESM). Even with
# channels disabled, ESM resolves every `import` at link-time before any code
# runs. Deleting packages breaks boot. These stubs export the right names so
# the module graph resolves, but the code is never called.
#
# Usage: bash create-stubs.sh
# Run from Termux (not proot) — the paths go through the rootfs directly.
# Re-run after every `openclaw update` (npm reinstalls will overwrite stubs).

PREFIX=/data/data/com.termux/files/usr
ROOTFS=$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu
OCDIR=$ROOTFS/data/data/com.termux/files/usr/lib/node_modules/openclaw/node_modules

# Helper: create a stub package
stub_pkg() {
  local dir="$OCDIR/$1"
  mkdir -p "$dir"
  echo "$2" > "$dir/package.json"
  echo "$3" > "$dir/index.js"
  echo "Created stub: $1"
}

# Helper: create subpath file
stub_sub() {
  local file="$OCDIR/$1"
  mkdir -p "$(dirname "$file")"
  echo "$2" > "$file"
  echo "Created subpath: $1"
}

# --- @slack/web-api ---
mkdir -p "$OCDIR/@slack"
stub_pkg "@slack/web-api" \
  '{"name":"@slack/web-api","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export class WebClient { constructor() {} }'

# --- @slack/bolt ---
stub_pkg "@slack/bolt" \
  '{"name":"@slack/bolt","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export default class SlackBolt { constructor() {} }'

# --- @buape/carbon ---
# Has subpath export: @buape/carbon/gateway
mkdir -p "$OCDIR/@buape"
stub_pkg "@buape/carbon" \
  '{"name":"@buape/carbon","version":"0.0.0-stub","type":"module","main":"index.js","exports":{".":"./index.js","./gateway":"./gateway.js"}}' \
  'export class Button {}
export const ChannelType = {};
export class Client { constructor() {} }
export class Command {}
export class MessageCreateListener {}
export class MessageReactionAddListener {}
export class MessageReactionRemoveListener {}
export const MessageType = {};
export class PresenceUpdateListener {}
export class RateLimitError extends Error { constructor() { super(); } }
export class RequestClient { constructor() {} }
export class Row {}'

stub_sub "@buape/carbon/gateway.js" \
  'export const GatewayIntents = {};
export class GatewayPlugin {}'

# --- discord-api-types ---
# Has subpath exports: /v10 and /payloads/v10
stub_pkg "discord-api-types" \
  '{"name":"discord-api-types","version":"0.0.0-stub","type":"module","main":"index.js","exports":{".":"./index.js","./v10":"./v10.js","./payloads/v10":"./payloads-v10.js"}}' \
  'export default {};'

stub_sub "discord-api-types/v10.js" \
  'export const ApplicationCommandOptionType = {};
export const ButtonStyle = {};
export const ChannelType = {};
export const PermissionFlagsBits = {};
export const Routes = {};'

stub_sub "discord-api-types/payloads-v10.js" \
  'export const PollLayoutType = {};'

# --- @line/bot-sdk ---
mkdir -p "$OCDIR/@line"
stub_pkg "@line/bot-sdk" \
  '{"name":"@line/bot-sdk","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export const messagingApi = { MessagingApiClient: class {} };'

# --- @whiskeysockets/baileys ---
mkdir -p "$OCDIR/@whiskeysockets"
stub_pkg "@whiskeysockets/baileys" \
  '{"name":"@whiskeysockets/baileys","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export const DisconnectReason = {};
export function downloadMediaMessage() { return Promise.resolve(Buffer.alloc(0)); }
export function extractMessageContent() { return null; }
export function getContentType() { return null; }
export function isJidGroup() { return false; }
export function normalizeMessageContent() { return null; }
export function fetchLatestBaileysVersion() { return Promise.resolve({ version: [0,0,0] }); }
export function makeCacheableSignalKeyStore() { return {}; }
export function makeWASocket() { return {}; }
export function useMultiFileAuthState() { return Promise.resolve({ state: {}, saveCreds: () => {} }); }'

# --- playwright-core ---
stub_pkg "playwright-core" \
  '{"name":"playwright-core","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export const chromium = { launch: () => Promise.reject(new Error("stub")) };
export const devices = {};'

echo
echo "All stubs created. Total:"
du -sm "$OCDIR/@slack" "$OCDIR/@buape" "$OCDIR/discord-api-types" "$OCDIR/@line" "$OCDIR/@whiskeysockets" "$OCDIR/playwright-core" 2>/dev/null
