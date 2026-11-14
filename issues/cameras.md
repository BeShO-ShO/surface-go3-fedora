# Cameras

**Status:** ℹ️ Work on the stock Fedora kernel (no linux-surface kernel or DKMS needed)

The Surface Go 3 has three sensors behind an Intel IPU3: front `ov5693`, rear `ov8865` (with
`dw9719` autofocus motor) and the IR `ov7251`. On Fedora 45 / kernel 7.3 all of the drivers are in
the stock kernel and bind at boot:

```
ipu3-cio2 0000:00:14.3: Connected 3 cameras
```

libcamera 0.7 lists the front and rear cameras (`cam -l`) and the front camera streams at ~29 fps
(`cam -c 2 --capture=5`). Apps reach them through PipeWire (`pipewire-plugin-libcamera`), e.g. GNOME
Snapshot.

Known limits (not driver bugs):
- There is no per-sensor tuning file, so libcamera falls back to `uncalibrated.yaml`; colours and
  exposure are plainer than on Windows.
- The IR camera binds but nothing uses it (no Windows Hello-style face login).
- Apps that only speak V4L2 see the raw IPU3 nodes, not a usable webcam; they need PipeWire camera
  support.
