# Auto-brightness jumps around in dim rooms

**Status:** ✅ Fixed with a small GNOME Shell extension (Smooth Brightness)

## Symptom
With GNOME's *Automatic Screen Brightness* on, the screen keeps stepping 15–25 % up and down in a dim
room. I counted ~30 changes in 90 s.

## Cause
At ~14–27 lux the Surface Go 3's ambient light sensor reports in **3.43-lux steps**. At that level,
one step is a big relative change, and GNOME follows each one. GNOME 51 has no smoothing setting.

## Fix
Install the **Smooth Brightness** GNOME Shell extension in
[`fixes/brightness/`](../fixes/brightness/). It takes over from GNOME's ambient brightness and uses
GNOME 51's own auto-brightness hook, so the brightness slider, brightness keys and idle-dim all
keep working normally.

```sh
cd fixes/brightness && ./install.sh     # then log out and back in
./install.sh --remove                   # uninstall, GNOME auto-brightness back on
```

What it does:
- reads lux from `iio-sensor-proxy` every 500 ms and takes a **2 s median** of log-lux, so a hand,
  shadow or flicker never starts a change
- does **one 5 s fade** to the new level, and if the light changes again mid-fade it **turns
  around** from where it is (no snap, no staircase)
- ignores changes smaller than 6 points
- uses the **full range**: 1 % in darkness up to 100 % at 2000 lux and above (0 % would switch this
  panel's backlight off)
- the **brightness slider is your preference**: 50 % is neutral, higher bends the curve brighter,
  lower dimmer. The ends stay at 1 % and 100 %. GNOME saves the slider across reboots.

| Light | Slider 25 % | Slider 50 % | Slider 75 % |
|---|---|---|---|
| ~7 lux (dim room) | 8 % | 28 % | 53 % |
| ~150 lux (indoor) | 44 % | 66 % | 81 % |
| 2000+ lux | 100 % | 100 % | 100 % |

Debug log: `mkdir -p ~/.config/smooth-brightness && touch ~/.config/smooth-brightness/debug`, log out
and back in, then `journalctl --user -f -o cat /usr/bin/gnome-shell | grep smooth-brightness`.

Limits: GNOME Shell 51 only (it relies on 51's `BrightnessManager`). In total darkness the slider has
no effect (the curve pins 0 lux to 1 %).

History: first version was a Python user service writing through logind. It worked, but GNOME's
slider showed stale values and idle-dim needed special handling, so it became an extension.

Tip: the ALS's iio index changes between boots. To find it: `grep -l als /sys/bus/iio/devices/iio:device*/name`
