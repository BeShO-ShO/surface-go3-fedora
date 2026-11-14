# Clock hours off after dual-booting Windows

**Status:** ✅ Fixed on Linux. Windows side needs a registry change

The system clock was ~11 h fast: the AEDT offset had been applied twice, because the RTC
held local time.

Linux:
```sh
sudo chronyc makestep
sudo timedatectl set-local-rtc 0       # RTC = UTC
```

Windows (admin `cmd`): tell Windows the RTC is UTC too, otherwise it rewrites it as local time:
```bat
reg add "HKLM\SYSTEM\CurrentControlSet\Control\TimeZoneInformation" /v RealTimeIsUniversal /t REG_DWORD /d 1 /f
```
Or double-click [`clock-utc.reg`](../fixes/windows-clock/clock-utc.reg) in Windows (put it on an SD card or USB
stick; exFAT/FAT is readable from both systems) and answer Yes twice. Restart Windows afterwards; if the time is
wrong on that first boot, use *Settings → Time & language → Date & time → Sync now* once.
[`undo-clock-utc.reg`](../fixes/windows-clock/undo-clock-utc.reg) removes the value again.
