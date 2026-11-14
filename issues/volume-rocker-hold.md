# Holding the volume rocker doesn't repeat

**Status:** ⚠️ Diagnosed, not fixed (stock kernel)

Holding the side volume button changes the volume only once.

**Cause:** the stock `intel-hid` driver ("Intel HID 5 button array") ignores the firmware's
release codes `0xC5`/`0xC7` and sends press+release immediately on the press code. GNOME never
sees the key held down, so there's no auto-repeat.

**Possible fix:** a DKMS-patched `intel-hid` that reports real press/release for `0xC4`–`0xC7`.
With Secure Boot on, the module has to be signed with an enrolled MOK. The linux-surface kernel is another option.
Check newer upstream kernels first.
