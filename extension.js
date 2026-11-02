// SPDX-License-Identifier: GPL-3.0-or-later
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ErhaiPanelController} from './erhaiIntegration.js';

export default class ErhaiMenuBar extends Extension {
    enable() {
        this._controller = new ErhaiPanelController(this);
        this._controller.enable();
        this._uiGroup = Main.layoutManager.uiGroup;
        this._shutdownId = this._uiGroup.connect('destroy', () => this.disable());
    }

    disable() {
        if (this._shutdownId) {
            this._uiGroup.disconnect(this._shutdownId);
            this._shutdownId = 0;
        }
        this._uiGroup = null;
        this._controller?.destroy();
        this._controller = null;
    }
}
