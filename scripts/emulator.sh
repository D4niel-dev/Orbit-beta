#!/usr/bin/env bash
# Launch the Pixel_8a AVD in the order that actually works on this machine.
#
# Android Studio's "Emulator failed to connect within 5 minutes" is not a timeout
# on booting — the AVD boots in about 40 seconds here. It is a timeout on the
# device REGISTERING with adb, and that fails because the adb daemon is not
# running when the emulator starts:
#
#   ERROR | Unable to connect to adb daemon on port: 5037
#
# The emulator boots, the guest is up, and `adb devices` stays empty — so Studio
# waits for a device that will never appear. Start the daemon FIRST and the
# device shows up within 10 seconds.
#
# Usage:
#   scripts/emulator.sh            boot and wait until it is ready
#   scripts/emulator.sh --cold     discard the snapshot and cold boot
#   scripts/emulator.sh --window   show the window (default is headless)

set -u

SDK="${LOCALAPPDATA:-$HOME/AppData/Local}/Android/Sdk"
ADB="$SDK/platform-tools/adb.exe"
EMU="$SDK/emulator/emulator.exe"
AVD="${AVD:-Pixel_8a}"

COLD=0
ARGS=(-no-audio -no-boot-anim)
for a in "$@"; do
  case "$a" in
    --cold)   COLD=1 ;;
    --window) ;;
    *)        ARGS+=("$a") ;;
  esac
done
# Headless unless --window was passed.
case " $* " in *" --window "*) ;; *) ARGS+=(-no-window) ;; esac

[ -x "$ADB" ] || { echo "adb not found at $ADB"; exit 1; }
[ -x "$EMU" ] || { echo "emulator not found at $EMU"; exit 1; }

echo "== 1. adb daemon first =="
"$ADB" start-server
"$ADB" devices

# A stale multi-instance lock makes the emulator refuse to start, and Studio
# reports it as the same 5-minute timeout.
LOCK="$HOME/.android/avd/$AVD.avd/multiinstance.lock"
if [ -e "$LOCK" ]; then
  rm -f "$LOCK"
  echo "   removed a stale multiinstance.lock"
fi

if [ "$COLD" = "1" ]; then
  echo "== 2. cold boot (discarding the snapshot) =="
  ARGS+=(-no-snapshot-load -no-snapshot-save)
else
  echo "== 2. normal boot =="
fi

# The snapshot is ~2.7 GB and is written on exit. If the emulator is killed
# rather than shut down it is left .dirty, the next launch discards it, and every
# start becomes a cold boot. `--cold` here, or `adb emu kill` to stop it, both
# avoid that.
echo "== 3. launching $AVD =="
"$EMU" -avd "$AVD" "${ARGS[@]}" > /tmp/orbit-emulator.log 2>&1 &
EMU_PID=$!

echo "== 4. waiting for the device to register =="
for i in $(seq 1 30); do
  sleep 5
  SERIAL="$("$ADB" devices | awk '/^emulator-/{print $1; exit}')"
  BOOT="$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
  echo "   t=$((i*5))s  device=${SERIAL:-none}  boot=${BOOT:-no}"
  if [ "$BOOT" = "1" ]; then
    echo ""
    echo "ready: $SERIAL"
    echo "  adb shell            an interactive shell"
    echo "  adb emu kill         shut down cleanly (keeps the snapshot valid)"
    echo "  log: /tmp/orbit-emulator.log"
    exit 0
  fi
done

echo ""
echo "still not ready after 150s. The emulator log says:"
grep -iE "error|failed|unable" /tmp/orbit-emulator.log | tail -10
exit 1
