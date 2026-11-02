// SPDX-License-Identifier: GPL-3.0-or-later
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const BrightnessService = GObject.registerClass({Signals: {'changed': {}}},
class BrightnessService extends GObject.Object {
    _init() {
        super._init();
        this._manager = Main.brightnessManager;
        this._scale = null;
        this._scaleId = 0;
        this._managerId = this._manager.connect('changed', () => this._sync());
        this._sync();
    }

    _sync() {
        if (this._scaleId)
            this._scale.disconnect(this._scaleId);
        this._scale = this._manager.globalScale;
        this._scaleId = this._scale?.connect('notify::value', () => this.emit('changed')) ?? 0;
        this.emit('changed');
    }

    get available() {
        return this._scale !== null;
    }

    get level() {
        return this._scale?.value ?? 0;
    }

    setLevel(value) {
        if (!this._scale)
            throw new Error('显示器尚未提供亮度控制');
        this._scale.value = Math.max(0.05, Math.min(1, value));
    }

    refresh() {
        this._sync();
    }

    destroy() {
        if (this._scaleId)
            this._scale.disconnect(this._scaleId);
        this._manager.disconnect(this._managerId);
        this._scaleId = 0;
        this._scale = null;
        this._manager = null;
    }
});
