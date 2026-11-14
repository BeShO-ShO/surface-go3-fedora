# Type Cover touchpad dead after boot / keys dead right after attaching

**Status:** ⚠️ Open, workaround: detach and re-attach the cover

## Symptom A: touchpad dead after boot
In about 4 of 15 boots the touchpad gives no pointer. The keyboard works. Detaching and re-attaching fixes it.
- The touchpad always enumerates (~1.9 s), with no USB errors.
- Raw evdev on the touchpad node is silent even with nothing grabbing it, so this is device/kernel, not GNOME.
- On every boot `hid-generic` binds first and `hid-multitouch` re-binds ~0.2 s later. Suspected cause: the
  Input Mode switch gets missed, or the state left over from a warm reboot out of Windows.

## Symptom B: keys dead right after attaching
Sometimes the touchpad works after attaching but the keys don't. 15–22 s later the cover
drops off USB by itself and re-enumerates, and after that it works:
```
usb 1-7: USB disconnect, device number N
usb_submit_urb(ctrl) failed: -19
```
On clean attaches there's no bounce. Probably the pogo-pin contacts. Cleaning them, or simply
detaching and re-attaching instead of waiting, helps.

## Possible fixes (not applied)
1. Add `hid-multitouch` to the initramfs so it binds before `hid-generic`:
   `/etc/dracut.conf.d/hid.conf` → `add_drivers+=" hid-multitouch "`, then `sudo dracut -f`
2. A boot-time service that resets the cover's USB device
3. The linux-surface kernel

How to diagnose: run `sudo libinput debug-events` while it's dead. No output means device/kernel; events mean the compositor.

Related: [Type Cover sleep stall](typecover-sleep-eio.md)
