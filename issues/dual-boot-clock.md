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
