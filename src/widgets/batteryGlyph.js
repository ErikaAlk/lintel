// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {HEIGHT, WIDTH, paintBattery} from '../batteryPaint.js';

function motionEnabled() {
    const settings = St.Settings.get();
    return settings.enable_animations && settings.reduced_motion !== St.ReducedMotion.REDUCE;
}

export const BatteryGlyph = GObject.registerClass(
class BatteryGlyph extends St.DrawingArea {
    _init(width = 26, height = 14) {
        super._init({width, height, y_align: Clutter.ActorAlign.CENTER});
        this.percentage = 0;
        this.charging = false;
        this.plugged = false;
        this.bolt = false;
        this.flowing = false;
        this.tier = 0;
        // 时间轴只用来按帧刷新，亮带位置取单调时钟，循环边界不会跳变
        this._ticker = new Clutter.Timeline({actor: this, duration: 1000, repeat_count: -1});
        this._ticker.connect('new-frame', () => this.queue_repaint());
        this.connect('repaint', () => this._paint());
        this.connect('style-changed', () => this.queue_repaint());
        this.connect('notify::mapped', () => this._syncAnimation());
        this.connect('destroy', () => this._ticker.stop());
        St.Settings.get().connectObject('notify::enable-animations', () => this._syncAnimation(),
            'notify::reduced-motion', () => this._syncAnimation(), this);
    }

    sync(battery, tier) {
        this.percentage = battery.percentage;
        this.charging = battery.charging;
        this.plugged = battery.state === 5;
        this.bolt = battery.pluggedIn;
        this.flowing = battery.state === 1;
        this.tier = tier;
        this._syncAnimation();
        this.queue_repaint();
    }

    get animating() {
        return this._ticker.is_playing();
    }

    _syncAnimation() {
        if (this.mapped && this.flowing && motionEnabled())
            this._ticker.start();
        else
            this._ticker.pause();
        this.queue_repaint();
    }

    _paint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        cr.scale(width / WIDTH, height / HEIGHT);
        const color = this.get_theme_node().get_foreground_color();
        paintBattery(cr, {
            percentage: this.percentage,
            bolt: this.bolt,
            tier: this.tier,
            time: this.animating ? GLib.get_monotonic_time() / 1000000 : null,
        }, [color.red / 255, color.green / 255, color.blue / 255, color.alpha / 255]);
        cr.$dispose();
    }
});
