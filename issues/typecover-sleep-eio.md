# Type Cover touchpad stalls suspend for 10 s (`usbhid … suspend error -5`)

**Status:** ✅ Fixed (workaround: sleep hook)

## Symptom
- Suspend takes ~10 s. Sometimes the laptop wakes on its own or won't wake.
- After resume, the Type Cover touchpad (and sometimes the whole cover) is dead, or the cover drops off USB and comes back.
- Sleep drain was 1.1–3 %/h with the cover attached.

```
usbhid 1-7:1.3: suspend error -5
PM: suspend devices took 10.3 seconds
```

## Cause
At suspend, `hid-multitouch` (`mt_suspend` → `mt_set_modes`) queues async SET_REPORT feature
reports to the touchpad interface (USB interface 1.3 of `045e:09b5`). The cover firmware never
completes them, so `usbhid_wait_io` times out after 10 s and returns `-EIO`. The kernel has
behaved this way since 5.11 (commits `c7aa374e0000` and `498d0ddc6ae9`), and no HID quirk turns it off.
I saw it on every kernel from 7.2.13 to 7.3.3. Same report upstream:
[linux-surface #1223](https://github.com/linux-surface/linux-surface/issues/1223).

s2idle itself is fine. An `rtcwake` test with the cover detached got full SLP_S0 residency.

## Fix
A systemd sleep hook unbinds only the touchpad interface from `usbhid` before sleep
and binds it again after resume. The keyboard interfaces stay bound, so a key press can still wake the device.

```sh
sudo install -m 755 fixes/sleep/50-surface-typecover-touchpad /usr/lib/systemd/system-sleep/
sudo restorecon -v /usr/lib/systemd/system-sleep/50-surface-typecover-touchpad   # SELinux label bin_t
```

To undo, delete the file.

## Result
| | before | after |
|---|---|---|
| "suspend devices took" | ~10.3 s | 0.13–0.3 s |
| `suspend error -5` | most suspends | none |
| drain, cover attached | 1.1–3 %/h | ~0.7 %/h |
| drain, no cover | – | ~0.5 %/h |

The cover works right away after resume. Spurious EC GPE (SCI) wakes still happen while charging,
but the kernel handles them and goes back to sleep, so they're harmless.

A proper fix would be a per-device kernel quirk that skips `mt_set_modes` on suspend for `045e:09b5`.

Note: Windows Fast Startup was already off, so it wasn't a factor here.
