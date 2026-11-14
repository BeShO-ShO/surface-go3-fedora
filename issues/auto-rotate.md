# Auto-rotate doesn't work with the Type Cover attached / freezes after resume

## 1. Rotation snaps back to landscape with the cover attached
**Status:** ℹ️ By design

Mutter only manages panel orientation in *touch mode*, which follows the tablet-mode switch reported
by the `Intel HID switches` device. With the Type Cover attached and open, the device is in laptop mode,
so GNOME resets the rotation to normal. Detach the cover (or fold it back) and rotation works,
including upside-down. The sensor (`iio-sensor-proxy`, `accel_3d`) is fine.

## 2. Rotation stuck after resume
**Status:** ✅ Fixed (restart on resume)

After an s2idle resume in tablet mode, the raw `accel_3d` values followed the device but
`iio-sensor-proxy` stayed frozen on one orientation (`ClaimAccelerometer` calls hung for ~25 s).

```sh
sudo systemctl restart iio-sensor-proxy
```
Permanent fix: [`iio-sensor-proxy-resume.service`](../fixes/rotate/iio-sensor-proxy-resume.service), a oneshot unit
hooked to `suspend.target` that restarts the service after every resume.
