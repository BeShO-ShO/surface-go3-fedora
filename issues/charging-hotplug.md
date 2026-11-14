# Won't charge when the charger is plugged in after booting on battery

**Status:** ⚠️ Open, test pending. Workaround: boot with the charger already connected, or reboot

## Symptom
Boot Fedora on battery, then plug in the charger. `ACAD` shows online, but the battery stays
`pending-charge` / "Not charging" at 0 A. Rebooting, or booting Windows, fixes it.
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

## Test (one boot)
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
