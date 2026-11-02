// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {AppMenuRegistrar, DbusMenuSource, GtkMenuSource} from './menuSources.js';
import {CascadeController, CascadeMenuItem} from './cascade.js';

const MenuButton = GObject.registerClass(class ErhaiMenuButton extends PanelMenu.Button {
    _init(label, bold = false) {
        super._init(0, label, false);
        this.add_child(new St.Label({text: label, y_align: Clutter.ActorAlign.CENTER,
            style_class: bold ? 'lintel-active-app' : ''}));
        this.menu.actor.add_style_class_name('lintel-system-menu');
        this.menu.box.add_style_class_name('lintel-system-menu-content');
        this.cascade = new CascadeController(this.menu);
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                this.refresh?.();
                this.definition?.aboutToShow?.();
            }
        });
    }

    destroy() {
        this.cascade.destroy();
        super.destroy();
    }
});

function populate(menu, items, cascade, level = 0) {
    const visible = items.filter(item => item.visible !== false);
    const shape = JSON.stringify(visible.map(item => [item.label, !!item.separator, !!item.children]));
    if (shape === menu._erhaiShape) {
        menu._getMenuItems().forEach((row, index) => {
            const item = visible[index];
            row.definition = item;
            if (!item.separator) {
                row.setSensitive(item.enabled !== false && (!!item.children || !!item.activate));
                if (item.children)
                    populate(row.submenu, item.children, cascade, level + 1);
                else
                    row.setOrnament(item.checked ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
            }
        });
        return;
    }
    cascade.closeFrom(level);
    menu.removeAll();
    menu._erhaiShape = shape;
    for (const item of visible) {
        if (item.separator) {
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            continue;
        }
        if (item.children) {
            const row = new CascadeMenuItem(item.label, cascade, level);
            row.submenu.actor.add_style_class_name('lintel-system-menu');
            row.submenu.box.add_style_class_name('lintel-system-menu-content');
            row.add_style_class_name('lintel-system-menu-item');
            row.definition = item;
            populate(row.submenu, item.children, cascade, level + 1);
            row.setSensitive(item.enabled !== false);
            row.onAboutToShow = () => row.definition.aboutToShow?.();
            menu.addMenuItem(row);
            continue;
        }
        const row = new PopupMenu.PopupMenuItem(item.label, {style_class: 'lintel-system-menu-item'});
        row.definition = item;
        row.label.x_expand = true;
        if (item.accel)
            row.add_child(new St.Label({text: item.accel.replaceAll('⌘', 'Ctrl+').replaceAll('⌃', 'Super+'),
                y_align: Clutter.ActorAlign.CENTER}));
        if (item.toggle)
            row.setOrnament(item.checked ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        row.setSensitive(item.enabled !== false && Boolean(item.activate));
        if (item.activate)
            row.connect('activate', () => {
                cascade.closeAll(true);
                row.definition.activate();
            });
        menu.addMenuItem(row);
    }
}

class ActionMenuSource {
    constructor(window, onChanged) {
        const bus = window.get_gtk_unique_bus_name();
        this._groups = [window.get_gtk_application_object_path(), window.get_gtk_window_object_path()]
            .filter(Boolean).map(path => Gio.DBusActionGroup.get(Gio.DBus.session, bus, path));
        this._signals = this._groups.flatMap(group =>
            ['action-added', 'action-removed', 'action-enabled-changed', 'action-state-changed']
                .map(signal => [group, group.connect(signal, onChanged)]));
    }

    onChanged() {}

    getTopLevel() {
        const menus = [
            ['文件', [['new-window', '新建窗口'], ['new-tab', '新建标签页'], ['new-document', '新建文档'],
                ['open', '打开…'], ['save', '保存'], ['save-as', '另存为…'], ['print', '打印…']]],
            ['编辑', [['undo', '撤销'], ['redo', '重做'], ['cut', '剪切'], ['copy', '复制'],
                ['paste', '粘贴'], ['select-all', '全选'], ['find', '查找…'], ['preferences', '设置…']]],
            ['显示', [['zoom-in', '放大'], ['zoom-out', '缩小'], ['zoom-normal', '实际大小'],
                ['show-hidden-files', '显示隐藏文件'], ['fullscreen', '全屏显示']]],
            ['帮助', [['help', '应用帮助'], ['about', '关于应用']]],
        ];
        return menus.map(([label, entries]) => ({label, children: entries.flatMap(([name, title]) => {
            const group = this._groups.find(candidate => candidate.has_action(name));
            if (!group || group.get_action_parameter_type(name) !== null)
                return [];
            const state = group.get_action_state(name);
            const booleanState = state?.get_type_string() === 'b';
            return [{label: title, enabled: group.get_action_enabled(name),
                toggle: booleanState ? 'check' : null, checked: booleanState && state.unpack(),
                activate: () => booleanState
                    ? group.change_action_state(name, new GLib.Variant('b', !group.get_action_state(name).unpack()))
                    : group.activate_action(name, null)}];
        })})).filter(menu => menu.children.length > 0);
    }

    destroy() {
        for (const [group, id] of this._signals)
            group.disconnect(id);
        this._signals = [];
    }
}

export class ErhaiAppMenus {
    constructor() {
        this._buttons = [];
        this._source = null;
        this._window = null;
        this._idle = 0;
        this._registrar = new AppMenuRegistrar(() => this._queue());
        this._tracker = Shell.WindowTracker.get_default();
        this._focusId = global.display.connect('notify::focus-window', () => this._queue());
        this._appId = this._tracker.connect('notify::focus-app', () => this._queue());
        this._update();
    }

    _queue() {
        if (this._idle)
            return;
        this._idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idle = 0;
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    placeAfter(actor) {
        const box = Main.panel._leftBox;
        let index = box.get_children().indexOf(actor) + 1;
        for (const button of this._buttons)
            box.set_child_at_index(button.container, index++);
    }

    _add(label, items, bold = false, definition = null) {
        const index = this._position++;
        let button = this._buttons[index];
        if (button?.accessible_name !== label) {
            button?.destroy();
            button = new MenuButton(label, bold);
            Main.panel.addToStatusArea(`erhai-appmenu-${index}`, button, index + 1, 'left');
            this._buttons[index] = button;
        }
        button.definition = definition;
        button.refresh = () => this._queue();
        populate(button.menu, items, button.cascade);
        return button;
    }

    _update() {
        const window = global.display.focus_window;
        const app = this._tracker.focus_app;
        if (window !== this._window) {
            this._source?.destroy();
            this._source = null;
            this._window = window;
        }
        if (window && !this._source) {
            if (GtkMenuSource.supports(window)) {
                this._source = new GtkMenuSource(window);
                for (const group of Object.values(this._source._groups).filter(Boolean)) {
                    for (const signal of ['action-added', 'action-enabled-changed', 'action-state-changed', 'action-removed'])
                        this._source._groupIds.push([group, group.connect(signal, () => this._queue())]);
                }
            } else {
                const entry = this._registrar.lookup(window);
                if (entry)
                    this._source = new DbusMenuSource(entry.service, entry.path);
                else if (window.get_gtk_unique_bus_name())
                    this._source = new ActionMenuSource(window, () => this._queue());
            }
            this._source?.onChanged(() => this._queue());
        }
        this._position = 0;
        const appItems = app ? [
            {label: '新建窗口', enabled: app.can_open_new_window(), activate: () => app.open_new_window(-1)},
            {separator: true},
            {label: `退出 ${app.get_name()}`, activate: () => app.request_quit()},
        ] : [
            {label: '打开文件', activate: () => Gio.AppInfo.launch_default_for_uri(
                Gio.File.new_for_path(GLib.get_home_dir()).get_uri(), global.create_app_launch_context(0, -1))},
        ];
        this._add(app?.get_name() || '桌面', appItems, true);
        for (const item of this._source?.getTopLevel() ?? []) {
            if (item.visible !== false && item.children)
                this._add(item.label, item.children, false, item);
        }
        if (window) {
            this._add('窗口', [
                {label: '最小化', enabled: window.can_minimize(), activate: () => window.minimize()},
                {label: window.is_maximized() ? '还原窗口' : '缩放窗口', enabled: window.can_maximize(),
                    activate: () => window.is_maximized() ? window.unmaximize() : window.maximize()},
                {separator: true},
                {label: '关闭窗口', activate: () => window.delete(global.get_current_time())},
                {separator: true},
                ...global.get_window_actors().map(actor => actor.meta_window)
                    .filter(other => !other.skip_taskbar)
                    .map(other => ({label: other.get_title(), toggle: 'check', checked: other === window,
                        activate: () => Main.activateWindow(other)})),
            ]);
        }
        for (const button of this._buttons.splice(this._position))
            button.destroy();
    }

    destroy() {
        if (this._idle)
            GLib.Source.remove(this._idle);
        global.display.disconnect(this._focusId);
        this._tracker.disconnect(this._appId);
        this._source?.destroy();
        this._registrar.destroy();
        for (const button of this._buttons)
            button.destroy();
        this._buttons = [];
    }
}
