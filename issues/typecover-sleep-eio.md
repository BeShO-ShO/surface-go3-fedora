# Type Cover touchpad stalls suspend for 10 s (`usbhid … suspend error -5`)

**Status:** ✅ Fixed by the [HID-BPF fix](typecover-dead-after-boot.md#fix-hid-bpf-descriptor-fixup) (since 2026-11-19)

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
The [HID-BPF fix](typecover-dead-after-boot.md#fix-hid-bpf-descriptor-fixup) (`fixes/hid-bpf/`) hides the
mode-setting usages from `hid-multitouch`, so `mt_suspend` has nothing to send and nothing to wait for. It
also fixes the dead touchpad / Caps Lock light after boot. No sleep hook needed.

## Result
| | before | sleep hook (old) | HID-BPF fix |
|---|---|---|---|
| "suspend devices took" | ~10.3 s | 0.13–0.3 s | 0.13–0.28 s |
| `suspend error -5` | most suspends | none | none |
| touchpad after wake | often dead | sometimes dead | works |
| drain, cover attached | 1.1–3 %/h | ~0.7 %/h | not measured yet |

Spurious EC GPE (SCI) wakes still happen while charging, but the kernel handles them and goes back to sleep,
so they're harmless.

## Earlier workaround (superseded)
[`fixes/superseded/sleep/`](../fixes/superseded/sleep/): a systemd sleep hook that unbound the touchpad
interface from `usbhid` before sleep and re-bound it after resume, plus a service that re-enumerated the cover
after every wake, because the touchpad sometimes came back silent anyway. It worked around the 10 s stall but
cost about 1 s (at worst 16 s) of dead keyboard per wake. `fixes/hid-bpf/install.sh` turns both off.

Note: Windows Fast Startup was already off, so it wasn't a factor here.
