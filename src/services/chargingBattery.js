// SPDX-License-Identifier: GPL-2.0-or-later
//
// BatteryService 加上 UPower 的原始状态，供充电动画判断是否刚插入电源。

import GObject from 'gi://GObject';

import {BatteryService} from './battery.js';

export const ChargingBattery = GObject.registerClass(
class ChargingBattery extends BatteryService {
    // 1 充电中，2 放电，4 已充满，5 已接电源但未充电
    get state() {
        return this._proxy?.State ?? 0;
    }

    get pluggedIn() {
        return [1, 4, 5].includes(this.state);
    }
});
