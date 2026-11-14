#!/bin/sh
# Undo the .sbat alignment patch: put the original rEFInd binary back.
set -e
cp -p /boot/efi/EFI/refind/grubx64.efi.pre-sbatfix /boot/efi/EFI/refind/grubx64.efi && sync && echo "restored original grubx64.efi"
