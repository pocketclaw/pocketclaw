#!/data/data/com.termux/files/usr/bin/bash
# Fix ESM stubs — create at HOST $PREFIX path (not rootfs path)
# The --bind=$PREFIX:$PREFIX mount shadows rootfs, so stubs must be at HOST path
PREFIX=/data/data/com.termux/files/usr
OCDIR=$PREFIX/lib/node_modules/openclaw/node_modules
LOG=$PREFIX/tmp/fix-stubs.log

ok() { echo "  ✓ $1"; }

echo "=== Fixing ESM stubs ===" | tee "$LOG"
echo "OCDIR: $OCDIR" | tee -a "$LOG"

# Helper: create a stub package (delete real package first)
stub_pkg() {
  local dir="$OCDIR/$1"
  rm -rf "$dir"
  mkdir -p "$dir"
  echo "$2" > "$dir/package.json"
  echo "$3" > "$dir/index.js"
  ok "$1" | tee -a "$LOG"
}

stub_sub() {
  local file="$OCDIR/$1"
  mkdir -p "$(dirname "$file")"
  echo "$2" > "$file"
  ok "subpath: $1" | tee -a "$LOG"
}

# @slack/web-api
stub_pkg "@slack/web-api" \
  '{"name":"@slack/web-api","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export class WebClient { constructor() {} }'

# @slack/bolt
stub_pkg "@slack/bolt" \
  '{"name":"@slack/bolt","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export default class SlackBolt { constructor() {} }'

# Also stub the other @slack packages that were installed
for pkg in logger oauth socket-mode types; do
  dir="$OCDIR/@slack/$pkg"
  rm -rf "$dir"
  mkdir -p "$dir"
  echo "{\"name\":\"@slack/$pkg\",\"version\":\"0.0.0-stub\",\"type\":\"module\",\"main\":\"index.js\"}" > "$dir/package.json"
  echo "export default {};" > "$dir/index.js"
  ok "@slack/$pkg" | tee -a "$LOG"
done

# @buape/carbon
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
export class Row {}
export class StringSelectMenu {}'
stub_sub "@buape/carbon/gateway.js" \
  'export const GatewayIntents = {};
export class GatewayPlugin {}'

# discord-api-types
stub_pkg "discord-api-types" \
  '{"name":"discord-api-types","version":"0.0.0-stub","type":"module","main":"index.js","exports":{".":"./index.js","./v10":"./v10.js","./payloads/v10":"./payloads/v10.js","./rest/v10":"./rest/v10.js"}}' \
  'export default {};'
stub_sub "discord-api-types/v10.js" \
  'export const ApplicationCommandOptionType = {};
export const ButtonStyle = {};
export const ChannelType = {};
export const PermissionFlagsBits = {};
export const Routes = {};'
stub_sub "discord-api-types/payloads-v10.js" \
  'export const PollLayoutType = {};'
stub_sub "discord-api-types/payloads/v10.js" \
  'export const PollLayoutType = {};'
stub_sub "discord-api-types/rest/v10.js" \
  'export default {};'

# @line/bot-sdk
stub_pkg "@line/bot-sdk" \
  '{"name":"@line/bot-sdk","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export const messagingApi = { MessagingApiClient: class {} };'

# @whiskeysockets/baileys
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
export function useMultiFileAuthState() { return Promise.resolve({ state: {}, saveCreds: () => {} }); }
export const proto = {};'

# playwright-core
stub_pkg "playwright-core" \
  '{"name":"playwright-core","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export const chromium = { launch: () => Promise.reject(new Error("stub")) };
export const devices = {};'

# @aws-sdk/client-bedrock
stub_pkg "@aws-sdk/client-bedrock" \
  '{"name":"@aws-sdk/client-bedrock","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export class BedrockClient { constructor() {} send() { return Promise.reject(new Error("stub")); } }
export class ListFoundationModelsCommand { constructor() {} }'

# @aws-sdk/client-bedrock-runtime
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

# @google/genai
stub_pkg "@google/genai" \
  '{"name":"@google/genai","version":"0.0.0-stub","type":"module","main":"index.js"}' \
  'export class GoogleGenAI { constructor() {} }
export const FinishReason = {};
export const FunctionCallingConfigMode = {};
export const ThinkingLevel = {};'

# Also delete libsignal-node (the git dep that caused all the trouble)
if [ -d "$OCDIR/libsignal-node" ]; then
  rm -rf "$OCDIR/libsignal-node"
  mkdir -p "$OCDIR/libsignal-node"
  echo '{"name":"libsignal-node","version":"0.0.0-stub","type":"module","main":"index.js"}' > "$OCDIR/libsignal-node/package.json"
  echo 'export default {};' > "$OCDIR/libsignal-node/index.js"
  ok "libsignal-node (stubbed)" | tee -a "$LOG"
fi

echo "" | tee -a "$LOG"
echo "Disk saved:" | tee -a "$LOG"
du -sm "$OCDIR" 2>/dev/null | tee -a "$LOG"
echo "=== Done ===" | tee -a "$LOG"
rm -f ~/.bash_profile
