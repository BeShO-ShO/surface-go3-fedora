#!/bin/sh
# Install (or remove) the Smooth Brightness GNOME Shell extension.
#   ./install.sh            install / update
#   ./install.sh --remove   uninstall and give auto-brightness back to GNOME
# SPDX-License-Identifier: MIT
set -eu
UUID=smooth-brightness@besho-sho
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
SRC="$(cd "$(dirname "$0")" && pwd)/$UUID"
POWER=org.gnome.settings-daemon.plugins.power

enabled() { gsettings get org.gnome.shell enabled-extensions; }
set_enabled() { gsettings set org.gnome.shell enabled-extensions "$1"; }

if [ "${1:-}" = "--remove" ]; then
    gnome-extensions disable "$UUID" 2>/dev/null || true
    set_enabled "$(enabled | python3 -c "import sys,ast; l=ast.literal_eval(sys.stdin.read().replace('@as ','')); print([x for x in l if x!='$UUID'])")"
    rm -rf "$DEST"
    echo "Removed. GNOME's own Automatic Screen Brightness works as before (unsmoothed)."
    exit 0
fi

# older version of this fix was a user service; retire it
if systemctl --user list-unit-files smooth-brightness.service >/dev/null 2>&1; then
    systemctl --user disable --now smooth-brightness.service 2>/dev/null || true
fi

mkdir -p "$DEST"
cp "$SRC"/metadata.json "$SRC"/extension.js "$DEST"/

# GNOME's Automatic Screen Brightness switch turns the extension on/off
gsettings set $POWER ambient-enabled true

case "$(enabled)" in
    *"'$UUID'"*) ;;
    "@as []") set_enabled "['$UUID']" ;;
    *) set_enabled "$(enabled | sed "s/]\$/, '$UUID']/")" ;;
esac
gnome-extensions enable "$UUID" 2>/dev/null || true

echo "Installed to $DEST"
echo "Log out and back in to load it (Wayland can't reload extensions live)."
echo "The slider moves with auto; drag it to make auto brighter or dimmer from there."
