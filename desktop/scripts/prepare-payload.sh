#!/bin/bash
# PocketClaw Setup — Payload Preparation Script
# Downloads ADB, APKs, rootfs, Node.js, and copies repo files into payload/
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
PAYLOAD="$ROOT/payload"
REPO="${POCKETCLAW_REPO:-$ROOT/../pocketclaw}"

echo "=== PocketClaw Payload Preparation ==="
echo "Payload dir: $PAYLOAD"
echo "Repo dir:    $REPO"
echo ""

# --- ADB Platform Tools ---
echo "[1/6] Downloading ADB platform-tools..."

mkdir -p "$PAYLOAD/adb"/{win32,darwin,linux}

if [ ! -f "$PAYLOAD/adb/win32/adb.exe" ]; then
  echo "  Downloading Windows ADB..."
  curl -L -o /tmp/platform-tools-win.zip \
    "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
  unzip -oq /tmp/platform-tools-win.zip -d /tmp/pt-win
  cp /tmp/pt-win/platform-tools/adb.exe "$PAYLOAD/adb/win32/"
  cp /tmp/pt-win/platform-tools/AdbWinApi.dll "$PAYLOAD/adb/win32/"
  cp /tmp/pt-win/platform-tools/AdbWinUsbApi.dll "$PAYLOAD/adb/win32/"
  rm -rf /tmp/platform-tools-win.zip /tmp/pt-win
  echo "  Windows ADB done"
else
  echo "  Windows ADB already present"
fi

if [ ! -f "$PAYLOAD/adb/darwin/adb" ]; then
  echo "  Downloading macOS ADB..."
  curl -L -o /tmp/platform-tools-mac.zip \
    "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"
  unzip -oq /tmp/platform-tools-mac.zip -d /tmp/pt-mac
  cp /tmp/pt-mac/platform-tools/adb "$PAYLOAD/adb/darwin/"
  chmod +x "$PAYLOAD/adb/darwin/adb"
  rm -rf /tmp/platform-tools-mac.zip /tmp/pt-mac
  echo "  macOS ADB done"
else
  echo "  macOS ADB already present"
fi

if [ ! -f "$PAYLOAD/adb/linux/adb" ]; then
  echo "  Downloading Linux ADB..."
  curl -L -o /tmp/platform-tools-linux.zip \
    "https://dl.google.com/android/repository/platform-tools-latest-linux.zip"
  unzip -oq /tmp/platform-tools-linux.zip -d /tmp/pt-linux
  cp /tmp/pt-linux/platform-tools/adb "$PAYLOAD/adb/linux/"
  chmod +x "$PAYLOAD/adb/linux/adb"
  rm -rf /tmp/platform-tools-linux.zip /tmp/pt-linux
  echo "  Linux ADB done"
else
  echo "  Linux ADB already present"
fi

# --- APKs ---
echo ""
echo "[2/6] Downloading APKs..."
mkdir -p "$PAYLOAD/apks"

if [ ! -f "$PAYLOAD/apks/termux-android5-6.apk" ]; then
  echo "  Downloading Termux (Android 5-6 build)..."
  curl -L -o "$PAYLOAD/apks/termux-android5-6.apk" \
    "https://github.com/termux/termux-app/releases/download/v0.119.0-beta.3/termux-app_v0.119.0-beta.3+apt-android-5-github-debug_armeabi-v7a.apk"
  echo "  Termux APK done"
else
  echo "  Termux APK already present"
fi

if [ ! -f "$PAYLOAD/apks/termux-boot.apk" ]; then
  echo "  Downloading Termux:Boot..."
  curl -L -o "$PAYLOAD/apks/termux-boot.apk" \
    "https://github.com/termux/termux-boot/releases/download/v0.8.1/termux-boot-app_v0.8.1+github-debug.apk"
  echo "  Termux:Boot APK done"
else
  echo "  Termux:Boot APK already present"
fi

if [ ! -f "$PAYLOAD/apks/pocketclaw-launcher.apk" ]; then
  if [ -f "$REPO/apk/build/aligned.apk" ]; then
    echo "  Copying PocketClaw Launcher from repo..."
    cp "$REPO/apk/build/aligned.apk" "$PAYLOAD/apks/pocketclaw-launcher.apk"
    echo "  PocketClaw Launcher APK done"
  else
    echo "  WARNING: PocketClaw Launcher APK not found at $REPO/apk/build/aligned.apk"
  fi
