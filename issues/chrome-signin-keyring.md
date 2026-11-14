# Chrome keeps losing its profile sign-in (oo7 secret service)

**Status:** ✅ Cause found; fixed by turning GDM autologin off

Sometimes Chrome starts signed out of its profile. The journal shows Chrome failing to get its
encryption key from the Secret Service:
```
freedesktop_secret_key_provider: Prompt call returned no response
token_service_table: Failed to decrypt token
```

- On Fedora 45 the Secret Service is **oo7-daemon 0.7.0 (beta)**; gnome-keyring isn't installed,
  and the keyring was migrated during the F45 upgrade. `pam_oo7` is in the login stack.

**Cause:** GDM **autologin** was on. With autologin there is no password for `pam_oo7`, so the login
keyring stays locked and Chrome needs an unlock prompt. oo7 0.7.0 beta fails to show that prompt
([oo7#647](https://github.com/linux-credentials/oo7/issues/647), fixed upstream in 0.7.1; Fedora
bug 2567217 tracks the update). Other keyring users broke the same way, e.g. `gh` reported its
stored token as invalid.

**Fix:** turn autologin off (`AutomaticLoginEnable=False` in `/etc/gdm/custom.conf`). Logging in with
the password unlocks the keyring and the failures stop. Autologin should be usable again once
oo7 0.7.1 reaches Fedora.

Not recommended: `--password-store=basic` hides the problem, but it weakens local encryption and
can make existing saved data unreadable.
