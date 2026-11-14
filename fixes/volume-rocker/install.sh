#!/bin/bash
# Build and install a DKMS copy of intel-hid that reports real press/release for the
# volume rocker, so holding it repeats. Run: sudo bash install.sh [kernel-tag]
# The driver source is fetched from kernel.org for the running kernel (e.g. v7.3.3) and
# patched; re-run this after a major kernel bump to pick up upstream driver changes.
# Remove: sudo dkms remove intel-hid-volhold/1.0 --all && sudo rm -rf /usr/src/intel-hid-volhold-1.0
set -e
NAME=intel-hid-volhold; V=1.0; SRC=/usr/src/$NAME-$V
TAG=${1:-v$(uname -r | cut -d- -f1)}
BASE=https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/plain/drivers/platform/x86
here=$(dirname "$(readlink -f "$0")")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

command -v dkms >/dev/null || dnf install -y dkms kernel-devel-matched gcc patch
curl -fsSL -o "$tmp/hid.c" "$BASE/intel/hid.c?h=$TAG"
curl -fsSL -o "$tmp/dual_accel_detect.h" "$BASE/dual_accel_detect.h?h=$TAG"
patch -d "$tmp" -p1 < "$here/volhold.patch"
cp "$here/Makefile" "$here/dkms.conf" "$tmp/"

dkms remove $NAME/$V --all 2>/dev/null || true
rm -rf "$SRC"; mkdir -p "$SRC"; cp "$tmp"/{hid.c,dual_accel_detect.h,Makefile,dkms.conf} "$SRC/"
dkms add $NAME/$V && dkms build $NAME/$V && dkms install $NAME/$V
modinfo intel-hid | grep -E '^(filename|signer)'
echo "Reload with: modprobe -r intel-hid && modprobe intel-hid   (or reboot)"
