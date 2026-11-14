// Smooth Brightness — automatic screen brightness without the jumps.
//
// GNOME 51's BrightnessManager has an "auto brightness target" hook that
// gnome-settings-daemon normally feeds. This extension feeds it instead, with:
//   - a short median filter on the light sensor (drops hands/shadows/flicker)
//   - one smooth fade per change, which turns around mid-fade if the light moves
//   - the full 1–100 % range: darkness -> 1 %, LUX_FULL and brighter -> 100 %
//   - the brightness slider as your preference (50 % = neutral; higher bends the
//     curve brighter, lower dimmer) — GNOME saves it across restarts itself
// Idle-dim, brightness keys and the slider all keep working natively.
//
// Debug log: touch ~/.config/smooth-brightness/debug, then
//   journalctl --user -f -o cat /usr/bin/gnome-shell | grep smooth-brightness
//
// SPDX-License-Identifier: MIT

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

const SAMPLE_MS = 500;        // sensor sample interval
const MEDIAN_S = 2.0;         // median window (seconds)
const SETTLE_S = 0;           // extra steady time before starting a fade
const SETTLE_BAND = 0.03;     // "steady" = target within this of the reference
const DEADBAND = 0.06;        // ignore target changes smaller than this
const FADE_S = 5.0;           // fade duration
const FADE_STEP_MS = 50;
const MIN_LEVEL = 0.01;       // 0 turns many panels' backlight fully off
const LUX_FULL = 2000;        // this much light and above -> 100 %
const GAMMA_RANGE = 4;        // slider 0 -> gamma 4 (dim), 1 -> gamma 1/4 (bright)

const DEBUG_FILE = GLib.build_filenamev([GLib.get_user_config_dir(), 'smooth-brightness', 'debug']);

export default class SmoothBrightnessExtension extends Extension {
    enable() {
        this._mgr = Main.brightnessManager;
        if (!this._mgr)
            return;

        this._debug = GLib.file_test(DEBUG_FILE, GLib.FileTest.EXISTS);
        this._level = null;       // what we drive the backlight to (0..1)
        this._hist = [];
        this._fade = null;
        this._settleRef = null;
        this._settleSince = 0;
        this._patchedProto = null;
        this._injections = new InjectionManager();

        this._patch();
        this._mgr.connectObject(
            'changed', () => {
                this._patch();
                this._kick();
            },
            'user-update', () => this._onSliderMoved(),
            this);

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
        if (this._fadeId)
            GLib.source_remove(this._fadeId);
        this._tickId = this._fadeId = 0;
        if (this._sensor) {
            this._sensor.disconnectObject(this);
            if (this._sensor.g_name_owner)
                this._sensor.call('ReleaseLight', null, Gio.DBusCallFlags.NONE, -1, null, null);
            this._sensor = null;
        }
        this._mgr.disconnectObject(this);
        this._injections.clear();
        this._injections = null;
        this._level = null;
        // hand control back to GNOME: brightness follows the slider again
        this._mgr.autoBrightnessTarget = -1;
        this._mgr = null;
    }

    _log(msg) {
        if (this._debug)
            console.log(`smooth-brightness: ${msg}`);
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

    // Make every monitor scale use our level instead of slider/auto target.
    _patch() {
        const scale = this._mgr.scales[0];
        if (!scale)
            return;
        const proto = Object.getPrototypeOf(scale);
        if (proto === this._patchedProto)
            return;
        this._injections.clear();
        const ext = this;
        this._injections.overrideMethod(proto, 'setBacklight', orig => function (brightness) {
            if (ext._level !== null) {
                const max = ext._mgr.dimming ? ext._mgr._dimmingTarget : 1.0;
                brightness = Math.min(max, ext._level);
            }
            return orig.call(this, brightness);
        });
        this._patchedProto = proto;
    }

    // Ask GNOME to re-apply brightness (calls our patched setBacklight).
    _kick() {
        if (this._level !== null && this._mgr)
            this._mgr.autoBrightnessTarget = this._level;
    }

    _currentBacklight() {
        const scale = this._mgr.scales[0];
        const bl = scale?._getBacklights?.()[0];
        if (!bl || bl.brightnessMax <= bl.brightnessMin)
            return null;
        return (bl.brightness - bl.brightnessMin) / (bl.brightnessMax - bl.brightnessMin);
    }

    _gamma() {
        const s = this._mgr.globalScale?.value ?? 0.5;
        return GAMMA_RANGE ** (1 - 2 * s);
    }

    _target() {
        const n = this._hist.length;
        const sorted = [...this._hist].sort((a, b) => a - b);
        const med = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
        const frac = Math.clamp(med / Math.log10(LUX_FULL + 1), 0, 1);
        return MIN_LEVEL + (1 - MIN_LEVEL) * frac ** this._gamma();
    }

    _medianLux() {
        const s = [...this._hist].sort((a, b) => a - b);
        return 10 ** s[Math.floor(s.length / 2)] - 1;
    }

    _onSliderMoved() {
        // the slider is the preference: apply it at once, no fade
        if (this._level === null || !this._hist.length)
            return;
        this._stopFade();
        this._level = this._target();
        this._log(`slider ${(this._mgr.globalScale.value * 100).toFixed(0)}% -> level ${(this._level * 100).toFixed(0)}%`);
        this._kick();
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

        const target = this._target();
        const now = GLib.get_monotonic_time() / 1e6;

        if (this._level === null) {
            // take over from wherever the backlight is, then fade if needed
            this._level = this._currentBacklight() ?? target;
            this._log(`start: lux ${lux.toFixed(1)} level ${(this._level * 100).toFixed(0)}%`);
            this._kick();
        }

        if (this._fade) {
            // light moved on mid-fade -> bend toward the new target
            if (Math.abs(target - this._fade.end) >= DEADBAND) {
                this._startFade(target, true);
                this._settleRef = target;
                this._settleSince = now;
            }
            return;
        }

        if (this._settleRef === null || Math.abs(target - this._settleRef) > SETTLE_BAND) {
            this._settleRef = target;
            this._settleSince = now;
            return;
        }
        if (now - this._settleSince < SETTLE_S)
            return;
        if (Math.abs(target - this._level) >= DEADBAND)
            this._startFade(target, false);
    }

    _startFade(end, retarget) {
        this._log(`${retarget ? 'retarget' : 'fade'} ${(this._level * 100).toFixed(0)}% -> ${(end * 100).toFixed(0)}% (lux ${this._medianLux().toFixed(1)})`);
        this._fade = {
            start: this._level, end, step: 0,
            n: Math.max(1, Math.round(FADE_S * 1000 / FADE_STEP_MS)),
            easeOut: retarget,  // keeps moving at once when turning
        };
        if (!this._fadeId) {
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
                this._kick();
                if (f.step >= f.n) {
                    this._fade = null;
                    this._fadeId = 0;
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    _stopFade() {
        this._fade = null;
        if (this._fadeId) {
            GLib.source_remove(this._fadeId);
            this._fadeId = 0;
        }
    }
}
