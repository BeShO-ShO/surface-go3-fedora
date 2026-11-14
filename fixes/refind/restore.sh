#!/bin/bash
# Restore rEFInd after a reinstall.  From inside the extracted refind-backup folder:
#   sudo bash restore.sh dark     (black background + big icons, current setup)
#   sudo bash restore.sh light    (original minimal-taichi theme)
set -eu
THEME=${1:-}
[[ "$THEME" == dark || "$THEME" == light ]] || { echo "usage: sudo bash restore.sh dark|light"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
ESP=/boot/efi
mountpoint -q $ESP || { echo "$ESP not mounted"; exit 1; }

# 1. files
if [ -d $ESP/EFI/refind ]; then
  mv $ESP/EFI/refind $ESP/EFI/refind.old-$(date +%s)
  echo "existing EFI/refind moved aside"
fi
cp -a "$HERE/EFI-refind" $ESP/EFI/refind
cp "$HERE/refind.conf.$THEME" $ESP/EFI/refind/refind.conf
echo "copied rEFInd + $THEME config"
[ -d "$HERE/etc-refind.d" ] && [ ! -d /etc/refind.d ] && cp -a "$HERE/etc-refind.d" /etc/refind.d

# 2. check the loaders the config points to exist
for l in /EFI/Microsoft/Boot/bootmgfw.efi /EFI/fedora/shimx64.efi; do
  [ -f "$ESP$l" ] && echo "ok: $l" || echo "WARNING: $l not found - fix loader line in refind.conf"
done

# 3. firmware boot entry (first in boot order)
if ! efibootmgr | grep -q "rEFInd Boot Manager"; then
  SRC=$(findmnt -no SOURCE $ESP)                 # e.g. /dev/nvme0n1p1
  DISK=/dev/$(lsblk -no PKNAME "$SRC")
  PART=$(cat /sys/class/block/$(basename "$SRC")/partition)
  efibootmgr -c -d "$DISK" -p "$PART" -L "rEFInd Boot Manager" -l '\EFI\refind\shimx64.efi'
  echo "boot entry created"
else
  NUM=$(efibootmgr | sed -n 's/^Boot\([0-9A-F]*\)\*\? rEFInd Boot Manager.*/\1/p' | head -1)
  REST=$(efibootmgr | sed -n 's/^BootOrder: //p' | tr ',' '\n' | grep -v "^$NUM$" | paste -sd,)
  efibootmgr -o "$NUM${REST:+,$REST}" >/dev/null
  echo "boot entry $NUM moved first"
fi

# 4. Secure Boot: make sure rEFInd's signing cert is trusted by shim
for c in "$HERE"/etc-refind.d/keys/*.cer "$HERE"/EFI-refind/keys/*.cer; do
  [ -f "$c" ] || continue
  if mokutil --test-key "$c" 2>&1 | grep -q "is already enrolled"; then
    echo "MOK ok: $(basename "$c")"
  else
    echo ">>> $(basename "$c") not enrolled - importing (set a one-time password, then"
    echo ">>>     on next boot choose Enroll MOK in the blue MokManager screen)"
    mokutil --import "$c" || true
  fi
done
echo "DONE - reboot"
