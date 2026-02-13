#!/bin/bash
# PocketClaw Debloat v2 — restore after factory reset
# Removes 119 packages, leaves 25 active
# NOTE: GMS requires device admin deactivation first:
#   Settings > Security > Device Administrators > disable "Gestionnaire d'appareils Android"
#   Then run this script.

# Round 1+2: Google apps
adb shell pm uninstall -k --user 0 com.google.android.apps.docs
adb shell pm uninstall -k --user 0 com.google.android.apps.docs.editors.docs
adb shell pm uninstall -k --user 0 com.google.android.apps.inputmethod.hindi
adb shell pm uninstall -k --user 0 com.google.android.apps.magazines
adb shell pm uninstall -k --user 0 com.google.android.apps.maps
adb shell pm uninstall -k --user 0 com.google.android.apps.photos
adb shell pm uninstall -k --user 0 com.google.android.apps.plus
adb shell pm uninstall -k --user 0 com.google.android.gm
adb shell pm uninstall -k --user 0 com.google.android.gms
adb shell pm uninstall -k --user 0 com.google.android.googlequicksearchbox
adb shell pm uninstall -k --user 0 com.google.android.gsf
adb shell pm uninstall -k --user 0 com.google.android.gsf.login
adb shell pm uninstall -k --user 0 com.google.android.inputmethod.latin
adb shell pm uninstall -k --user 0 com.google.android.music
adb shell pm uninstall -k --user 0 com.google.android.talk
adb shell pm uninstall -k --user 0 com.google.android.tts
adb shell pm uninstall -k --user 0 com.google.android.videos
adb shell pm uninstall -k --user 0 com.google.android.youtube

# Round 3: Google remaining
adb shell pm uninstall -k --user 0 com.google.android.apps.books
adb shell pm uninstall -k --user 0 com.google.android.apps.cloudprint
adb shell pm uninstall -k --user 0 com.google.android.backuptransport
adb shell pm uninstall -k --user 0 com.google.android.calendar
adb shell pm uninstall -k --user 0 com.google.android.configupdater
adb shell pm uninstall -k --user 0 com.google.android.deskclock
adb shell pm uninstall -k --user 0 com.google.android.feedback
adb shell pm uninstall -k --user 0 com.google.android.gallery3d
adb shell pm uninstall -k --user 0 com.google.android.gm.exchange
adb shell pm uninstall -k --user 0 com.google.android.inputmethod.korean
adb shell pm uninstall -k --user 0 com.google.android.inputmethod.pinyin
adb shell pm uninstall -k --user 0 com.google.android.launcher
adb shell pm uninstall -k --user 0 com.google.android.marvin.talkback
adb shell pm uninstall -k --user 0 com.google.android.onetimeinitializer
adb shell pm uninstall -k --user 0 com.google.android.partnersetup
adb shell pm uninstall -k --user 0 com.google.android.play.games
adb shell pm uninstall -k --user 0 com.google.android.setupwizard
adb shell pm uninstall -k --user 0 com.google.android.syncadapters.contacts

