// SPDX-License-Identifier: GPL-2.0-or-later
//
// Reusable macOS-Control-Center controls. The popup deliberately uses a small
// set of actors with predictable geometry instead of GNOME Quick Settings
// widgets: their layout changes between Shell releases, while these controls
// need to keep the compact Tahoe composition on GNOME 50 and 51.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

import {_} from '../i18n.js';
import {ControlIcon} from './controlIcons.js';

const transportDirectory = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent()
    .get_parent().get_child('icons').get_child('transport');
function transportIcon(name) {
    return new Gio.FileIcon({file: transportDirectory.get_child(`${name}-symbolic.svg`)});
}

/** A horizontal network/focus capsule with a circular state icon. */
export const CCTile = GObject.registerClass(
class CCTile extends St.Button {
    _init(iconName, title, styleClass = '') {
        const classes = ['lintel-cc-tile', styleClass]
            .filter(Boolean).join(' ');
        super._init({
            style_class: classes,
            accessible_name: title,
            can_focus: true,
            x_expand: true,
            toggle_mode: true,
        });

        const box = new St.BoxLayout({
            style_class: 'lintel-cc-tile-box',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._icon = new ControlIcon({
            icon_name: iconName,
            style_class: 'lintel-cc-tile-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        // macOS Tahoe: icon on the left, title/status left-aligned right beside
        // it (not centred in the capsule).
        this._labels = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._title = new St.Label({
            text: title,
            style_class: 'lintel-cc-tile-title',
            x_align: Clutter.ActorAlign.START,
        });
        this._status = new St.Label({
            style_class: 'lintel-cc-tile-status',
            x_align: Clutter.ActorAlign.START,
        });
        this._labels.add_child(this._title);
        this._labels.add_child(this._status);
        box.add_child(this._icon);
        box.add_child(this._labels);
        this.set_child(box);
    }

    /**
     * A control resized to one grid cell is Tahoe's circle: the glyph alone,
     * centred. The title stays the accessible name, so it is not lost.
     */
    setCompact(compact) {
        this._labels.visible = !compact;
        this._icon.x_expand = compact;
        this._icon.x_align = compact
            ? Clutter.ActorAlign.CENTER
            : Clutter.ActorAlign.START;
        if (compact)
            this.add_style_class_name('lintel-cc-tile-compact');
        else
            this.remove_style_class_name('lintel-cc-tile-compact');
    }

    setTitle(text) {
        this._title.text = text;
        this.accessible_name = text;
    }

    setActive(active, statusText = '') {
        this.checked = active;
        if (active)
            this._icon.add_style_pseudo_class('checked');
        else
            this._icon.remove_style_pseudo_class('checked');
        this._status.text = statusText;
        this._status.visible = statusText.length > 0;
    }

    setIcon(name) {
        this._icon.setSymbol(name);
    }

    /**
     * Third-party Quick Settings tiles carry a GIcon (often a themed icon from
     * the extension's own directory), not an icon name, so take it as-is.
     */
    setGicon(gicon) {
        if (gicon)
            this._icon.gicon = gicon;
    }
});

/** The large Now Playing module from the right side of Control Center. */
export const CCMediaCard = GObject.registerClass({
    Signals: {
        previous: {},
        'play-pause': {},
        next: {},
    },
},
class CCMediaCard extends St.BoxLayout {
    _init(styleClass = 'lintel-cc-media') {
        super._init({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: styleClass,
            accessible_name: _('Now Playing'),
            x_expand: true,
        });

        const header = new St.BoxLayout({
            style_class: 'lintel-cc-media-header',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._artwork = new ControlIcon({
            icon_name: 'audio-x-generic-symbolic',
            style_class: 'lintel-cc-media-artwork',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(this._artwork);

        const metadata = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lintel-cc-media-metadata',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            y_align: Clutter.ActorAlign.END,
        });
        this._title = new St.Label({
            text: _('Not Playing'),
            style_class: 'lintel-cc-media-title',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this._artist = new St.Label({
            style_class: 'lintel-cc-media-artist',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._artist.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        metadata.add_child(this._title);
        metadata.add_child(this._artist);
        this.add_child(header);
        this.add_child(metadata);
        this._buttons = new Map();

        const controls = new St.BoxLayout({
            style_class: 'lintel-cc-media-controls',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        const actions = [
            ['backward', _('Previous'), 'previous'],
            ['play', _('Play'), 'play-pause'],
            ['forward', _('Next'), 'next'],
        ];
        for (const [name, label, signal] of actions) {
            const icon = new St.Icon({
                gicon: transportIcon(name),
                style_class: 'lintel-cc-media-control',
            });
            if (signal === 'play-pause')
                this._playIcon = icon;
            const button = new St.Button({
                style_class: signal === 'play-pause'
                    ? 'lintel-cc-media-button lintel-cc-media-play'
                    : 'lintel-cc-media-button',
                accessible_name: label,
                can_focus: true,
                x_expand: true,
                child: icon,
            });
            button.connect('clicked', () => this.emit(signal));
            this._buttons.set(signal, button);
            controls.add_child(button);
        }
        this.add_child(controls);
    }

    setTrack(title, artist, artUrl, playing, capabilities = null) {
        this._title.text = title || _('Not Playing');
        // Read the argument, not the label back: an emptied St.Label reports
        // `text` as null, which threw here and aborted the rest of _sync().
        this._artist.text = artist || '';
        this._artist.visible = Boolean(artist);
        if (this._playing !== playing) {
            this._playing = playing;
            this._playIcon.gicon = transportIcon(playing ? 'pause' : 'play');
        }
        this._buttons.get('play-pause').accessible_name = playing ? _('Pause') : _('Play');
        if (capabilities) {
            for (const [signal, allowed] of Object.entries(capabilities)) {
                const button = this._buttons.get(signal);
                button.reactive = allowed;
                button.can_focus = allowed;
                button.opacity = allowed ? 255 : 90;
            }
        }

        if (artUrl === this._artUrl)
            return;
        this._artUrl = artUrl;
        if (artUrl) {
            this._artwork.gicon = new Gio.FileIcon({file: Gio.File.new_for_uri(artUrl)});
            return;
        }
        this._artwork.gicon = null;
        this._artwork.setSymbol('audio-x-generic-symbolic');
    }
});

/**
 * A labelled Tahoe slider card. The leading glyph can be a real button (volume
 * uses it for mute), while the optional trailing glyph is the maximum-value
 * indicator. Output selection is intentionally not faked without a backend.
 */
export const CCSlider = GObject.registerClass({
    Signals: {
        'moved': {param_types: [GObject.TYPE_DOUBLE]},
        'icon-clicked': {},
        'output-clicked': {},
    },
}, class CCSlider extends St.BoxLayout {
    _init(title, iconName, trailingIconName = '', iconClickable = false) {
        super._init({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lintel-cc-slider',
            accessible_name: title,
            x_expand: true,
        });

        this._block = false;
        this._iconClickable = iconClickable;
        this.add_child(new St.Label({
            text: title,
            style_class: 'lintel-cc-slider-title',
        }));

        const row = new St.BoxLayout({
            style_class: 'lintel-cc-slider-row',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._icon = new ControlIcon({
            icon_name: iconName,
            style_class: 'lintel-cc-slider-icon',
        });
        this._iconButton = new St.Button({
            style_class: 'lintel-cc-slider-icon-button',
            accessible_name: iconClickable ? _('Toggle %s').format(title) : title,
            can_focus: iconClickable,
            reactive: iconClickable,
            child: this._icon,
        });
        this._iconButton.connect('clicked', () => this.emit('icon-clicked'));
        row.add_child(this._iconButton);

        this._slider = new Slider.Slider(0);
        this._slider.add_style_class_name('lintel-cc-track');
        this._slider.accessible_name = _('%s level').format(title);
        this._slider.x_expand = true;
        this._slider.connect('notify::value', () => {
            if (!this._block)
                this.emit('moved', this._slider.value);
        });
        row.add_child(this._slider);

        if (trailingIconName) {
            row.add_child(new ControlIcon({
                icon_name: trailingIconName,
                style_class: 'lintel-cc-slider-trailing-icon',
            }));
        }
        if (title === _('Sound')) {
            this._outputButton = new St.Button({
                style_class: 'lintel-cc-output-button',
                accessible_name: '选择声音输出设备',
                can_focus: true,
                child: new St.Icon({icon_name: 'pan-up-symbolic', icon_size: 16}),
            });
            this._outputButton.connect('clicked', () => this.emit('output-clicked'));
            row.add_child(this._outputButton);
        }
        this.add_child(row);
    }

    setValue(fraction) {
        this._block = true;
        this._slider.value = Math.max(0, Math.min(1, fraction));
        this._block = false;
    }

    setIcon(name) {
        this._icon.setSymbol(name);
    }

    setAvailable(available) {
        this._slider.reactive = available;
        this._iconButton.reactive = available && this._iconClickable;
        this._iconButton.can_focus = available && this._iconClickable;
        this.opacity = available ? 255 : 150;
    }
});
