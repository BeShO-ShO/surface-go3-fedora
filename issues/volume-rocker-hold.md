# Holding the volume rocker doesn't repeat

**Status:** ✅ Fixed with a small DKMS-patched `intel-hid` (stock kernel kept)

Holding the side volume button changes the volume only once.

**Cause:** the stock `intel-hid` driver ("Intel HID 5 button array") ignores the firmware's
release codes `0xC5`/`0xC7` and sends press+release immediately on the press code. GNOME never
sees the key held down, so there's no auto-repeat. Still that way upstream as of kernel 7.3.

**Fix:** a 12-line patch ([`volhold.patch`](../fixes/volume-rocker/volhold.patch)) reports a real
key-down on `0xC4`/`0xC6` and key-up on `0xC5`/`0xC7`. It is built as a DKMS module, so it is rebuilt
automatically for every kernel update and the stock Fedora kernel stays in place:

```sh
sudo bash fixes/volume-rocker/install.sh
sudo modprobe -r intel-hid && sudo modprobe intel-hid
```

**Secure Boot:** the module must be signed with a key the firmware trusts. DKMS creates its own key
(`/var/lib/dkms/mok.pub`); enrol it once with `sudo mokutil --import /var/lib/dkms/mok.pub` and
confirm in the blue MOK screen on the next boot. I reused the key that was already enrolled for
rEFInd instead, by pointing DKMS at it in `/etc/dkms/framework.conf.d/local-key.conf`:
```
mok_signing_key=/etc/refind.d/keys/refind_local.key
mok_certificate=/etc/refind.d/keys/refind_local.cer
```

**Repeat timing:** the repeat itself comes from GNOME's keyboard repeat, so it uses the same timing
as every key on the keyboard (default: 500 ms before repeating, then every 30 ms). I use a shorter
delay and a slower repeat:
```sh
gsettings set org.gnome.desktop.peripherals.keyboard delay 300           # ms before repeat starts
gsettings set org.gnome.desktop.peripherals.keyboard repeat-interval 60  # ms between steps
```
The same sliders are in Settings → Accessibility → Typing → Repeat Keys. Don't set the delay much
below ~150 ms: a normal keypress lasts longer than that, so typing produces doubled letters (60 ms
did). Undo with `gsettings reset org.gnome.desktop.peripherals.keyboard delay` (and `repeat-interval`).

**Notes**
- `modinfo intel-hid` should show `filename: …/extra/intel-hid.ko.xz` and your key as `signer`.
- If a future kernel changes the driver enough that the DKMS build fails, the stock driver is used
  again (one step per press) until `install.sh` is re-run.
- The DKMS copy is a snapshot of the driver for the kernel it was installed on; re-run `install.sh`
  after major kernel bumps so upstream fixes to `intel-hid` aren't masked.