# Round 1+2: Motorola bloat (safe to remove)
adb shell pm uninstall -k --user 0 com.lmi.motorola.rescuesecurity
adb shell pm uninstall -k --user 0 com.motorola.actions
adb shell pm uninstall -k --user 0 com.motorola.android.fmradio
adb shell pm uninstall -k --user 0 com.motorola.android.jvtcmd
adb shell pm uninstall -k --user 0 com.motorola.android.nativedropboxagent
adb shell pm uninstall -k --user 0 com.motorola.android.provisioning
adb shell pm uninstall -k --user 0 com.motorola.android.settings.diag_mdlog
adb shell pm uninstall -k --user 0 com.motorola.android.settings.modemdebug
adb shell pm uninstall -k --user 0 com.motorola.appdirectedsmsproxy
adb shell pm uninstall -k --user 0 com.motorola.audioeffects
adb shell pm uninstall -k --user 0 com.motorola.bach.modemstats
adb shell pm uninstall -k --user 0 com.motorola.bodyguard
adb shell pm uninstall -k --user 0 com.motorola.bug2go
adb shell pm uninstall -k --user 0 com.motorola.camera
adb shell pm uninstall -k --user 0 com.motorola.ccc.checkin
adb shell pm uninstall -k --user 0 com.motorola.ccc.devicemanagement
adb shell pm uninstall -k --user 0 com.motorola.ccc.mainplm
adb shell pm uninstall -k --user 0 com.motorola.ccc.notification
adb shell pm uninstall -k --user 0 com.motorola.ccc.ota
adb shell pm uninstall -k --user 0 com.motorola.contacts.preloadcontacts
adb shell pm uninstall -k --user 0 com.motorola.context
adb shell pm uninstall -k --user 0 com.motorola.coresettingsext
adb shell pm uninstall -k --user 0 com.motorola.demo
adb shell pm uninstall -k --user 0 com.motorola.emaraphoneextns
adb shell pm uninstall -k --user 0 com.motorola.fmplayer
adb shell pm uninstall -k --user 0 com.motorola.genie
adb shell pm uninstall -k --user 0 com.motorola.groundloopnoisepreventer
adb shell pm uninstall -k --user 0 com.motorola.launcherconfig
adb shell pm uninstall -k --user 0 com.motorola.moodles
adb shell pm uninstall -k --user 0 com.motorola.MotGallery2
adb shell pm uninstall -k --user 0 com.motorola.motgeofencesvc
adb shell pm uninstall -k --user 0 com.motorola.moto
adb shell pm uninstall -k --user 0 com.motorola.motocare
adb shell pm uninstall -k --user 0 com.motorola.motocare.internal
adb shell pm uninstall -k --user 0 com.motorola.motocit
adb shell pm uninstall -k --user 0 com.motorola.motodisplay
adb shell pm uninstall -k --user 0 com.motorola.motodisplay.env
adb shell pm uninstall -k --user 0 com.motorola.onetimeinitializer
adb shell pm uninstall -k --user 0 com.motorola.sensorhub.stml0.updater
adb shell pm uninstall -k --user 0 com.motorola.setup
adb shell pm uninstall -k --user 0 com.motorola.slpc
adb shell pm uninstall -k --user 0 com.motorola.storageoptimizer
adb shell pm uninstall -k --user 0 com.motorola.wappushsi

# Round 1+2: Android system
adb shell pm uninstall -k --user 0 com.android.cellbroadcastreceiver
adb shell pm uninstall -k --user 0 com.android.chrome
adb shell pm uninstall -k --user 0 com.android.documentsui
adb shell pm uninstall -k --user 0 com.android.mms
adb shell pm uninstall -k --user 0 com.android.providers.calendar
adb shell pm uninstall -k --user 0 com.android.vending

# Round 3: Android system
adb shell pm uninstall -k --user 0 com.android.backupconfirm
adb shell pm uninstall -k --user 0 com.android.bluetooth
adb shell pm uninstall -k --user 0 com.android.bluetoothmidiservice
adb shell pm uninstall -k --user 0 com.android.bookmarkprovider
adb shell pm uninstall -k --user 0 com.android.calculator2
adb shell pm uninstall -k --user 0 com.android.captiveportallogin
adb shell pm uninstall -k --user 0 com.android.carrierconfig
adb shell pm uninstall -k --user 0 com.android.certinstaller
adb shell pm uninstall -k --user 0 com.android.contacts
adb shell pm uninstall -k --user 0 com.android.dialer
adb shell pm uninstall -k --user 0 com.android.dreams.basic
adb shell pm uninstall -k --user 0 com.android.facelock
adb shell pm uninstall -k --user 0 com.android.htmlviewer
adb shell pm uninstall -k --user 0 com.android.location.fused
adb shell pm uninstall -k --user 0 com.android.managedprovisioning
adb shell pm uninstall -k --user 0 com.android.mms.service
adb shell pm uninstall -k --user 0 com.android.pacprocessor
adb shell pm uninstall -k --user 0 com.android.printspooler
adb shell pm uninstall -k --user 0 com.android.providers.calllogbackup
adb shell pm uninstall -k --user 0 com.android.providers.contacts
adb shell pm uninstall -k --user 0 com.android.providers.partnerbookmarks
adb shell pm uninstall -k --user 0 com.android.providers.userdictionary
adb shell pm uninstall -k --user 0 com.android.proxyhandler
adb shell pm uninstall -k --user 0 com.android.sharedstoragebackup
adb shell pm uninstall -k --user 0 com.android.statementservice
adb shell pm uninstall -k --user 0 com.android.stk
adb shell pm uninstall -k --user 0 com.android.vpndialogs
adb shell pm uninstall -k --user 0 com.android.wallpaper.livepicker
adb shell pm uninstall -k --user 0 com.android.wallpapercropper

# Round 1+2: Qualcomm
adb shell pm uninstall -k --user 0 com.qualcomm.atfwd
adb shell pm uninstall -k --user 0 com.qualcomm.location
adb shell pm uninstall -k --user 0 com.qualcomm.timeservice

echo "Debloat v2 complete. 119 packages removed."
echo "Remaining: 25 packages (android core + termux + pocketclaw)"
