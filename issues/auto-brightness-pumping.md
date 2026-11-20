# Auto-brightness jumps around (and drifts) on GNOME 51

**Status:** ✅ Fixed with a small GNOME Shell extension (Smooth Brightness 3.0)

## Symptom
With GNOME's *Automatic Screen Brightness* on:
- in a dim room the screen keeps stepping 15–25 % up and down (I counted ~30 changes in 90 s)
- over time it drifts: after a bright moment, a normal room can end up at ~4 %

## Cause
From gnome-settings-daemon 51.1 (`plugins/power/gsd-power-manager.c`), GNOME's auto-brightness is:

```
target % = lux × 100 / (1.5 × reference lux)       (then a 0.1 Hz moving average)
```

- It's **linear in lux**. At ~14–27 lux the Surface Go 3's light sensor reports in **3.43-lux steps**,
  so each step is a 15–25 % brightness jump.
- The **reference is re-taken** at login, on every slider or brightness-key change, and on every
  idle-dim and undim. If that happens in bright light (sun, a lamp, a flashlight), every normal room
  afterwards comes out very dim.
- Each new target is applied instantly, so even its smoothed changes show as steps.

## Fix
Install the **Smooth Brightness** GNOME Shell extension from
[`fixes/brightness/`](../fixes/brightness/), or the zip from the
[latest `smooth-brightness-*` release](https://github.com/BeShO-ShO/surface-go3-fedora/releases).

```sh
cd fixes/brightness && ./install.sh     # then log out and back in
./install.sh --remove                   # uninstall (GNOME's own auto-brightness again)
```
or `gnome-extensions install smooth-brightness@besho-sho.shell-extension.zip`, log out and in, then
`gnome-extensions enable smooth-brightness@besho-sho`.

GNOME's **Automatic Screen Brightness** switch (Settings) turns it on and off. With the switch off,
the slider is plain manual brightness.

What it does:
- **Fixed curve on log-lux**, never re-anchored: ~1 % in darkness, ~28 % at 7 lux (dim room),
  ~66 % at 150 lux (indoor), 100 % at 2000 lux and above
- **2 s median** of the sensor every 500 ms, so a hand, shadow or flicker never starts a change;
  changes under 6 points are ignored
- **One 5 s fade** per change. If the light changes again mid-fade it **turns around** from where it
  is (no snap, no staircase)
- **The brightness slider moves with auto** and always shows the real brightness (no OSD popup)
- **Dragging the slider** (or the brightness keys) sets how far you want to be above or below auto.
  That offset is kept as the light changes and saved across reboots. So you can brighten a dark room
  or dim a bright one and auto keeps working from there
- Idle-dim and brightness keys work as usual

Example: in a dim room auto gives 28 %. Drag the slider to 48 % (+20). Walk into a normal room and it
fades to ~86 % (66 + 20). Back in the dim room it returns to 48 %.

Debug log: `mkdir -p ~/.config/smooth-brightness && touch ~/.config/smooth-brightness/debug`, log out
and back in, then `journalctl --user -f -o cat /usr/bin/gnome-shell | grep smooth-brightness`.
The saved offset is in `~/.config/smooth-brightness/offset` (delete it to reset to pure auto).

Limits: GNOME Shell 51 only. It hooks GNOME 51's `BrightnessManager`, including two internals
(`_inhibitUpdates`, `_sync`) to move the slider without it counting as a user change.

## History
1. Python user service writing through logind: smooth, but GNOME's slider showed stale values.
2. Extension 1.x with its own curve: the slider bent the curve, which felt like it did nothing.
3. Extension 2.0 smoothing GNOME's own target: inherited GNOME's re-anchoring, so it drifted dim.
4. Extension 3.0: own fixed curve + slider that moves with auto and remembers your offset.

Tip: the ALS's iio index changes between boots. To find it: `grep -l als /sys/bus/iio/devices/iio:device*/name`
