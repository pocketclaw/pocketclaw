#!/bin/bash
# PocketClaw proot diet — remove unnecessary packages and files
# Run inside proot with correct PATH
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/root

set -e

echo "=== PROOT DIET ==="
echo ""

# Check what OpenClaw actually needs
echo "Checking OpenClaw dependencies..."
if [ -f /root/.openclaw/workspace/package.json ]; then
    echo "  OpenClaw workspace found"
fi

# Packages safe to remove (not needed by Node.js or OpenClaw)
REMOVE_PKGS=""
for pkg in systemd libsystemd-shared iso-codes locales perl-base \
           python3.13 python3.13-minimal libpython3.13-stdlib \
           libpython3.13-minimal python3-cryptography python3-launchpadlib \
           packagekit libgstreamer1.0-0 python3-apt python3-gi \
           gir1.2-glib-2.0 gir1.2-packagekitglib-1.0; do
    if dpkg -l "$pkg" 2>/dev/null | grep -q '^ii'; then
        SIZE=$(dpkg-query -W --showformat='${Installed-Size}' "$pkg" 2>/dev/null)
        echo "  $pkg: ${SIZE} KB — REMOVABLE"
        REMOVE_PKGS="$REMOVE_PKGS $pkg"
    fi
done

if [ -z "$REMOVE_PKGS" ]; then
    echo "No packages to remove."
else
    echo ""
    echo "Removing:$REMOVE_PKGS"
    dpkg --force-depends --force-remove-essential --remove $REMOVE_PKGS 2>/dev/null || true
    echo "Package removal done."
fi

# Clean leftover files
echo ""
echo "Cleaning leftover files..."
rm -rf /usr/share/locale/* 2>/dev/null && echo "  locales cleaned"
rm -rf /usr/share/doc/* 2>/dev/null && echo "  docs cleaned"
rm -rf /usr/share/man/* 2>/dev/null && echo "  man pages cleaned"
rm -rf /usr/share/i18n/* 2>/dev/null && echo "  i18n cleaned"
rm -rf /usr/share/iso-codes/* 2>/dev/null && echo "  iso-codes cleaned"
rm -rf /var/log/* 2>/dev/null && echo "  logs cleaned"
rm -rf /var/lib/apt/lists/* 2>/dev/null && echo "  apt lists cleaned"
rm -rf /tmp/* 2>/dev/null && echo "  tmp cleaned"

# Final size
echo ""
echo "=== DONE ==="
du -sh / 2>/dev/null || true
