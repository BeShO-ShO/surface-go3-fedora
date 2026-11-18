#!/bin/bash
# Builds and installs the HID-BPF fix for the Surface Go 3 Type Cover touchpad
# (045e:09b5): stops hid-multitouch from sending the mode-switch feature reports
# that stall the cover (dead touchpad, dead Caps Lock LED, 10 s suspend).
# It also turns off this repo's older workarounds if you installed them.
# Undo: bash uninstall.sh
set -e
cd "$(dirname "$0")"
B=0090-Surface-Go-3-TypeCover-Touchpad
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT

sudo dnf install -y udev-hid-bpf clang bpftool libbpf-devel

bpftool btf dump file /sys/kernel/btf/vmlinux format c > "$W/vmlinux.h"
clang -O2 -g -target bpf -I"$W" -Wno-missing-declarations -c $B.bpf.c -o "$W/$B.bpf.o"
sudo udev-hid-bpf install "$W/$B.bpf.o"

# Older workarounds from fixes/superseded/ re-trigger the stall: turn them off
for u in surface-typecover-reprobe.service surface-typecover-resume.service; do
    systemctl is-enabled -q $u 2>/dev/null && sudo systemctl disable $u
done
H=/usr/lib/systemd/system-sleep/50-surface-typecover-touchpad
[ -e $H ] && sudo mv -v $H /usr/local/libexec/50-surface-typecover-touchpad.disabled
sudo systemctl daemon-reload

# Attach to the cover now
for d in /sys/bus/hid/devices/0003:045E:09B5.*; do sudo udevadm trigger --action=add "$d"; done
sudo udevadm settle
sleep 1
sudo ls /sys/fs/bpf/hid/ | grep -q 045E_09B5 && echo "Fix is attached to the Type Cover." \
    || echo "Not attached yet: is the cover connected? It attaches automatically when it is."
echo "Shut down and power on (not restart) to test from a clean state."
