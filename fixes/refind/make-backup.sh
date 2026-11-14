#!/bin/bash
# Run:  sudo bash ~/refind-backup-kit/make-backup.sh > ~/refind-backup.txt 2>&1
set -u
U=${SUDO_USER:?run with sudo}; H=$(getent passwd "$U" | cut -d: -f6)
OUT=$H/refind-backup
STAMP=$(date +%Y%m%d-%H%M)
rm -rf "$OUT"; mkdir -p "$OUT"

echo "== ESP rEFInd folder (binaries, shim, both themes, configs, old .bak files)"
cp -a /boot/efi/EFI/refind "$OUT/EFI-refind"

echo "== ready-to-use configs"
cp /boot/efi/EFI/refind/refind.conf          "$OUT/refind.conf.dark"
if [ -f /boot/efi/EFI/refind/refind.conf.pre-dark ]; then
  cp /boot/efi/EFI/refind/refind.conf.pre-dark "$OUT/refind.conf.light"
else
  echo "WARNING: refind.conf.pre-dark missing - no light config"
fi

echo "== Secure Boot keys used by refind-install (/etc/refind.d)"
[ -d /etc/refind.d ] && cp -a /etc/refind.d "$OUT/etc-refind.d"

echo "== home-side sources"
mkdir -p "$OUT/sources"
for f in minimal-taichi-dark taichi-copy install-refind-dark.sh fix-refind-banner.sh refind-dark-preview.png; do
  [ -e "$H/$f" ] && cp -a "$H/$f" "$OUT/sources/"
done

echo "== info"
efibootmgr -v      > "$OUT/efibootmgr.txt" 2>&1
mokutil --list-enrolled > "$OUT/mok-enrolled.txt" 2>&1
lsblk -f           > "$OUT/lsblk.txt" 2>&1
cp "$(dirname "$0")/restore.sh" "$(dirname "$0")/README.txt" "$OUT/"

chown -R $U:$U "$OUT"
tar -C "$H" -czf "$H/refind-backup-$STAMP.tar.gz" refind-backup
chown $U:$U "$H/refind-backup-$STAMP.tar.gz"
echo; find "$OUT" -maxdepth 2 | sort
echo; ls -lh "$H/refind-backup-$STAMP.tar.gz"
echo DONE
