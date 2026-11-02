// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {CascadeController, CascadeMenuItem} from './cascade.js';
import {PanelController} from './src/panelController.js';
import {ExternalIndicators} from './src/externalIndicators.js';
import {PanelAdapter} from './src/compat/panelAdapter.js';
import {ErhaiAppMenus} from './erhaiMenus.js';
import {ControlIcon, controlGIcon} from './src/widgets/controlIcons.js';
import {CalendarButton, CalendarMenuRedirect} from './calendarMenuRedirect.js';
import {centerCalendarNumbers} from './calendarLayout.js';
import {_} from './src/i18n.js';

const REPLACED_FIELDS = ['_network', '_system', '_volumeOutput', '_bluetooth'];

class PrivacyIndicators extends ExternalIndicators {
    constructor() {
        super();
        this._privacy = new Map();
    }

    _track(child) {
        if (!REPLACED_FIELDS.some(field => PanelAdapter.quickSettings[field] === child)) {
            if (!this._privacy.has(child))
                this._privacy.set(child, child.connect('notify::visible', () => this._queueSync()));
            return;
        }
        super._track(child);
    }

    _onChildRemoved(child) {
        if (this._privacy.has(child)) {
            child.disconnect(this._privacy.get(child));
            this._privacy.delete(child);
        }
        super._onChildRemoved(child);
    }

    _sync() {
        super._sync();
        if ([...this._privacy.keys()].some(actor => actor.visible))
            PanelAdapter.containerOf(PanelAdapter.quickSettings).show();
    }

    _teardown() {
        for (const [actor, id] of this._privacy)
            actor.disconnect(id);
        this._privacy.clear();
        super._teardown();
    }
}

export class ErhaiPanelController extends PanelController {
    constructor(extension) {
        super(extension);
        this._externalIndicators = new PrivacyIndicators();
        this._appMenus = null;
        this._quitDialog = null;
    }

    _addActiveApp() {
        if (!this._appMenus && this._extension.getSettings().get_boolean('show-active-app'))
            this._appMenus = new ErhaiAppMenus();
    }

    _removeActiveApp() {
        this._appMenus?.destroy();
        this._appMenus = null;
    }

    _ensureLeftOrder() {
        super._ensureLeftOrder();
        this._appMenus?.placeAfter(this._systemMenu?.container);
    }

    _addSystemMenu() {
        super._addSystemMenu();
        if (!this._systemMenu)
            return;
        for (const item of this._systemMenu.menu._getMenuItems()) {
            const icon = item._icon;
            if (!icon?.icon_name)
                continue;
            const file = this._extension.dir.get_child('icons').get_child('bold')
                .get_child(`${icon.icon_name}.svg`);
            if (file.query_exists(null))
                icon.gicon = new Gio.FileIcon({file});
        }
        this._systemMenu._forceQuitFocused = () => this._confirmForceQuit();
        if (!this._systemMenu._erhaiCascade) {
            const menu = this._systemMenu.menu;
            const recent = menu._getMenuItems().find(row => row.label?.text === _('Recent Items'));
            const position = menu._getMenuItems().indexOf(recent);
            recent.destroy();
            const cascade = new CascadeController(menu);
            this._systemMenu._erhaiCascade = cascade;
            const row = new CascadeMenuItem('最近使用的项目', cascade, 0);
            row.add_style_class_name('lintel-system-menu-item');
            row.submenu.actor.add_style_class_name('lintel-system-menu');
            row.submenu.box.add_style_class_name('lintel-system-menu-content');
            const openRecent = new PopupMenu.PopupMenuItem('打开最近使用的项目…', {
                style_class: 'lintel-system-menu-item',
            });
            openRecent.connect('activate', () => {
                cascade.closeAll(true);
                Gio.AppInfo.launch_default_for_uri('recent:///', global.create_app_launch_context(0, -1));
            });
            row.submenu.addMenuItem(openRecent);
            menu.addMenuItem(row, position);
        }
        if (!Gio.AppInfo.get_default_for_uri_scheme('appstream')) {
            const item = this._systemMenu.menu._getMenuItems().find(row => row.label?.text === _('App Center…'));
            item?.destroy();
        }
    }

    _removeSystemMenu() {
        this._systemMenu?._erhaiCascade?.destroy();
        if (this._systemMenu)
            this._systemMenu._erhaiCascade = null;
        super._removeSystemMenu();
    }

    _addControlCenter() {
        super._addControlCenter();
        if (!this._controlCenter)
            return;
        this._controlCenter._airDropTile.setTitle('附近共享');
        this._controlCenter._controls.get('airdrop').title = '附近共享';
    }

