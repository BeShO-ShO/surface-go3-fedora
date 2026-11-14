#!/bin/bash
# Installs the minimal-taichi-dark rEFInd theme and enables use_graphics_for.
# Run with: sudo bash install-refind-dark.sh  (THEME_SRC=/path/to/minimal-taichi-dark)
set -e
R=/boot/efi/EFI/refind
C=$R/refind.conf
cp -a "$C" "$C.pre-dark"
rm -rf "$R/themes/minimal-taichi-dark"
cp -r "${THEME_SRC:-$HOME/minimal-taichi-dark}" "$R/themes/minimal-taichi-dark"

# point include + manual icon paths at the new theme
sed -i 's#themes/minimal-taichi/#themes/minimal-taichi-dark/#g' "$C"
# big icons are now 540px canvases (glyph sits at the bottom, below the firmware logo)
sed -i 's/^\s*big_icon_size .*/big_icon_size 540/' "$C"
# re-enable use_graphics_for (uncomment, or add if missing)
if grep -qE '^\s*#\s*use_graphics_for' "$C"; then
  sed -i -E 's/^\s*#\s*(use_graphics_for).*/\1 windows,linux/' "$C"
elif ! grep -qE '^\s*use_graphics_for' "$C"; then
  sed -i '/^\s*big_icon_size/a use_graphics_for windows,linux' "$C"
fi

echo "=== diff vs .pre-dark ==="; diff "$C.pre-dark" "$C" || true
echo "=== active config ==="; grep -vE '^\s*(#|$)' "$C"
echo "=== theme files ==="; ls -l "$R/themes/minimal-taichi-dark" "$R/themes/minimal-taichi-dark/icons" | head -20
