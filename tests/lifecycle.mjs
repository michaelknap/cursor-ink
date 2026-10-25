import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../src/extension.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('export default class CursorInkExtension', 'class CursorInkExtension');

function createHarness({failParenting = false, failSettings = false} = {}) {
    const actors = [];
    const timers = new Map();
    const values = {
        'show-ring': true,
        'show-clicks': true,
        'ring-size': 44,
        'ring-width': 3,
        'ring-color': '#FFD54F',
        'click-duration': 320,
    };
    const settings = {
        get_boolean: key => values[key],
        get_int: key => values[key],
        get_string: key => values[key],
        connectObject() {},
    };

    class Widget {
        constructor(properties) {
            Object.assign(this, properties);
            this.children = [];
            this.destroyCount = 0;
            actors.push(this);
        }

        add_child(child) {
            if (failParenting && child.name === 'cursor-ink-ring')
                throw new Error('Could not parent the ring');
            this.children.push(child);
            child.parent = this;
        }

        destroy() {
            assert.equal(this.destroyCount++, 0, `${this.name} destroyed twice`);
            this.remove_all_transitions();
            for (const child of [...this.children])
                child.destroy();
            if (this.parent) {
                const siblings = this.parent.children;
                siblings.splice(siblings.indexOf(this), 1);
                this.parent = null;
            }
        }

        ease(properties) {
            this.onStopped = properties.onStopped;
        }

        remove_all_transitions() {
            const callback = this.onStopped;
            this.onStopped = null;
            callback?.();
        }

        add_constraint() {}
        set_size() {}
        set_style() {}
        set_position() {}
        set_pivot_point() {}
        set_scale() {}
        set_child_above_sibling() {}
    }

    const uiGroup = new Widget({name: 'shell-ui-group'});
    let nextTimer = 1;
    const Extension = runInNewContext(`${source}\nCursorInkExtension;`, {
        Clutter: {
            ModifierType: {BUTTON1_MASK: 1, BUTTON2_MASK: 2, BUTTON3_MASK: 4},
            FixedLayout: class {},
            BindConstraint: class {},
            BindCoordinate: {SIZE: 0},
            AnimationMode: {EASE_OUT_CUBIC: 0},
        },
        GLib: {
            PRIORITY_DEFAULT: 0,
            SOURCE_CONTINUE: true,
            timeout_add(priority, interval, callback) {
                const id = nextTimer++;
                timers.set(id, callback);
                return id;
            },
            Source: {remove: id => timers.delete(id)},
        },
        St: {Widget},
        Extension: class {
            getSettings() {
                if (failSettings)
                    throw new Error('Could not load settings');
                return settings;
            }
        },
        Main: {layoutManager: {uiGroup}},
        global: {
            stage: {},
            backend: {
                get_cursor_tracker: () => ({
                    get_pointer_visible: () => true,
                    connectObject() {},
                }),
            },
            get_pointer: () => [200, 300, 0],
        },
    });

    return {
        extension: new Extension(),
        actors,
        timers,
        values,
        assertClean() {
            assert.equal(timers.size, 0);
            assert.equal(uiGroup.children.length, 0);
            for (const actor of actors.filter(actor => actor !== uiGroup))
                assert.equal(actor.destroyCount, 1, `${actor.name} leaked`);
        },
    };
}

test('disable cleans active ripples, ring, overlay and timer without double destruction', () => {
    const harness = createHarness();
    harness.extension.enable();
    harness.extension._ripple(100, 200);
    harness.extension._ripple(300, 400);
    assert.equal(harness.extension._ripples.size, 2);
    assert.equal(harness.timers.size, 1);
    harness.extension.disable();
    harness.assertClean();
});

test('an animation that already finished is not destroyed again during disable', () => {
    const harness = createHarness();
    harness.extension.enable();
    harness.extension._ripple(100, 200);
    const ripple = [...harness.extension._ripples][0];
    ripple.remove_all_transitions();
    assert.equal(harness.extension._ripples.size, 0);
    harness.extension.disable();
    harness.assertClean();
});

test('failed parenting also destroys the ring that never became a child', () => {
    const harness = createHarness({failParenting: true});
    assert.throws(() => harness.extension.enable(), /Could not parent the ring/);
    harness.assertClean();
});

test('failed settings setup and repeated disable remain safe', () => {
    const harness = createHarness({failSettings: true});
    assert.throws(() => harness.extension.enable(), /Could not load settings/);
    harness.extension.disable();
    harness.assertClean();
});

test('disabling click effects clears animations and polling while retaining the ring', () => {
    const harness = createHarness();
    harness.extension.enable();
    harness.extension._ripple(100, 200);
    harness.values['show-clicks'] = false;
    harness.extension._updateSettings();
    assert.equal(harness.extension._ripples.size, 0);
    assert.equal(harness.extension._ring.destroyCount, 0);
    assert.equal(harness.timers.size, 0);
    harness.extension.disable();
    harness.assertClean();
});

test('disable is safe before enable and across repeated enable/disable cycles', () => {
    const harness = createHarness();
    harness.extension.disable();
    for (let i = 0; i < 2; i++) {
        harness.extension.enable();
        harness.extension._ripple(100, 200);
        harness.extension.disable();
        harness.extension.disable();
        harness.assertClean();
    }
});
