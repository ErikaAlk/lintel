// SPDX-License-Identifier: GPL-3.0-or-later
//
// 充电档位判定与输入功率统计。本文件不依赖 GNOME Shell，gjs 与 node 都能直接加载。

export const Tier = Object.freeze({NORMAL: 0, FAST: 1, SUPER: 2});

export const WINDOW_MS = 3000;
export const MIN_SAMPLES = 3;
// PD 固定 9 V 与 PPS 协议下 VBUS 不低于此值，普通 5 V 电源不会达到
export const HIGH_VOLTAGE_VOLTS = 7.5;
export const FAST_WATTS = 15;
export const SUPER_WATTS = 30;

function requireFinite(name, value) {
    if (!Number.isFinite(value))
        throw new Error(`${name} 不是有限数值：${value}`);
}

export function tierOfPower(watts) {
    if (watts >= SUPER_WATTS)
        return Tier.SUPER;
    if (watts >= FAST_WATTS)
        return Tier.FAST;
    return Tier.NORMAL;
}

export function formatWatts(watts) {
    return `${watts.toFixed(1)} W`;
}

export function formatVoltsAmps(volts, amps) {
    return `${volts.toFixed(1)} V · ${amps.toFixed(2)} A`;
}

// 一次插入电源期间的采样。档位只在本次插入内升高，拔出后调用 reset()，
// 这样电量接近充满、电流自然下降时，快充标识不会跟着消失。
export class ChargeSession {
    constructor() {
        this.reset();
    }

    reset() {
        this._samples = [];
        this._tier = Tier.NORMAL;
    }

    // 电压单位 V，电流单位 A；电池电流以充入为正
    add(timeMs, inputVolts, inputAmps, batteryVolts, batteryAmps) {
        requireFinite('时间', timeMs);
        requireFinite('输入电压', inputVolts);
        requireFinite('输入电流', inputAmps);
        requireFinite('电池电压', batteryVolts);
        requireFinite('电池电流', batteryAmps);
        if (inputVolts < 0 || inputAmps < 0 || batteryVolts < 0)
            throw new Error(`采样出现负值：${inputVolts} V ${inputAmps} A ${batteryVolts} V`);
        const last = this._samples.at(-1);
        if (last && timeMs <= last.timeMs)
            throw new Error(`采样时间没有递增：${last.timeMs} → ${timeMs}`);
        this._samples.push({timeMs, inputVolts, inputAmps, batteryVolts, batteryAmps});
        while (this._samples[0].timeMs < timeMs - WINDOW_MS)
            this._samples.shift();
        if (inputVolts >= HIGH_VOLTAGE_VOLTS)
            this._tier = Math.max(this._tier, Tier.FAST);
        if (this._samples.length >= MIN_SAMPLES)
            this._tier = Math.max(this._tier, tierOfPower(this.inputWatts));
    }

    get ready() {
        return this._samples.length > 0;
    }

    get tier() {
        return this._tier;
    }

    _average(read) {
        if (!this._samples.length)
            throw new Error('还没有采样数据');
        return this._samples.reduce((sum, sample) => sum + read(sample), 0) / this._samples.length;
    }

    get inputVolts() {
        return this._average(sample => sample.inputVolts);
    }

    get inputAmps() {
        return this._average(sample => sample.inputAmps);
    }

    get inputWatts() {
        return this._average(sample => sample.inputVolts * sample.inputAmps);
    }

    get batteryVolts() {
        return this._average(sample => sample.batteryVolts);
    }

    get batteryAmps() {
        return this._average(sample => sample.batteryAmps);
    }

    get batteryWatts() {
        return this._average(sample => sample.batteryVolts * sample.batteryAmps);
    }
}
