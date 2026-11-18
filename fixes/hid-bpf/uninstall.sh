#!/bin/bash
# Removes the HID-BPF Type Cover fix. Reboot afterwards.
sudo rm -fv /etc/udev-hid-bpf/0090-Surface-Go-3-TypeCover-Touchpad.bpf.o \
    /etc/udev/rules.d/99-hid-bpf-0090-Surface-Go-3-TypeCover-Touchpad.rules
sudo udevadm control --reload
echo "Removed. Reboot to detach it from the cover."
