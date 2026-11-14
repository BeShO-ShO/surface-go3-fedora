# Won't charge when the charger is plugged in after booting on battery

**Status:** ⚠️ Open. Workarounds: use the magnetic Surface Connect charger, or **shut down** (not restart) and
power on with the USB-C charger connected

## Symptom
Boot Fedora on battery, then plug in the **USB-C** charger. Either `ACAD` shows online but the battery stays
`pending-charge` / "Not charging" at 0 A, or the charger isn't detected at all (`ACAD` offline). Shutting
down and powering on again, or booting Windows, fixes it. The magnetic **Surface Connect** charger always
works, even in the same session. The USB-C charger and cable work fine on other devices.
I first noticed it after the Fedora 44 → 45 upgrade (BIOS 18.109.143 unchanged).

```sh
upower -i $(upower -e | grep BAT)        # state: pending-charge
journalctl -b -k | grep ucsi
```

## Findings
- `ucsi_acpi USBC000:00: error -ETIMEDOUT: PPM init failed` (or `-EINVAL`) appears on most boots.
- Across the battery-start boots I checked: when UCSI stayed silent or unbound, plugging in later charged fine.
  When PPM init failed, the battery stayed in `pending-charge`. The sample is small, but the pattern was consistent.
- Same as [linux-surface #1873](https://github.com/linux-surface/linux-surface/issues/1873)
  (SGO3 charges only if the charger was connected at boot; open).
- UCSI only *reports* USB-C port state. The EC firmware runs the port, so blacklisting the driver
  shouldn't break USB-C.

## Runtime tests (2026-11-14) — none of them helped
With USB-C stuck (`ACAD` offline, `PPM init failed` on that boot):
- `sudo modprobe -r ucsi_acpi`, then unplug/replug the charger: still not detected. So the UCSI driver
  isn't what blocks charging at runtime.
- `sudo modprobe ucsi_acpi` again: `PPM init failed` again.
- Re-binding the ACPI AC driver (`ACPI0003:00` on `platform/drivers/ac`): firmware still reports no AC.
- Flipping the USB-C plug: no change.
- **Restart** with the charger plugged in: still not charging, `PPM init failed` again.
- **Shut down → power on** with USB-C plugged in: charging, and **no** UCSI error on that boot.

So the USB-C power-delivery controller comes up in a bad state on some boots and stays that way until a full
power-off; the UCSI error is a symptom of that, not the cause. A restart doesn't power the controller down.

## Earlier test idea (now unlikely to help)
```sh
sudo grub2-set-bootflag menu_show_once
# cold boot on battery → at GRUB press e → append to the linux line:
#   modprobe.blacklist=ucsi_acpi
# then plug in the charger and check upower
```
If it charges, make it permanent:
```sh
echo "blacklist ucsi_acpi" | sudo tee /etc/modprobe.d/no-ucsi.conf
```
If it still doesn't charge, the more likely explanation is that the controller comes up in a bad state and the UCSI error is only a symptom.

## Unrelated: charging stops at 50 %
Charging stopped at exactly 50 % on **both** Windows and Linux. This is a firmware cap
(UEFI *Battery Limit* or Surface app *Smart Charging*), not a Linux bug.
