#!/bin/bash
# Remove "banner" from hideui so rEFInd draws the black background.png
set -e
R=/boot/efi/EFI/refind
cp "$R/refind.conf" "$R/refind.conf.pre-banner"
sed -i -E 's/^(\s*hideui\s+)banner,/\1/' "$R/refind.conf" "$R/themes/minimal-taichi-dark/theme.conf"
echo "== refind.conf"; grep -nE '^\s*hideui' "$R/refind.conf"
echo "== theme.conf";  grep -nE '^\s*hideui' "$R/themes/minimal-taichi-dark/theme.conf"
ls -la "$R/themes/minimal-taichi-dark/background.png"