    _addStatusMenus() {
        super._addStatusMenus();
        const menu = this._wifiMenu;
        if (!menu || menu._erhaiIcons)
            return;
        menu._erhaiIcons = true;
        const original = menu._panelIcon;
        menu._panelIcon = new ControlIcon({
            style_class: 'system-status-icon',
            icon_name: menu._wifi.iconName,
            y_align: Clutter.ActorAlign.CENTER,
        });
        menu.replace_child(original, menu._panelIcon);
        original.destroy();
        const rebuild = menu._rebuildNetworks.bind(menu);
        menu._rebuildNetworks = () => {
            rebuild();
            for (const row of menu._networksSection._getMenuItems()) {
                if (row._icon)
                    row._icon.gicon = controlGIcon(row._icon.icon_name);
            }
        };
        menu._sync();
    }

    _addNotificationCenter() {
        super._addNotificationCenter();
        const center = this._notificationCenter;
        if (!center || center._erhaiGeometry)
            return;
        center._erhaiGeometry = true;
        center._removeNativeMenuRedirect();
        let redirect = null;
        center._removeNativeMenuRedirect = () => {
            redirect?.destroy();
            redirect = null;
        };
        center._installNativeMenuRedirect = () => {
            center._removeNativeMenuRedirect();
            const menu = center._hookedDateMenu?.menu;
            if (menu)
                redirect = new CalendarMenuRedirect(menu);
        };
        center._installNativeMenuRedirect();
        if (this._controlCenter) {
            center._erhaiCalendarButton = new CalendarButton(this._controlCenter, center);
            center._root.connect('destroy', () => center._erhaiCalendarButton.destroy());
        }
        const createSlot = center._newWidgetSlot.bind(center);
        center._newWidgetSlot = (id, order, size) => {
            const slot = createSlot(id, order, size);
            slot.y_expand = false;
            slot.y_align = Clutter.ActorAlign.START;
            slot.height = id === 'calendar' ? -1 : size === 'large' ? 345 : 165;
            slot._lintelWidget.y_expand = false;
            if (id === 'calendar') {
                const card = slot._lintelWidget;
                const dateKey = () => [GLib.DateTime.new_now_local().format('%F'),
                    Shell.util_get_week_start(), GLib.get_language_names().join(',')].join(':');
                let renderedDate = dateKey();
                const refresh = card.refresh.bind(card);
                centerCalendarNumbers(card);
                card.refresh = () => {
                    const currentDate = dateKey();
                    if (renderedDate === currentDate && card.get_child())
                        return;
                    refresh();
                    centerCalendarNumbers(card);
                    renderedDate = currentDate;
                };
            }
            if (id === 'calendar' && size === 'large') {
                const card = slot._lintelWidget;
                let resizing = false;
                const resize = () => {
                    if (resizing || !card.get_stage() || !card.get_child())
                        return;
                    resizing = true;
                    const node = card.get_theme_node();
                    const side = value => node.get_padding(value) + node.get_border_width(value);
                    const width = 345 - side(St.Side.LEFT) - side(St.Side.RIGHT);
                    const height = card.get_child().get_preferred_height(width)[1]
                        + side(St.Side.TOP) + side(St.Side.BOTTOM);
                    card.height = height;
                    slot.height = height;
                    resizing = false;
                };
                card.connectObject('notify::mapped', resize, 'notify::child', resize,
                    'style-changed', resize, slot);
            }
            return slot;
        };
        center._column.y_expand = false;
        center._column.y_align = Clutter.ActorAlign.START;
        center._widgetsBox.y_expand = false;
        const position = center._position.bind(center);
        center._position = () => {
            position();
            const monitor = Main.layoutManager.primaryMonitor;
            if (!monitor)
                return;
            const naturalHeight = center._column.get_preferred_height(345)[1];
            center._columnScroll.height = Math.min(naturalHeight, monitor.height - 65);
        };
        center._widgetsBox.connectObject('notify::height', () => center._position(), center._root);
        center._rebuildWidgets();
    }

    _confirmForceQuit() {
        const window = global.display.focus_window;
        if (!window || this._quitDialog)
            return;
        const dialog = new ModalDialog.ModalDialog();
        this._quitDialog = dialog;
        dialog.contentLayout.add_child(new Dialog.MessageDialogContent({
            title: '强制退出应用？',
            description: `“${window.get_title()}”中未保存的更改将会丢失。`,
        }));
        dialog.setButtons([
            {label: '取消', key: Clutter.KEY_Escape, default: true, action: () => dialog.close()},
            {label: '强制退出', action: () => {
                if (global.get_window_actors().some(actor => actor.meta_window === window))
                    window.kill();
                dialog.close();
            }},
        ]);
        dialog.connect('destroy', () => { this._quitDialog = null; });
        dialog.open(global.get_current_time());
    }

    destroy() {
        this._quitDialog?.destroy();
        this._quitDialog = null;
        super.destroy();
    }
}
