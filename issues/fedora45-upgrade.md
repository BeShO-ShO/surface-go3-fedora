# Fedora 44 → 45 upgrade notes (GNOME 51)

Upgraded on 2026-11-04 (Fedora 45: GNOME 51, kernel 7.2, enforced RPM signature checking, kmscon).

## Before upgrading
- **Third-party COPRs** may have no F45 chroot yet (e.g. PyCharm), and `system-upgrade` fails on them.
  Disable them or use `--skip-unavailable`.
- **GNOME extensions** that list only `"50"` in `shell-version` are disabled on 51.
- **Dual boot with rEFInd defaulting to Windows:** pick Fedora by hand on the upgrade reboots.

## GNOME 51 extension API breaks hit here
| GNOME 50 | GNOME 51 |
|---|---|
| `new St.BoxLayout({ vertical: true })` | `new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL })` |
| `Clutter.get_default_backend()` | `global.stage.context.get_backend()` |

Private APIs such as `Main.keyboard._keyboard` and `layoutManager._trackedActors` still worked.

Tip: GNOME 51's shell JS isn't on disk, and there's no `gresource` tool for it. Find `GVariant\0\0\0\0` in
`/usr/lib64/gnome-shell/libshell-51.so`, carve that resource out to a file, and then:
```js
// gjs
const r = Gio.Resource.load('/tmp/shell.gresource');
print(new TextDecoder().decode(r.lookup_data('/org/gnome/shell/ui/keyboard.js', 0).toArray()));
```

## After upgrading
- Secret Service changed to **oo7-daemon** (keyring migrated). See [Chrome sign-in](chrome-signin-keyring.md).
- [Charging hot-plug issue](charging-hotplug.md) first noticed after the upgrade.
- Type Cover quirks didn't change (same kernel series at the time).
