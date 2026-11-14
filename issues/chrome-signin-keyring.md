# Chrome keeps losing its profile sign-in (oo7 secret service)

**Status:** ⚠️ Open

Sometimes Chrome starts signed out of its profile. The journal shows Chrome failing to get its
encryption key from the Secret Service:
```
freedesktop_secret_key_provider: Prompt call returned no response
token_service_table: Failed to decrypt token
```

- On Fedora 45 the Secret Service is **oo7-daemon 0.7 (beta)**; gnome-keyring isn't installed,
  and the keyring was migrated during the F45 upgrade. `pam_oo7` is in the login stack.
- Ruled out: clearing cookies on exit, autologin, and a wrong clock.
- Failures happened both seconds and minutes after `oo7-daemon` started, so it isn't simply a startup race.

To try: update `oo7` first. `--password-store=basic` hides the problem, but it weakens local
encryption and can make existing saved data unreadable.
