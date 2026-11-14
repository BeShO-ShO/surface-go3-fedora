# rEFInd on a Secure Boot Surface Go 3: dark theme, Windows black screen, shim warning, backup

Setup: rEFInd 0.14.2 chain-loaded through **shim** (Secure Boot on), signed with a locally
generated key enrolled as a MOK. The screen is 1920×1280. Windows was installed first, then Fedora, sharing one ESP.

Active `refind.conf` (comments stripped):
```
timeout 5
use_graphics_for windows,linux
default_selection "Windows"
enable_touch
enable_mouse
big_icon_size 540
scanfor manual
menuentry "Windows" {
    ostype Windows
    icon /EFI/refind/themes/minimal-taichi-dark/icons/os_win.png
    loader /EFI/Microsoft/Boot/bootmgfw.efi
}
menuentry "Fedora" {
    graphics on
    icon /EFI/refind/themes/minimal-taichi-dark/icons/os_fedora.png
    loader /EFI/fedora/shimx64.efi
}
include themes/minimal-taichi-dark/theme.conf
hideui singleuser,safemode,hwtest,arrows,editor,badges,hints
```

## 1. Booting Windows shows a blue "rEFInd – Booting OS" bar or rEFInd's background
**Status:** ✅ Mostly fixed (now black screen + spinner, accepted)

**Cause:** Windows `bootmgr` trusts the ACPI **BGRT** table, which says the firmware logo is
still on screen. So it draws only the spinner and never repaints the logo. By then rEFInd has
drawn over the screen. In text mode you get rEFInd's blue bar. In graphics mode, rEFInd's
background stays under the spinner. Fedora isn't affected because Plymouth redraws the BGRT logo itself.

Setting `firmware_bootnum` avoids it, but costs an extra firmware reboot (10–15 s).

**Fix:** a dark theme (`minimal-taichi-dark`, based on *minimal-taichi*). Its background is black,
with the firmware logo at exactly the firmware's position:
- The firmware logo can be read without root from `/sys/firmware/acpi/bgrt/image` (BMP). The offset
  is in `/sys/firmware/acpi/bgrt/xoffset` and `yoffset` (here 200×200 at +860+540).
- Build a 1920×1280 black `background.png` with the logo composited at that offset, and set
  `banner_scale fillscreen`.
- OS icons sit on 540×540 transparent canvases with the glyph near the bottom. rEFInd always
  vertically centres the icon row, so this places the glyphs just below the logo. Icons are inverted to white.
- **Gotcha:** `hideui banner` (in `theme.conf` *or* `refind.conf`) silently drops the background
  and gives the default grey. Remove `banner` from `hideui` (see [`fix-banner.sh`](../fixes/refind/fix-banner.sh)).

Result: the menu matches the firmware splash. The Windows handoff is a fully black screen with
only the spinner, because rEFInd clears to the background colour before launching. Plain GRUB gives the same result.

Files: [`theme.conf`](../fixes/refind/theme/theme.conf), [`install-refind-dark.sh`](../fixes/refind/install-refind-dark.sh).
The theme images aren't included: the icons come from the third-party minimal-taichi theme, and
the background contains the device's firmware logo. Generate your own from BGRT as described above.

## 2. Shim flashes "Invalid call dxe_update_mem_attrs … addr is not page aligned"
**Status:** ✅ Fixed (harmless anyway)

The message comes from **shim 16.1**, not from the firmware or rEFInd. In rEFInd 0.14.2's binary
(`grubx64.efi` when installed for shim), the `.sbat` section sits at VMA `0x989680` (decimal
10000000, from `objcopy --adjust-vma`), which isn't 4K-aligned. Shim tries to set memory
attributes on it and complains.

Fix: move `.sbat` to the next free page-aligned address (`0x58000` here; `0x57000` overlapped `.dynsym`),
re-sign with your MOK key, and check with `sbverify`. Keep the original as `grubx64.efi.pre-sbatfix`
([`undo-sbatfix.sh`](../fixes/refind/undo-sbatfix.sh)). If rEFInd won't load afterwards, use the firmware boot menu → Fedora, then undo.

## 3. Backup & restore after a reinstall
[`make-backup.sh`](../fixes/refind/make-backup.sh) copies `/boot/efi/EFI/refind`, both configs,
`/etc/refind.d` keys, `efibootmgr`/`mokutil`/`lsblk` snapshots, and the theme sources into a tarball.
[`restore.sh dark|light`](../fixes/refind/restore.sh) puts it back, checks that the Windows and Fedora
loaders exist, creates the "rEFInd Boot Manager" firmware entry (or moves it first in BootOrder), and runs
`mokutil --import` if the cert isn't enrolled yet.

> ⚠️ The backup contains your **private signing key** (`refind_local.key`). Keep the tarball private.

The MOK lives in firmware NVRAM, so reinstalling Fedora normally doesn't need a re-enroll.

## 4. Upgrades
- The `rEFInd` RPM has no scriptlets. Package updates never touch the ESP copy, so customisations survive.
- The Fedora entry points at `/EFI/fedora/shimx64.efi`, which Fedora's shim updates keep current.
- With `default_selection "Windows"`, remember to pick Fedora by hand during `dnf system-upgrade` reboots.
- rEFInd's editor is hidden, so kernel parameters are added at GRUB (Fedora's shim → GRUB):
  `sudo grub2-set-bootflag menu_show_once`, then press `e` at the GRUB menu.
