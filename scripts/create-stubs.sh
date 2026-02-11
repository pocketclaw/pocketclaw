#!/data/data/com.termux/files/usr/bin/bash
# Create ESM stub packages for deleted npm dependencies
# These satisfy ESM import resolution without installing the real packages
# The code paths that use these imports are never reached (disabled channels,
# unused providers like AWS Bedrock and Google Gemini)
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

# --- @aws-sdk/client-bedrock ---
# Used by pi-ai for Bedrock model discovery (not our provider)
mkdir -p "$OCDIR/@aws-sdk"
stub_pkg "@aws-sdk/client-bedrock" \
  '{"name":"@aws-sdk/client-bedrock","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export class BedrockClient { constructor() {} send() { return Promise.reject(new Error("stub")); } }
export class ListFoundationModelsCommand { constructor() {} }'

# --- @aws-sdk/client-bedrock-runtime ---
# Used by pi-ai for Bedrock streaming (not our provider)
stub_pkg "@aws-sdk/client-bedrock-runtime" \
  '{"name":"@aws-sdk/client-bedrock-runtime","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export class BedrockRuntimeClient { constructor() {} send() { return Promise.reject(new Error("stub")); } }
export const StopReason = {};
export const CachePointType = {};
export const CacheTTL = {};
export const ConversationRole = {};
export class ConverseStreamCommand { constructor() {} }
export const ImageFormat = {};
export const ToolResultStatus = {};'

# --- @google/genai ---
# Used by pi-ai for Google Gemini provider (not our provider)
mkdir -p "$OCDIR/@google"
stub_pkg "@google/genai" \
  '{"name":"@google/genai","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export class GoogleGenAI { constructor() {} }
export const FinishReason = {};
export const FunctionCallingConfigMode = {};
export const ThinkingLevel = {};'

echo
echo "All stubs created. Total:"
du -sm "$OCDIR/@slack" "$OCDIR/@buape" "$OCDIR/discord-api-types" "$OCDIR/@line" "$OCDIR/@whiskeysockets" "$OCDIR/playwright-core" "$OCDIR/@aws-sdk" "$OCDIR/@google" 2>/dev/null
