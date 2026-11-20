// Smooth Brightness — automatic screen brightness that moves the slider with it.
//
// With "Automatic Screen Brightness" on (Settings), this extension:
//   - reads the ambient light sensor (iio-sensor-proxy) and works out an auto
//     level on a fixed log-lux curve: ~1 % in darkness, ~28 % at 7 lux,
//     ~66 % at 150 lux, 100 % at 2000 lux and above
//   - filters it (2 s median), ignores changes under 6 points, and moves to a
//     new level in ONE 5 s fade that turns around mid-fade if the light changes
//   - moves GNOME's brightness slider along with it, so the slider always shows
//     the real brightness
//   - when you drag the slider (or press brightness keys) it remembers how far
//     you are above/below auto, and keeps that offset as the light changes —
//     so you can brighten a dark room or dim a bright one and auto keeps working
// With the switch off, brightness is plain manual GNOME.
//
// It replaces gnome-settings-daemon's auto-brightness maths (linear in lux and
// re-anchored on every slider touch and idle-dim, which made it jumpy and
// drift), but keeps its on/off switch. Idle-dim and keys work as usual.
//
// Debug log: touch ~/.config/smooth-brightness/debug, log out and in, then
//   journalctl --user -f -o cat /usr/bin/gnome-shell | grep smooth-brightness
//
// SPDX-License-Identifier: MIT

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SAMPLE_MS = 500;        // sensor sample interval
const MEDIAN_S = 2.0;         // median window (seconds)
const DEADBAND = 0.06;        // ignore target changes smaller than this
const FADE_S = 5.0;           // fade duration
const FADE_STEP_MS = 50;
const MIN_LEVEL = 0.01;       // 0 turns many panels' backlight fully off
const LUX_FULL = 2000;        // this much light and above -> 100 % auto

const POWER_SCHEMA = 'org.gnome.settings-daemon.plugins.power';
const CONFIG_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'smooth-brightness']);
const DEBUG_FILE = GLib.build_filenamev([CONFIG_DIR, 'debug']);
const OFFSET_FILE = GLib.build_filenamev([CONFIG_DIR, 'offset']);

