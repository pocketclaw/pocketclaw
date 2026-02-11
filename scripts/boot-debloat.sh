#!/system/bin/sh
# boot-debloat — Dirty COW + pm disable all bloat
#
# LIMITATION: Must run from ADB shell (uid 2000), NOT from Termux.
# Dirty COW needs to open /system/bin/run-as which is rwxr-x--- (shell group only).
# Termux (uid 10001, u0_a1) is "others" and has zero access.
#
# Usage after reboot:
#   adb shell /data/local/tmp/boot-debloat.sh
#
# Or from PC:
#   adb shell /data/local/tmp/dirtycow /data/local/tmp/run-as-payload /system/bin/run-as
#   sleep 2
#   adb shell "cat /data/local/tmp/debloat-list.sh | /system/bin/run-as"

DCW=/data/local/tmp/dirtycow
PAYLOAD=/data/local/tmp/run-as-payload
RUNAS=/system/bin/run-as

if [ ! -f "$DCW" ] || [ ! -f "$PAYLOAD" ]; then
  echo "[boot-debloat] ERROR: binaries missing in /data/local/tmp/"
  exit 1
fi

echo "[boot-debloat] Running Dirty COW..."
$DCW $PAYLOAD $RUNAS 2>&1 | tail -2
sleep 2

# Verify root
VERIFY=$(echo 'id' | $RUNAS 2>/dev/null | grep uid=0)
if [ -z "$VERIFY" ]; then
  echo "[boot-debloat] ERROR: no root"
  exit 1
fi
echo "[boot-debloat] Root OK"

echo '
pm disable com.google.android.gms 2>/dev/null
pm disable com.google.android.gsf 2>/dev/null
pm disable com.google.android.gsf.login 2>/dev/null
pm disable com.google.android.apps.plus 2>/dev/null
pm disable com.google.android.apps.magazines 2>/dev/null
pm disable com.google.android.apps.maps 2>/dev/null
pm disable com.google.android.youtube 2>/dev/null
pm disable com.google.android.music 2>/dev/null
pm disable com.google.android.videos 2>/dev/null
pm disable com.google.android.tts 2>/dev/null
pm disable com.google.android.googlequicksearchbox 2>/dev/null
pm disable com.google.android.apps.docs 2>/dev/null
pm disable com.google.android.apps.photos 2>/dev/null
pm disable com.google.android.gm 2>/dev/null
pm disable com.google.android.gm.exchange 2>/dev/null
pm disable com.google.android.calendar 2>/dev/null
pm disable com.google.android.talk 2>/dev/null
pm disable com.google.android.marvin.talkback 2>/dev/null
pm disable com.google.android.feedback 2>/dev/null
pm disable com.google.android.configupdater 2>/dev/null
pm disable com.google.android.syncadapters.contacts 2>/dev/null
pm disable com.google.android.backuptransport 2>/dev/null
pm disable com.google.android.partnersetup 2>/dev/null
pm disable com.google.android.inputmethod.latin 2>/dev/null
pm disable com.google.android.inputmethod.pinyin 2>/dev/null
pm disable com.google.android.apps.inputmethod.hindi 2>/dev/null
pm disable com.google.android.inputmethod.korean 2>/dev/null
pm disable com.google.android.launcher 2>/dev/null
pm disable com.google.android.deskclock 2>/dev/null
pm disable com.android.vending 2>/dev/null
pm disable com.android.bluetooth 2>/dev/null
pm disable com.android.calculator2 2>/dev/null
pm disable com.android.mms 2>/dev/null
pm disable com.android.dialer 2>/dev/null
pm disable com.android.providers.calendar 2>/dev/null
pm disable com.android.providers.contacts 2>/dev/null
pm disable com.android.cellbroadcastreceiver 2>/dev/null
pm disable com.android.printspooler 2>/dev/null
pm disable com.android.dreams.basic 2>/dev/null
pm disable com.android.bookmarkprovider 2>/dev/null
pm disable com.android.htmlviewer 2>/dev/null
pm disable com.android.stk 2>/dev/null
pm disable com.android.wallpapercropper 2>/dev/null
pm disable com.android.vpndialogs 2>/dev/null
pm disable com.motorola.ccc.devicemanagement 2>/dev/null
pm disable com.motorola.ccc.checkin 2>/dev/null
pm disable com.motorola.ccc.mainplm 2>/dev/null
pm disable com.motorola.ccc.ota 2>/dev/null
pm disable com.motorola.ccc.notification 2>/dev/null
pm disable com.motorola.context 2>/dev/null
pm disable com.motorola.contacts.preloadcontacts 2>/dev/null
pm disable com.motorola.groundloopnoisepreventer 2>/dev/null
pm disable com.motorola.slpc 2>/dev/null
pm disable com.motorola.camera 2>/dev/null
pm disable com.motorola.motocare 2>/dev/null
pm disable com.motorola.motocare.internal 2>/dev/null
pm disable com.motorola.bug2go 2>/dev/null
pm disable com.motorola.fmplayer 2>/dev/null
pm disable com.motorola.android.fmradio 2>/dev/null
pm disable com.motorola.motodisplay 2>/dev/null
pm disable com.motorola.motodisplay.env 2>/dev/null
pm disable com.motorola.moodles 2>/dev/null
pm disable com.motorola.motocit 2>/dev/null
pm disable com.motorola.MotGallery2 2>/dev/null
pm disable com.motorola.motosignature.app 2>/dev/null
pm disable com.motorola.genie 2>/dev/null
pm disable com.motorola.setup 2>/dev/null
pm disable com.motorola.onetimeinitializer 2>/dev/null
pm disable com.motorola.demo 2>/dev/null
pm disable com.motorola.storageoptimizer 2>/dev/null
pm disable com.motorola.audioeffects 2>/dev/null
pm disable com.motorola.actions 2>/dev/null
pm disable com.motorola.wappushsi 2>/dev/null
pm disable com.lmi.motorola.rescuesecurity 2>/dev/null
pm disable com.android.chrome 2>/dev/null
pm disable com.android.defcontainer 2>/dev/null
pm disable com.qualcomm.qcrilmsgtunnel 2>/dev/null
pm disable fr.neamar.kiss 2>/dev/null
# --- Tier 1.5: Aggressive debloat (headless server mode) ---
# These save ~150 MB but remove phone UI. Recoverable via:
#   adb shell pm enable com.android.systemui  (if bootloop)
pm disable com.android.systemui 2>/dev/null
# NOTE: com.android.phone left ENABLED — system_server force-starts it anyway
# and the crash dialog is annoying. 12 MB cost accepted.
pm disable com.android.providers.telephony 2>/dev/null
pm disable com.android.providers.media 2>/dev/null
pm disable com.android.keychain 2>/dev/null
sysctl -w vm.swappiness=10 2>/dev/null
echo BOOT_DEBLOAT_DONE
' | $RUNAS 2>/dev/null | grep -E "DONE|new state"

echo "[boot-debloat] Complete — $(pm list packages -d 2>/dev/null | wc -l) packages disabled"
