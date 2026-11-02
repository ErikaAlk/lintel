// SPDX-License-Identifier: GPL-3.0-or-later
//
// 插入电源时出现在屏幕中央的充电动画弹层：大电池动画、电量、档位标识与输入功率。
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {SIZE, paint} from '../chargeAnimation.js';

const WIDTH = 260;
const DRAWING_SIZE = 160;
// 没有时间轴播放时（减少动态）停在入场动画结束后的画面
const STATIC_SECONDS = 3;
const HOLD_MS = 4000;
const HOLD_AFTER_CHANGE_MS = 3500;
const MAX_VISIBLE_MS = 16000;

function motionEnabled() {
    const settings = St.Settings.get();
    return settings.enable_animations && settings.reduced_motion !== St.ReducedMotion.REDUCE;
}

export const ChargeToast = GObject.registerClass(
class ChargeToast extends St.BoxLayout {
    _init() {
        super._init({
            style_class: 'lintel-charge-toast',
            orientation: Clutter.Orientation.VERTICAL,
            width: WIDTH,
            visible: false,
            reactive: false,
            can_focus: false,
        });
        this._drawing = new St.DrawingArea({
            width: DRAWING_SIZE,
            height: DRAWING_SIZE,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._percentage = new St.Label({
            style_class: 'lintel-charge-toast-percentage',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._tierLabel = new St.Label({
            style_class: 'lintel-charge-toast-tier',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._power = new St.Label({
            style_class: 'lintel-charge-toast-power',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._drawing);
        this.add_child(this._percentage);
        this.add_child(this._tierLabel);
        this.add_child(this._power);
        this.set_pivot_point(0.5, 0.5);

        this._info = {percentage: 0, tier: 0, tierText: '', powerText: ''};
        this._startedAt = 0;
        this._shownAt = 0;
        this._hideSource = 0;
        this._dismissing = false;
        this._ticker = new Clutter.Timeline({actor: this._drawing, duration: 1000, repeat_count: -1});
        this._ticker.connect('new-frame', () => this._drawing.queue_repaint());
        this._drawing.connect('repaint', () => this._paint());
        this._drawing.connect('style-changed', () => this._drawing.queue_repaint());
        this.connect('notify::mapped', () => this._syncAnimation());
        this.connect('notify::height', () => this._position());
        this.connect('destroy', () => {
            this._clearHide();
            this._ticker.stop();
        });
        St.Settings.get().connectObject('notify::enable-animations', () => this._syncMotion(),
            'notify::reduced-motion', () => this._syncMotion(), this);
        Main.layoutManager.connectObject('monitors-changed', () => this._position(), this);
    }

    // 关闭动效时立即停在入场或收起后的画面，不让正在播放的过渡遗留半透明状态
    _syncMotion() {
        if (!motionEnabled() && this.visible) {
            this.remove_all_transitions();
            if (this._dismissing) {
                this._dismissing = false;
                this.hide();
            } else {
                this.opacity = 255;
                this.scale_x = 1;
                this.scale_y = 1;
                this.translation_y = 0;
            }
        }
        this._syncAnimation();
    }

    // info：percentage、tier（0～2）、tierText、powerText；两段文字为空时对应的标签隐藏
    present(info) {
        this._clearHide();
        this.remove_all_transitions();
        this._dismissing = false;
        this._startedAt = GLib.get_monotonic_time();
        this._shownAt = this._startedAt;
        this._apply(info);
        const animate = motionEnabled();
        this.opacity = animate ? 0 : 255;
        this.scale_x = animate ? 0.9 : 1;
        this.scale_y = animate ? 0.9 : 1;
        this.translation_y = animate ? 12 : 0;
        this.show();
        this._position();
        this.ease({opacity: 255, scale_x: 1, scale_y: 1, translation_y: 0,
            duration: animate ? 360 : 0, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        this._scheduleHide(HOLD_MS);
    }

    update(info) {
        const changed = info.tier !== this._info.tier || info.tierText !== this._info.tierText;
        this._apply(info);
        if (this.visible && !this._dismissing && changed)
            this._scheduleHide(HOLD_AFTER_CHANGE_MS);
    }

    dismiss() {
        if (!this.visible || this._dismissing)
            return;
        this._clearHide();
        this.remove_all_transitions();
        this._dismissing = true;
        const animate = motionEnabled();
        this.ease({opacity: 0, scale_x: 0.96, scale_y: 0.96,
            duration: animate ? 220 : 0, mode: Clutter.AnimationMode.EASE_IN_CUBIC,
            onComplete: () => {
                this._dismissing = false;
                this.hide();
            }});
    }

    _apply(info) {
        this._info = info;
        this._percentage.text = `${info.percentage}%`;
        this._tierLabel.text = info.tierText;
        this._tierLabel.visible = info.tierText.length > 0;
        this._power.text = info.powerText;
        this._power.visible = info.powerText.length > 0;
        this.accessible_name = [info.percentage + '%', info.tierText, info.powerText]
            .filter(Boolean).join('，');
        this._drawing.queue_repaint();
    }

    _scheduleHide(delayMs) {
        this._clearHide();
        const remaining = MAX_VISIBLE_MS - (GLib.get_monotonic_time() - this._shownAt) / 1000;
        this._hideSource = GLib.timeout_add_once(GLib.PRIORITY_DEFAULT,
            Math.max(0, Math.min(delayMs, remaining)), () => {
                this._hideSource = 0;
                this.dismiss();
            });
    }

    _clearHide() {
        if (this._hideSource)
            GLib.source_remove(this._hideSource);
        this._hideSource = 0;
    }

    _position() {
        const monitor = Main.layoutManager.primaryMonitor;
        const parent = this.get_parent();
        if (!monitor || !parent)
            return;
        const [parentX, parentY] = parent.get_transformed_position();
        const height = this.get_preferred_height(WIDTH)[1];
        this.set_position(Math.round(monitor.x + (monitor.width - WIDTH) / 2 - parentX),
            Math.round(monitor.y + (monitor.height - height) / 2 - parentY));
    }

    get animating() {
        return this._ticker.is_playing();
    }

    _syncAnimation() {
        if (this.mapped && this.visible && motionEnabled())
            this._ticker.start();
        else
            this._ticker.pause();
        this._drawing.queue_repaint();
    }

    _paint() {
        const cr = this._drawing.get_context();
        const [width, height] = this._drawing.get_surface_size();
        cr.scale(width / SIZE, height / SIZE);
        const color = this._drawing.get_theme_node().get_foreground_color();
        const time = this.animating ? (GLib.get_monotonic_time() - this._startedAt) / 1000000 : STATIC_SECONDS;
        paint(cr, {percentage: this._info.percentage, tier: this._info.tier, time},
            [color.red / 255, color.green / 255, color.blue / 255, color.alpha / 255]);
        cr.$dispose();
    }
});
