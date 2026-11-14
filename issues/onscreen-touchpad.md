# On-Screen Touchpad extension on GNOME 51 + Surface

[abiharbani/on-screen-touchpad](https://github.com/abiharbani/on-screen-touchpad) puts a virtual
touchpad on the touchscreen. Upstream (at the time) supported shell 50 only.

## Local patches
1. `metadata.json`: add `"51"` to `shell-version`.
2. `extension.js`: `St.BoxLayout { vertical: true }` → `orientation: Clutter.Orientation.VERTICAL`.
3. **Helper grabbed the wrong device:** `find_touchscreen()` took the first evdev node with
   `ABS_MT_POSITION_X`, which on the Surface is the **Type Cover touchpad**. It then
   `EVIOCGRAB`bed it, so the real touchpad *and* the on-screen pad were both dead.
   The fix only accepts direct-touch devices (`INPUT_PROP_DIRECT`):
   [`helper-touchscreen-only.patch`](../fixes/onscreen-touchpad/helper-touchscreen-only.patch)
   ```sh
   cd ~/.local/share/gnome-shell/extensions/onscreen-touchpad@aharbani.github.io
   patch -p1 < /path/to/surface-go3-fedora/fixes/onscreen-touchpad/helper-touchscreen-only.patch
   ```

## Permissions (from its install.sh)
The helper needs `/dev/uinput` without root:
[`10-uinput.rules`](../fixes/onscreen-touchpad/10-uinput.rules) → `/etc/udev/rules.d/`,
[`uinput.conf`](../fixes/onscreen-touchpad/uinput.conf) → `/etc/modules-load.d/`, and
`sudo usermod -aG input $USER` (then log out and back in).

Logs: `journalctl -o cat /usr/bin/gnome-shell | grep OnScreenTouchpad`
