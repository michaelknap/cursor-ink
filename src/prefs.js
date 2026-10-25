import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function spinRow(settings, key, title, subtitle, min, max, step) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: step * 5,
            value: settings.get_int(key),
        }),
        digits: 0,
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export default class CursorInkPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        const page = new Adw.PreferencesPage({title: 'Cursor Ink'});
        window.add(page);

        const ring = new Adw.PreferencesGroup({title: 'Cursor ring'});
        page.add(ring);
        const showRing = new Adw.SwitchRow({
            title: 'Show cursor ring',
            subtitle: 'Keep the pointer highlighted while moving',
        });
        settings.bind('show-ring', showRing, 'active', Gio.SettingsBindFlags.DEFAULT);
        ring.add(showRing);
        ring.add(spinRow(settings, 'ring-size', 'Diameter', 'Logical pixels', 20, 160, 2));
        ring.add(spinRow(settings, 'ring-width', 'Stroke width', 'Logical pixels', 1, 12, 1));

        const colorRow = new Adw.ActionRow({title: 'Highlight colour'});
        const colorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: false}),
            valign: Gtk.Align.CENTER,
        });
        const syncColor = () => {
            const value = settings.get_string('ring-color');
            const rgba = new Gdk.RGBA();
            rgba.parse(/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#FFD54F');
            if (!rgba.equal(colorButton.rgba))
                colorButton.rgba = rgba;
        };
        syncColor();
        colorButton.connect('notify::rgba', () => {
            const rgba = colorButton.rgba;
            const hex = [rgba.red, rgba.green, rgba.blue]
                .map(channel => Math.round(channel * 255).toString(16).padStart(2, '0'))
                .join('');
            if (settings.get_string('ring-color').toLowerCase() !== `#${hex}`)
                settings.set_string('ring-color', `#${hex}`);
        });
        const colorChangedId = settings.connect('changed::ring-color', syncColor);
        window.connect('close-request', () => {
            settings.disconnect(colorChangedId);
            window._settings = null;
            return false;
        });
        colorRow.add_suffix(colorButton);
        colorRow.activatable_widget = colorButton;
        ring.add(colorRow);

        const clicks = new Adw.PreferencesGroup({title: 'Click effects'});
        page.add(clicks);
        const showClicks = new Adw.SwitchRow({
            title: 'Animate clicks',
            subtitle: 'Show a brief ripple on left, middle and right clicks',
        });
        settings.bind('show-clicks', showClicks, 'active', Gio.SettingsBindFlags.DEFAULT);
        clicks.add(showClicks);
        clicks.add(spinRow(settings, 'click-duration', 'Ripple duration',
            'Milliseconds', 120, 900, 20));
    }
}
