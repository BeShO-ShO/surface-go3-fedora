# Type Cover touchpad dead after boot / keys dead right after attaching

**Status:** ✅ Symptom A (touchpad dead after boot / login): USB reset at login (testing) ·
⚠️ Symptom B (keys dead after attach): re-attach

## Symptom A: touchpad dead after boot or after logging out and back in
In about 4 of 15 boots, and on 2 of 5 logout → login cycles, the touchpad gives no pointer. The keyboard
works. Detaching and re-attaching fixes it.
- The touchpad always enumerates (~1.9 s), with no USB errors.
- Raw evdev on the touchpad node is silent even with nothing grabbing it, so this is device/kernel, not GNOME.
- After a logout/login the kernel logs nothing at all for the cover: no disconnect, no reset (USB autosuspend
  is off).

### Cause (most likely)
`hid-multitouch` sends mode-switch feature reports to the touchpad every time its input device is opened or
closed (`mt_on_hid_hw_open` / `mt_on_hid_hw_close` → `mt_set_modes`: "report all" / "report nothing" plus
latency mode). The Type Cover firmware doesn't reliably complete these, the same thing that makes it
[stall suspend for 10 s](typecover-sleep-eio.md). A logout/login closes and reopens the touchpad several
times in a row (your session → GDM login screen → your session), and sometimes it ends up in "report
nothing". Boot goes through the same login-screen → session handover.

### Fix: USB-reset the cover at every login
When it's stuck, the touchpad sends **nothing**, not even on its raw `hidraw` node, while the keyboard keeps
working. Unbinding and re-binding the driver doesn't wake it (tested); a USB port reset does, like a replug.

[`fixes/login/`](../fixes/login/): a oneshot system service, started with your user manager
(`user@1000.service`, which restarts on every login, including the first one after boot). It waits until the
GDM login screen session is gone, then runs `usbreset 045e:09b5` (from `usbutils`). The keyboard drops out
for ~2 s a few seconds after login.
```sh
sudo install -D -m 755 fixes/login/surface-typecover-reprobe /usr/local/libexec/surface-typecover-reprobe
sudo install -m 644 fixes/login/surface-typecover-reprobe.service /etc/systemd/system/
sudo restorecon /usr/local/libexec/surface-typecover-reprobe /etc/systemd/system/surface-typecover-reprobe.service
sudo systemctl daemon-reload
sudo systemctl enable --now surface-typecover-reprobe.service
```
If your user ID isn't 1000 (`id -u`), change `WantedBy=user@1000.service` first.
`journalctl -b -u surface-typecover-reprobe` shows `USB-reset Type Cover 001/NNN`.

History: the first version only re-bound the driver. It looked fine over 4 logins, but the touchpad was
dead on the next boot and a re-bind didn't bring it back; a `usbreset` did. Still being tested over more
boots and logins.

## Symptom B: keys dead right after attaching
Sometimes the touchpad works after attaching but the keys don't. 15–22 s later the cover
drops off USB by itself and re-enumerates, and after that it works:
```
usb 1-7: USB disconnect, device number N
usb_submit_urb(ctrl) failed: -19
```
On clean attaches there's no bounce. Probably the pogo-pin contacts. Cleaning them, or simply
detaching and re-attaching instead of waiting, helps.

## Other options (not applied)
1. Add `hid-multitouch` to the initramfs so it binds before `hid-generic`:
   `/etc/dracut.conf.d/hid.conf` → `add_drivers+=" hid-multitouch "`, then `sudo dracut -f`
2. The linux-surface kernel

How to diagnose: run `sudo libinput debug-events` while it's dead. No output means device/kernel; events mean the compositor.

Related: [Type Cover sleep stall](typecover-sleep-eio.md)