else
  echo "  PocketClaw Launcher APK already present"
fi

# --- Ubuntu Rootfs ---
echo ""
echo "[3/6] Downloading Ubuntu ARM rootfs..."
mkdir -p "$PAYLOAD/rootfs"

if [ ! -f "$PAYLOAD/rootfs/ubuntu-proot-arm.tar.xz" ]; then
  echo "  Downloading Ubuntu base ARM (~54 MB)..."
  curl -L -o "$PAYLOAD/rootfs/ubuntu-proot-arm.tar.xz" \
    "https://cdimage.ubuntu.com/ubuntu-base/releases/24.04/release/ubuntu-base-24.04-base-armhf.tar.gz"
  echo "  Ubuntu rootfs done"
else
  echo "  Ubuntu rootfs already present"
fi

# --- Node.js ARM ---
echo ""
echo "[4/6] Downloading Node.js 22 ARM..."
mkdir -p "$PAYLOAD/node"

if [ ! -f "$PAYLOAD/node/node-v22.12.0-linux-armv7l.tar.xz" ]; then
  echo "  Downloading Node.js 22.12.0 ARM (~50 MB)..."
  curl -L -o "$PAYLOAD/node/node-v22.12.0-linux-armv7l.tar.xz" \
    "https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-armv7l.tar.xz"
  echo "  Node.js done"
else
  echo "  Node.js already present"
fi

# --- Copy from pocketclaw repo ---
echo ""
echo "[5/6] Copying files from pocketclaw repo..."

if [ ! -d "$REPO" ]; then
  echo "  ERROR: pocketclaw repo not found at $REPO"
  echo "  Set POCKETCLAW_REPO env var or place repo at $ROOT/../pocketclaw"
  exit 1
fi

# Scripts
mkdir -p "$PAYLOAD/scripts"
echo "  Copying scripts..."
for f in "$REPO"/scripts/*; do
  [ -f "$f" ] && cp "$f" "$PAYLOAD/scripts/"
done
echo "  $(ls "$PAYLOAD/scripts/" | wc -l) scripts copied"

# Config
mkdir -p "$PAYLOAD/config"
echo "  Copying config..."
cp "$REPO/config/env.example" "$PAYLOAD/config/"
cp "$REPO/config/openclaw.example.json" "$PAYLOAD/config/"
echo "  Config files copied"

# Tools
mkdir -p "$PAYLOAD/tools"
echo "  Copying install-local.sh..."
cp "$REPO/install-local.sh" "$PAYLOAD/tools/install-local.sh"

# proot-distro source
if [ -d "$REPO/tools/proot-distro-master" ]; then
  echo "  Packaging proot-distro..."
  (cd "$REPO/tools" && tar czf "$PAYLOAD/tools/proot-distro-master.tar.gz" proot-distro-master/)
  echo "  proot-distro packaged"
elif [ -f "$REPO/tools/proot-distro-master.tar.gz" ]; then
  cp "$REPO/tools/proot-distro-master.tar.gz" "$PAYLOAD/tools/"
fi

# fix-stubs.sh
if [ -f "$REPO/scripts/create-stubs.sh" ]; then
  cp "$REPO/scripts/create-stubs.sh" "$PAYLOAD/tools/fix-stubs.sh"
fi

echo "  Tools copied"

# --- Summary ---
echo ""
echo "[6/6] Payload summary:"
echo ""
du -sh "$PAYLOAD"/adb/   2>/dev/null || true
du -sh "$PAYLOAD"/apks/  2>/dev/null || true
du -sh "$PAYLOAD"/rootfs/ 2>/dev/null || true
du -sh "$PAYLOAD"/node/  2>/dev/null || true
du -sh "$PAYLOAD"/scripts/ 2>/dev/null || true
du -sh "$PAYLOAD"/config/ 2>/dev/null || true
du -sh "$PAYLOAD"/tools/ 2>/dev/null || true
echo ""
du -sh "$PAYLOAD"
echo ""
echo "=== Payload preparation complete ==="
echo "Run 'npm start' to launch the app in dev mode."
echo "Run 'npm run build:win' to build the Windows installer."
