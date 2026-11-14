# Auto-brightness jumps around in dim rooms

**Status:** ✅ Worked around with a custom user service (on trial)

## Symptom
With GNOME's *Automatic Screen Brightness* on, the screen keeps stepping 15–25 % up and down in a dim
room. I counted ~30 changes in 90 s.

## Cause
At ~14–27 lux the Surface Go 3's ambient light sensor reports in **3.43-lux steps**. At that level,
one step is a big relative change, and GNOME follows each one. GNOME 51 has no smoothing setting.

## Fix
Turn off GNOME's ambient brightness and run [`smooth-brightness`](../fixes/brightness/smooth-brightness)
instead. It's a small Python/Gio daemon:
- reads lux from `iio-sensor-proxy` every 500 ms and takes a 3 s median of log-lux
- waits until the target has held steady (±3 points) for 3 s, then does **one** 4 s smoothstep fade
- ignores changes smaller than 6 points
- sets brightness through logind `Session.SetBrightness`, so it needs no root
- learns manual slider changes as a personal bias
- pauses while the session is idle so GNOME's idle-dim still works

```sh
gsettings set org.gnome.settings-daemon.plugins.power ambient-enabled false
install -m 755 fixes/brightness/smooth-brightness ~/.local/bin/
install -m 644 fixes/brightness/smooth-brightness.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now smooth-brightness
journalctl --user -u smooth-brightness -f      # set SMOOTH_BRIGHTNESS_DEBUG=1 for detail
```

Known limit: GNOME's brightness slider can show a stale value.
To revert: `systemctl --user disable --now smooth-brightness` and set `ambient-enabled` back to `true`.

Tip: the ALS's iio index changes between boots. To find it: `grep -l als /sys/bus/iio/devices/iio:device*/name`
