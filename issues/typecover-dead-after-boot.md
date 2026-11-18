# Type Cover touchpad dead after boot / keys dead right after attaching

**Status:** ✅ Symptom A (touchpad and Caps Lock light dead after boot / login): HID-BPF fix ·
⚠️ Symptom B (keys dead after attach): re-attach

## Symptom A: touchpad dead after boot or after logging out and back in
In about 4 of 15 boots, and on 2 of 5 logout → login cycles, the touchpad gives no pointer. The keyboard
works, but often the Caps Lock light doesn't come on either. Detaching and re-attaching fixes it.
- The touchpad always enumerates (~1.9 s), with no USB errors.
- Raw evdev on the touchpad node is silent even with nothing grabbing it, so this is device/kernel, not GNOME.
- After a logout/login the kernel logs nothing at all for the cover: no disconnect, no reset (USB autosuspend
  is off).

### Cause
`hid-multitouch` sends mode-switch feature reports (SET_REPORT Feature, report IDs 7 latency mode, 8 input
mode, 16 surface/button switch) to the touchpad every time its input device is opened or closed
(`mt_on_hid_hw_open` / `mt_on_hid_hw_close` → `mt_set_modes`) and at suspend. A logout/login, and the
boot-time login-screen → session handover, close and reopen the touchpad several times in a row.

The Type Cover firmware sometimes never answers one of these requests. That leaves the cover's control
endpoint (ep0, shared by all its interfaces) stuck: the touchpad sends **nothing**, not even on its raw
`hidraw` node, and keyboard LED updates (Caps Lock) queue behind it and time out every ~5 s with `-104`,
while typing still works. This was confirmed on the wire with `usbmon` by NNBR1 in
[linux-surface #2382](https://github.com/linux-surface/linux-surface/issues/2382). The same requests are what
[stall suspend for 10 s](typecover-sleep-eio.md).

### Fix: HID-BPF descriptor fixup
[`fixes/hid-bpf/`](../fixes/hid-bpf/), written by NNBR1 (from the issue above). A small HID-BPF program,
loaded by `udev-hid-bpf` whenever the cover appears, blanks the four mode-setting usages in the touchpad's
614-byte report descriptor (bytes 530, 578, 597, 599). `hid-multitouch` then never sends those requests again.
The very first probe at boot still sets the touchpad to multitouch mode before the program is attached, so
the touchpad keeps working normally (taps, two-finger scroll, palm rejection). It works with Secure Boot,
since nothing is added to the kernel itself.
```sh
bash fixes/hid-bpf/install.sh      # installs udev-hid-bpf + build tools, builds, installs, attaches
bash fixes/hid-bpf/uninstall.sh    # undo
```
Check it's attached: `sudo ls /sys/fs/bpf/hid/` lists `0003_045E_09B5_…`.

Result here (2026-11-19, kernel 7.3.3): touchpad and Caps Lock light work after a cold boot, and suspend no
longer stalls (see the sleep page).

Known limit: if you detach and re-attach the cover while logged in, the driver probes it before the
program attaches, so it can still get stuck once. Detach and re-attach again.

### Earlier workarounds (superseded)
In [`fixes/superseded/`](../fixes/superseded/): a login service that re-bound the driver, then USB-reset the
cover (`usbreset`), then re-enumerated it (sysfs `authorized` 0 → 1). Each worked for a while and then failed
on some boot. In hindsight that's expected: every reset makes the driver probe the touchpad again and send the
same requests that get stuck. They also cost 1–16 s of dead keyboard per login or wake. `fixes/hid-bpf/install.sh`
turns them off if they're installed.

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
A proper kernel fix would be a per-device quirk in `hid-multitouch` that skips the mode switching for
`045e:09b5`, like the one for `045e:0c46`. The linux-surface kernel is another route.

How to diagnose: run `sudo libinput debug-events` while it's dead. No output means device/kernel; events mean the compositor.

Related: [Type Cover sleep stall](typecover-sleep-eio.md)
