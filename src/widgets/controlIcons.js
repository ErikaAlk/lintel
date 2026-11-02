import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

const SYMBOLS = {
    'bluetooth-active-symbolic': 'bluetooth',
    'network-transmit-receive-symbolic': 'sharing',
    'video-joined-displays-symbolic': 'mirroring',
    'audio-volume-high-symbolic': 'sound',
    'audio-x-generic-symbolic': 'media',
    'erhai-control-center': 'control',
};
const directory = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent()
    .get_parent().get_child('icons');
const LOCAL_SYMBOLS = {
    'weather-clear-night-symbolic': ['bold', 'weather-clear-night-symbolic.svg'],
    'preferences-desktop-multitasking-symbolic': ['transport', 'stage-symbolic.svg'],
    'screenshot-selection-symbolic': ['transport', 'screenshot-symbolic.svg'],
};

const WIFI_STATES = new Set(['signal-none', 'signal-weak', 'signal-ok', 'signal-good',
    'signal-excellent', 'disabled', 'acquiring', 'no-route']);
const iconCache = new Map();

export function controlGIcon(name) {
    if (iconCache.has(name))
        return iconCache.get(name);
    const wifiState = name?.startsWith('network-wireless-') && name.endsWith('-symbolic')
        ? name.slice('network-wireless-'.length, -'-symbolic'.length) : null;
    const symbol = WIFI_STATES.has(wifiState) ? `wifi-${wifiState}` : SYMBOLS[name];
    const local = LOCAL_SYMBOLS[name];
    if (!symbol && !local)
        return null;
    const file = local ? directory.get_child(local[0]).get_child(local[1])
        : directory.get_child('apple').get_child(`${symbol}-symbolic.svg`);
    const icon = new Gio.FileIcon({file});
    iconCache.set(name, icon);
    return icon;
}

export const ControlIcon = GObject.registerClass({GTypeName: 'ErhaiControlSymbolIcon'}, class ControlIcon extends St.Icon {
    _init(params) {
        super._init(params);
        this.connect('notify::icon-name', () => this._syncSymbol());
        this._syncSymbol();
    }

    _syncSymbol() {
        if (this._updatingSymbol)
            return;
        const icon = controlGIcon(this.icon_name);
        if (!icon)
            return;
        this.setSymbol(this.icon_name);
    }

    setSymbol(name) {
        const icon = controlGIcon(name);
        this._updatingSymbol = true;
        if (icon) {
            if (!this.gicon?.equal(icon))
                this.gicon = icon;
        } else if (this.icon_name !== name) {
            this.icon_name = name;
        }
        this._updatingSymbol = false;
    }
});
