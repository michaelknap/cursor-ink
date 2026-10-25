import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Sample compositor state without grabbing input or reading input devices.
const BUTTON_MASK = Clutter.ModifierType.BUTTON1_MASK |
    Clutter.ModifierType.BUTTON2_MASK |
    Clutter.ModifierType.BUTTON3_MASK;
const SAMPLE_INTERVAL_MS = 16;
const MAX_RIPPLES = 12;

export default class CursorInkExtension extends Extension {
    enable() {
        this._ripples = new Set();
        this._timerId = 0;

        this._settings = this.getSettings();
        this._tracker = global.backend.get_cursor_tracker();
        this._layer = new St.Widget({
            name: 'cursor-ink-layer',
            reactive: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._layer.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.SIZE,
        }));
        // A visual-only overlay needs no chrome/input-region tracking.
        Main.layoutManager.uiGroup.add_child(this._layer);

        this._ring = new St.Widget({name: 'cursor-ink-ring', reactive: false});
        this._layer.add_child(this._ring);

        // The layer owns these connections; destroying it disconnects them.
        this._settings.connectObject('changed', () => this._updateSettings(),
            this._layer);
        this._tracker.connectObject(
            'position-invalidated', () => this._syncPointer(),
            'visibility-changed', () => this._syncPointer(),
            this._layer);
        this._updateSettings();
    }

    _updateSettings() {
        const s = this._settings;
        this._showRing = s.get_boolean('show-ring');
        this._showClicks = s.get_boolean('show-clicks');
        this._ringSize = s.get_int('ring-size');
        this._ringWidth = s.get_int('ring-width');
        this._duration = s.get_int('click-duration');

        const color = s.get_string('ring-color');
        this._color = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#FFD54F';
        this._ring.set_size(this._ringSize, this._ringSize);
        this._ring.set_style(this._ringStyle(this._ringSize, this._ringWidth));
        this._lastX = NaN;
        this._lastY = NaN;
        this._syncPointer();

        if (this._showClicks && !this._timerId) {
            // Enabling while a button is held must not synthesize a click.
            this._previousButtons = global.get_pointer()[2] & BUTTON_MASK;
            this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                SAMPLE_INTERVAL_MS, () => {
                    this._sampleClicks();
                    return GLib.SOURCE_CONTINUE;
                });
        } else if (!this._showClicks) {
            if (this._timerId)
                GLib.Source.remove(this._timerId);
            this._timerId = 0;
            this._clearRipples();
        }
    }

    _ringStyle(diameter, thickness) {
        return `border: ${thickness}px solid ${this._color}; ` +
            `border-radius: ${Math.ceil(diameter / 2)}px; ` +
            'background-color: transparent;';
    }

    _syncPointer(x, y) {
        const visible = this._showRing && this._tracker.get_pointer_visible();
        if (this._ring.visible !== visible)
            this._ring.visible = visible;
        if (!visible)
            return;

        if (x === undefined)
            [x, y] = global.get_pointer();
        if (x !== this._lastX || y !== this._lastY) {
            this._ring.set_position(
                Math.round(x - this._ringSize / 2),
                Math.round(y - this._ringSize / 2));
            this._lastX = x;
            this._lastY = y;
        }
    }

    _sampleClicks() {
        const [x, y, modifiers] = global.get_pointer();
        const buttons = modifiers & BUTTON_MASK;
        const newlyPressed = buttons & ~this._previousButtons;
        this._previousButtons = buttons;
        this._syncPointer(x, y);
        if (newlyPressed && this._tracker.get_pointer_visible())
            this._ripple(x, y);
    }

    _ripple(x, y) {
        if (this._ripples.size >= MAX_RIPPLES)
            return;

        const diameter = Math.round(this._ringSize * 2.2);
        const ripple = new St.Widget({
            name: 'cursor-ink-ripple',
            reactive: false,
            opacity: 230,
        });
        ripple.set_size(diameter, diameter);
        ripple.set_position(Math.round(x - diameter / 2),
            Math.round(y - diameter / 2));
        ripple.set_pivot_point(0.5, 0.5);
        ripple.set_scale(0.25, 0.25);
        ripple.set_style(this._ringStyle(diameter, this._ringWidth));

        this._layer.add_child(ripple);
        this._layer.set_child_above_sibling(this._ring, null);
        this._ripples.add(ripple);
        ripple.ease({
            scale_x: 1,
            scale_y: 1,
            opacity: 0,
            duration: this._duration,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onStopped: () => {
                if (this._ripples?.delete(ripple))
                    ripple.destroy();
            },
        });
    }

    _clearRipples() {
        if (!this._ripples)
            return;

        for (const ripple of this._ripples) {
            // Remove first: stopping transitions invokes onStopped synchronously.
            this._ripples.delete(ripple);
            ripple.remove_all_transitions();
            ripple.destroy();
        }
    }

    disable() {
        if (this._timerId)
            GLib.Source.remove(this._timerId);
        this._timerId = 0;
        this._clearRipples();
        this._ring?.destroy();
        this._layer?.destroy();
        this._layer = null;
        this._ring = null;
        this._tracker = null;
        this._settings = null;
        this._ripples = null;
    }
}
