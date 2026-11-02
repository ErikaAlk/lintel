// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {_} from '../i18n.js';

const PREFIX = 'org.mpris.MediaPlayer2.';
const PATH = '/org/mpris/MediaPlayer2';
const IFACE = 'org.mpris.MediaPlayer2.Player';

export const MediaService = GObject.registerClass({Signals: {changed: {}}},
class MediaService extends GObject.Object {
    _init() {
        super._init();
        this._players = new Map();
        this._pending = new Map();
        this._sequence = 0;
        this._destroyed = false;
        this._watchId = Gio.DBus.session.signal_subscribe('org.freedesktop.DBus',
            'org.freedesktop.DBus', 'NameOwnerChanged', '/org/freedesktop/DBus',
            null, Gio.DBusSignalFlags.NONE, (_connection, _sender, _path, _iface, _signal, params) => {
                const [name, oldOwner, newOwner] = params.deep_unpack();
                if (!name.startsWith(PREFIX))
                    return;
                if (oldOwner)
                    this._remove(name);
                if (newOwner)
                    this._add(name);
            });
        Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', 'ListNames', null, new GLib.VariantType('(as)'),
            Gio.DBusCallFlags.NONE, -1, null, (connection, result) => {
                const [names] = connection.call_finish(result).deep_unpack();
                if (!this._destroyed)
                    names.filter(name => name.startsWith(PREFIX)).forEach(name => this._add(name));
            });
    }

    _add(name) {
        if (this._players.has(name) || this._pending.has(name))
            return;
        const cancellable = new Gio.Cancellable();
        this._pending.set(name, cancellable);
        Gio.DBusProxy.new(Gio.DBus.session, Gio.DBusProxyFlags.DO_NOT_AUTO_START,
            null, name, PATH, IFACE, cancellable, (_source, result) => {
                if (cancellable.is_cancelled())
                    return;
                const proxy = Gio.DBusProxy.new_finish(result);
                this._pending.delete(name);
                if (!proxy.g_name_owner)
                    return;
                const entry = {proxy, sequence: ++this._sequence};
                entry.signal = proxy.connect('g-properties-changed', () => {
                    entry.sequence = ++this._sequence;
                    this.emit('changed');
                });
                this._players.set(name, entry);
                this.emit('changed');
            });
    }

    _remove(name) {
        this._pending.get(name)?.cancel();
        this._pending.delete(name);
        const entry = this._players.get(name);
        if (entry)
            entry.proxy.disconnect(entry.signal);
        this._players.delete(name);
        this.emit('changed');
    }

    get _proxy() {
        return [...this._players.values()].sort((first, second) =>
            Number(value(second.proxy, 'PlaybackStatus') === 'Playing')
            - Number(value(first.proxy, 'PlaybackStatus') === 'Playing')
            || second.sequence - first.sequence)[0]?.proxy;
    }

    get available() { return Boolean(this._proxy); }
    get playing() { return value(this._proxy, 'PlaybackStatus') === 'Playing'; }
    get title() { return value(this._proxy, 'Metadata')?.['xesam:title'] || _('Not Playing'); }
    get artist() { return (value(this._proxy, 'Metadata')?.['xesam:artist'] ?? []).join(', '); }
    get artUrl() { return value(this._proxy, 'Metadata')?.['mpris:artUrl'] ?? ''; }
    get capabilities() {
        const proxy = this._proxy;
        const control = value(proxy, 'CanControl') === true;
        return {
            previous: control && value(proxy, 'CanGoPrevious') === true,
            'play-pause': control && value(proxy, this.playing ? 'CanPause' : 'CanPlay') === true,
            next: control && value(proxy, 'CanGoNext') === true,
        };
    }

    _call(method, capability) {
        const proxy = this._proxy;
        if (!this.capabilities[capability])
            return;
        proxy.call(method, null, Gio.DBusCallFlags.NONE, -1, null, (source, result) =>
            source.call_finish(result));
    }
    previous() { this._call('Previous', 'previous'); }
    playPause() { this._call('PlayPause', 'play-pause'); }
    next() { this._call('Next', 'next'); }

    destroy() {
        this._destroyed = true;
        Gio.DBus.session.signal_unsubscribe(this._watchId);
        for (const cancellable of this._pending.values())
            cancellable.cancel();
        this._pending.clear();
        for (const entry of this._players.values())
            entry.proxy.disconnect(entry.signal);
        this._players.clear();
    }
});

function value(proxy, name) {
    return proxy?.get_cached_property(name)?.recursiveUnpack();
}
