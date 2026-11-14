# Desktop tweaks & notes

## On-screen keyboard: Tabula OSK
GNOME's built-in OSK only appears in touch mode and was too limited, so I wrote my own:
**[Tabula OSK](https://github.com/BeShO-ShO/tabula-osk)**. It has a tablet layout, word suggestions,
swipe typing, auto-show on touch, and supports GNOME 50/51.

Things learned while building it:
- Surface hardware buttons (volume `Intel HID 5 button array`, `Power Button`, `Video Bus`) show
  up as **keyboard devices**. Ignore them when deciding "a hardware keyboard is in use".
- GTK and Chromium request the OSK on tap through `Main.inputMethod` `input-panel-state`.
- IBus Typing Booster's slow first start makes GNOME's `IBusManager` time out (4 s), fall back to
  `xkb:us::eng`, and keep a stale engine name. Track `global-engine-changed` instead.
- Typing Booster candidate labels are wrapped in U+202A…U+202C bidi marks; strip `\p{Cf}`.
- On Wayland, new extension JS only loads after logging out and back in. `gnome-extensions disable/enable` doesn't reload modules.
- Type Cover keys dead right after attaching is a cover USB bounce, not the OSK.
  See [Type Cover issues](typecover-dead-after-boot.md).

## Dock
- **Dash to Dock** (supports 51) is the one in use.
- Tried **Dash2Dock Animated** (dash2dock-lite). It needed `"51"` added to its metadata, plus a local patch:
  the *Show Apps* icon reacted to mouse but not touch, so I added a `touch-event` handler
  (`TOUCH_END` → same toggle) next to `button-press-event` in `dock.js`. Dropped it because the dock
  hid behind maximized windows (probably `autohide-dodge`). Don't run both docks at once.

## Power
- power-profiles-daemon: **Balanced** draws ~4.1 W, versus ~5.5–7 W on Performance.
- Firefox: turn off AV1 (`media.av1.enabled=false`). This iGPU has no AV1 hardware decode, while VA-API
  H.264/HEVC/VP9 works.
- Skipped `powertop --auto-tune`: USB autosuspend makes the Type Cover flaky.
- Only s2idle is available. Hibernate is blocked by Secure Boot lockdown, and the system has zram-only swap.
- Battery: 28.4 Wh design, 94 % health. Linux battery life was better than a fresh Windows install's estimate.
