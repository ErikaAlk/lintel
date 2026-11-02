// SPDX-License-Identifier: GPL-3.0-or-later
//
// 充电期间每秒读取一次 qcom-battmgr 的 USB 输入与电池读数，交给 ChargeSession 统计。
// 读数文件在内核里对应一次到 ADSP 的请求，所以只在插入电源时读取，并且全部异步。

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {ChargeSession} from '../chargeTier.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

const SUPPLY_ROOT = '/sys/class/power_supply';
const POLL_MS = 1000;

// sysfs 的电压单位是 µV，电流单位是 µA
async function readUnit(file) {
    const [bytes] = await file.load_contents_async(null);
    const text = new TextDecoder().decode(bytes).trim();
    const value = Number(text);
    if (!Number.isInteger(value))
        throw new Error(`${file.get_path()} 的内容不是整数：${text}`);
    return value / 1e6;
}

export const ChargePowerService = GObject.registerClass({
    Signals: {'changed': {}},
}, class ChargePowerService extends GObject.Object {
    _init(root = SUPPLY_ROOT) {
        super._init();
        const usb = Gio.File.new_for_path(`${root}/qcom-battmgr-usb`);
        const battery = Gio.File.new_for_path(`${root}/qcom-battmgr-bat`);
        this._files = [
            usb.get_child('voltage_now'),
            usb.get_child('current_now'),
            battery.get_child('voltage_now'),
            battery.get_child('current_now'),
        ];
        this.session = new ChargeSession();
        this._active = false;
        this._run = 0;
        this._timer = 0;
        this._wake = null;
    }

    get active() {
        return this._active;
    }

    setActive(active) {
        if (active === this._active)
            return;
        this._active = active;
        this._run++;
        this._wake?.();
        if (active)
            this._loop(this._run);
        else
            this.session.reset();
    }

    async _loop(run) {
        while (run === this._run) {
            const values = await Promise.all(this._files.map(readUnit));
            if (run !== this._run)
                return;
            this.session.add(GLib.get_monotonic_time() / 1000, ...values);
            this.emit('changed');
            await this._sleep();
        }
    }

    _sleep() {
        return new Promise((resolve) => {
            this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
                this._timer = 0;
                this._wake = null;
                resolve();
                return GLib.SOURCE_REMOVE;
            });
            this._wake = () => {
                GLib.source_remove(this._timer);
                this._timer = 0;
                this._wake = null;
                resolve();
            };
        });
    }

    destroy() {
        this.setActive(false);
    }
});
