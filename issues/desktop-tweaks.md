# Desktop tweaks & notes

## On-screen keyboard: Tabula OSK
GNOME's built-in OSK only appears in touch mode and was too limited, so I wrote my own:
**[Tabula OSK](https://github.com/BeShO-ShO/tabula-osk)**. It has a tablet layout, word suggestions,
swipe typing, auto-show on touch, and supports GNOME 50/51. Version 1.5 (November 2026) added an emoji panel
(☺ key left of the space bar), a paste button for recently copied text, a per-app "stay closed" list, and
key repeat for held letters while swipe typing is on.

Things learned while building it:
- Surface hardware buttons (volume `Intel HID 5 button array`, `Power Button`, `Video Bus`) show
  up as **keyboard devices**. Ignore them when deciding "a hardware keyboard is in use".
- GTK and Chromium request the OSK on tap through `Main.inputMethod` `input-panel-state`.
- IBus Typing Booster's slow first start makes GNOME's `IBusManager` time out (4 s), fall back to
  `xkb:us::eng`, and keep a stale engine name. Track `global-engine-changed` instead.
- Typing Booster candidate labels are wrapped in U+202A…U+202C bidi marks; strip `\p{Cf}`.
- On Wayland, new extension JS only loads after logging out and back in. `gnome-extensions disable/enable` doesn't reload modules.
- The shell shares **one** input-method focus between all apps, so moving from one app's text field to
  another's never looks like "focus gained". Track what holds the focus (shell entry or focused window)
  instead. Some apps (Ptyxis) only request the OSK from the second tap on.
- The overview leaves the app behind it with its text focus, so don't auto-show there unless the search
  entry itself was tapped (fixed in Tabula OSK 1.4.1).
- A Clutter actor's `notify::width` / `notify::height` only fire when the size is *set*, not when the
  layout allocates it. To lay out content for the space a widget ends up with (the emoji grid), listen to
  `notify::allocation` and read `actor.allocation`.
- Never destroy a `Clutter.Text` that still has the input-method focus: the next
  `Main.inputMethod.request_surrounding()` crashes gnome-shell (SIGSEGV in `clutter_text_get_buffer`).
  Move the key focus away first. This was a long-standing "random" crash in my headless test runs.
- Clipboard changes: `global.display.get_selection()` emits `owner-changed`; read the text with
  `St.Clipboard`. Password managers tag what they copy with the `x-kde-passwordManagerHint` MIME type,
  so that can be skipped. Don't show clipboard text on the lock screen (`Main.sessionMode.isLocked`).
- Emoji (multi-code-point sequences) go in through `Main.inputMethod.commit()`; they can't be typed as key presses.
- An app can be recognised for per-app rules with `Shell.WindowTracker.get_default().focus_app.get_id()`.
- Type Cover keys dead right after attaching is a cover USB bounce, not the OSK.
  See [Type Cover issues](typecover-dead-after-boot.md).

## Dock
- **Dash to Dock** (supports 51) is the one in use, with autohide + intellihide, together with
  **[TouchUp](https://github.com/mityax/gnome-extension-touchup)** (gesture navigation bar). A short swipe up
  from the bottom edge shows the hidden dock over a maximized window; a longer one opens the overview.
- **TouchUp 1.7.1 + Dash to Dock v110 bug:** the dock slid in during the swipe but never stayed up, with
  `TypeError: this.dock._show is not a function` in the journal on every swipe. Dash to Dock renamed
  `_show()`/`_hide()` to `showDock()`/`hideDock()`. Reported upstream
  ([mityax/gnome-extension-touchup#39](https://github.com/mityax/gnome-extension-touchup/issues/39)).
  Local fix: [`fixes/touchup/dash-to-dock-v110.patch`](../fixes/touchup/dash-to-dock-v110.patch) (also keeps
  the dock up 4 s instead of 2 and lets Dash to Dock decide when to hide it). A TouchUp update undoes it.
  ```sh
  cd ~/.local/share/gnome-shell/extensions/touchup@mityax
  git apply /path/to/surface-go3-fedora/fixes/touchup/dash-to-dock-v110.patch   # works outside a git repo too
  ```
  Log out and back in afterwards.
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

## Small system tweaks
- Set a static hostname (`hostnamectl set-hostname …`). Without one the machine took the ISP's
  reverse-DNS name, which then shows up in every journal line.
- zram swap with zstd instead of the default lzo-rle: `/etc/systemd/zram-generator.conf` with
  `compression-algorithm = zstd`.
- Disabled `NetworkManager-wait-online` (~6 s of boot, nothing here needs it) and `ModemManager` (no modem).
- Journal capped with `SystemMaxUse=200M` in `/etc/systemd/journald.conf.d/`.