export default class SmoothBrightnessExtension extends Extension {
    enable() {
        this._mgr = Main.brightnessManager;
        if (!this._mgr)
            return;

        this._debug = GLib.file_test(DEBUG_FILE, GLib.FileTest.EXISTS);
        this._hist = [];
        this._fade = null;
        this._level = null;       // brightness we are driving (0..1)
        this._offset = this._loadOffset();

        // gnome-settings-daemon still sends its own auto target over D-Bus;
        // swallow it (we do the auto part) and keep GNOME in "slider = backlight"
        // mode by reporting -1.
        const proto = Object.getPrototypeOf(this._mgr);
        this._abDesc = Object.getOwnPropertyDescriptor(proto, 'autoBrightnessTarget');
        Object.defineProperty(this._mgr, 'autoBrightnessTarget', {
            configurable: true,
            get: () => -1,
            set: _v => {},
        });
        this._abDesc.set.call(this._mgr, -1);

        this._power = new Gio.Settings({schema_id: POWER_SCHEMA});
        this._power.connectObject('changed::ambient-enabled', () => this._onSwitch(), this);
        this._mgr.connectObject('user-update', () => this._onUserChange(), this);

        this._cancellable = new Gio.Cancellable();
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            'net.hadess.SensorProxy', '/net/hadess/SensorProxy',
            'net.hadess.SensorProxy', this._cancellable,
            (_o, res) => {
                try {
                    this._sensor = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.warn(`smooth-brightness: no sensor proxy: ${e.message}`);
                    return;
                }
                // iio-sensor-proxy restarted -> claim again
                this._sensor.connectObject('notify::g-name-owner', () => this._claim(), this);
                this._claim();
                this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAMPLE_MS, () => {
                    this._tick();
                    return GLib.SOURCE_CONTINUE;
                });
            });
    }

    disable() {
        if (!this._mgr)
            return;
        this._cancellable?.cancel();
        this._cancellable = null;
        if (this._tickId)
            GLib.source_remove(this._tickId);
        this._tickId = 0;
        this._stopFade();
        if (this._saveId)
            GLib.source_remove(this._saveId);
        this._saveId = 0;
        if (this._sensor) {
            this._sensor.disconnectObject(this);
            if (this._sensor.g_name_owner)
                this._sensor.call('ReleaseLight', null, Gio.DBusCallFlags.NONE, -1, null, null);
            this._sensor = null;
        }
        this._power.disconnectObject(this);
        this._power = null;
        this._mgr.disconnectObject(this);
        // back to GNOME's own accessor; the slider keeps the current brightness
        delete this._mgr.autoBrightnessTarget;
        this._mgr = null;
    }

    _log(msg) {
        if (this._debug)
            console.log(`smooth-brightness: ${msg}`);
    }

    _pct(v) {
        return `${(v * 100).toFixed(0)}%`;
    }

    _active() {
        return this._power?.get_boolean('ambient-enabled') && !!this._mgr.globalScale;
    }

    _claim() {
        if (!this._sensor?.g_name_owner)
            return;
        this._sensor.call('ClaimLight', null, Gio.DBusCallFlags.NONE, -1, null, (p, res) => {
            try {
                p.call_finish(res);
            } catch (e) {
                console.warn(`smooth-brightness: ClaimLight failed: ${e.message}`);
            }
        });
    }

    // ---- offset (how far the user wants to be above/below auto) ----

    _loadOffset() {
        try {
            const [, bytes] = GLib.file_get_contents(OFFSET_FILE);
            const v = parseFloat(new TextDecoder().decode(bytes));
            return Number.isFinite(v) ? Math.clamp(v, -1, 1) : 0;
        } catch {
            return 0;
        }
    }

    _saveOffsetSoon() {
        if (this._saveId)
            GLib.source_remove(this._saveId);
        this._saveId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._saveId = 0;
            try {
                GLib.mkdir_with_parents(CONFIG_DIR, 0o755);
                GLib.file_set_contents(OFFSET_FILE, `${this._offset.toFixed(4)}\n`);
            } catch (e) {
                console.warn(`smooth-brightness: can't save offset: ${e.message}`);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    // ---- brightness ----

    _auto() {
        const s = [...this._hist].sort((a, b) => a - b);
        const n = s.length;
        const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
        const frac = Math.clamp(med / Math.log10(LUX_FULL + 1), 0, 1);
        return MIN_LEVEL + (1 - MIN_LEVEL) * frac;
    }

    _desired() {
        return Math.clamp(this._auto() + this._offset, MIN_LEVEL, 1);
    }

    // Move GNOME's slider to `level` and apply it, without it counting as a
    // user change (no OSD popup, no 'user-update').
    _apply(level) {
        const mgr = this._mgr;
        const gs = mgr.globalScale;
        if (!gs)
            return;
        mgr._inhibitUpdates = true;
        try {
            gs.value = level;
        } finally {
            mgr._inhibitUpdates = false;
        }
        mgr._globalScaleChanged = true;
        mgr._sync({showOSD: false});
    }

    _onUserChange() {
        // slider dragged or brightness keys: remember the offset from auto
        if (!this._active() || !this._hist.length)
            return;
        this._stopFade();
        this._level = this._mgr.globalScale.value;
        this._offset = this._level - this._auto();
        this._log(`user set ${this._pct(this._level)} (auto ${this._pct(this._auto())}, offset ${(this._offset * 100).toFixed(0)})`);
        this._saveOffsetSoon();
    }

    _onSwitch() {
        this._stopFade();
        this._level = null;   // re-sync from the slider on next tick
        this._log(`auto ${this._active() ? 'on' : 'off'}`);
    }

    _tick() {
        const v = this._sensor?.get_cached_property('LightLevel');
        if (!v)
            return;
        const lux = Math.max(0, v.unpack());
        this._hist.push(Math.log10(lux + 1));
        const maxLen = Math.max(1, Math.round(MEDIAN_S * 1000 / SAMPLE_MS));
        while (this._hist.length > maxLen)
            this._hist.shift();

        if (!this._active())
            return;

        if (this._level === null) {
            // start from wherever the slider is now
            this._level = this._mgr.globalScale.value;
            this._log(`start: lux ${lux.toFixed(1)}, level ${this._pct(this._level)}, offset ${(this._offset * 100).toFixed(0)}`);
        }

        const target = this._desired();
        if (this._fade) {
            // light moved on mid-fade -> bend toward the new target
            if (Math.abs(target - this._fade.end) >= DEADBAND)
                this._startFade(target, true);
            return;
        }
        if (Math.abs(target - this._level) >= DEADBAND)
            this._startFade(target, false);
    }

    _startFade(end, retarget) {
        this._log(`${retarget ? 'retarget' : 'fade'} ${this._pct(this._level)} -> ${this._pct(end)} (auto ${this._pct(this._auto())})`);
        this._fade = {
            start: this._level, end, step: 0,
            n: Math.max(1, Math.round(FADE_S * 1000 / FADE_STEP_MS)),
            easeOut: retarget,  // keeps moving at once when turning
        };
        if (this._fadeId)
            return;
        this._fadeId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FADE_STEP_MS, () => {
            const f = this._fade;
            if (!f) {
                this._fadeId = 0;
                return GLib.SOURCE_REMOVE;
            }
            f.step++;
            let x = f.step / f.n;
            x = f.easeOut ? x * (2 - x) : x * x * (3 - 2 * x);
            this._level = f.start + (f.end - f.start) * x;
            this._apply(this._level);
            if (f.step >= f.n) {
                this._fade = null;
                this._fadeId = 0;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopFade() {
        this._fade = null;
        if (this._fadeId) {
            GLib.source_remove(this._fadeId);
            this._fadeId = 0;
        }
    }
}
