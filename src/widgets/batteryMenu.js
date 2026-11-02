// SPDX-License-Identifier: GPL-2.0-or-later
//
// Independent menu-bar battery status item with its own Tahoe-style popup.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {_} from '../i18n.js';
import {Tier, formatVoltsAmps, formatWatts} from '../chargeTier.js';
import {ChargePowerService} from '../services/chargePower.js';
import {ChargingBattery} from '../services/chargingBattery.js';
import {
    PowerProfilesService,
    powerProfileLabel,
} from '../services/powerProfiles.js';
import {styleStatusMenu} from './statusMenu.js';
import {BatteryGlyph} from './batteryGlyph.js';
import {ChargeToast} from './chargeToast.js';

// 电源协商或接触抖动时 UPower 状态会短暂来回，十秒内不重复弹出充电动画
const TOAST_INTERVAL_US = 10 * 1000000;
// 低于此功率时顶栏不显示读数，避免充电已经停止时显示 0.0 W
const MIN_DISPLAY_WATTS = 0.1;

export const LintelBatteryMenu = GObject.registerClass(
class LintelBatteryMenu extends PanelMenu.Button {
    // supplyRoot 只在测试时传入，指向与 /sys/class/power_supply 结构相同的目录
    _init(supplyRoot) {
        super._init(0.0, _('Battery'), false);
        this.add_style_class_name('lintel-status-button');

        this._battery = new ChargingBattery();
        this._charge = new ChargePowerService(supplyRoot);
        this._profiles = new PowerProfilesService();
        this._batteryChangedId = 0;
        this._chargeChangedId = 0;
        this._profilesChangedId = 0;
        this._profileSignature = '';
        this._pluggedIn = null;
        this._toastedAt = -TOAST_INTERVAL_US;
        this._toast = new ChargeToast();
        Main.uiGroup.add_child(this._toast);

        const indicator = new St.BoxLayout({
            style_class: 'lintel-battery-indicator',
        });
        this._panelPower = new St.Label({
            style_class: 'lintel-battery-power',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._panelIcon = new BatteryGlyph();
        this._panelLabel = new St.Label({
            style_class: 'lintel-battery-percentage',
            y_align: Clutter.ActorAlign.CENTER,
        });
        indicator.add_child(this._panelPower);
        indicator.add_child(this._panelLabel);
        indicator.add_child(this._panelIcon);
        this.add_child(indicator);

        styleStatusMenu(this.menu, 'lintel-battery-menu-content');
        this._buildMenu();

        this._batteryChangedId = this._battery.connect(
            'changed', () => this._sync());
        this._chargeChangedId = this._charge.connect(
            'changed', () => this._sync());
        this._profilesChangedId = this._profiles.connect(
            'changed', () => this._sync());
        this._sync();
    }

    _detailRow(title) {
        const item = new PopupMenu.PopupMenuItem(title, {
            reactive: false,
            can_focus: false,
        });
        item.add_style_class_name('lintel-battery-detail');
        const value = new St.Label({
            style_class: 'lintel-battery-detail-value',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        item.add_child(value);
        this.menu.addMenuItem(item);
        return {item, value};
    }

    _buildMenu() {
        const summary = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'lintel-battery-summary',
        });
        this._summaryIcon = new BatteryGlyph(52, 28);
        this._summaryIcon.add_style_class_name('lintel-battery-summary-icon');
        summary.add_child(this._summaryIcon);

        const labels = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'lintel-battery-summary-labels',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._summaryPercentage = new St.Label({
            style_class: 'lintel-battery-summary-percentage',
        });
        this._summaryStatus = new St.Label({
            style_class: 'lintel-battery-summary-status',
        });
        this._summaryTime = new St.Label({
            style_class: 'lintel-battery-summary-time',
        });
        labels.add_child(this._summaryPercentage);
        labels.add_child(this._summaryStatus);
        labels.add_child(this._summaryTime);
        summary.add_child(labels);
        this.menu.addMenuItem(summary);

        this._powerSourceItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            can_focus: false,
        });
        this._powerSourceItem.add_style_class_name('lintel-battery-source');
        this.menu.addMenuItem(this._powerSourceItem);

        this._inputPower = this._detailRow(_('Input Power'));
        this._adapter = this._detailRow(_('Adapter'));
        this._intoBattery = this._detailRow(_('Into Battery'));

        this._profileHeading = new PopupMenu.PopupMenuItem(_('Power Mode'), {
            reactive: false,
            can_focus: false,
        });
        this._profileHeading.add_style_class_name('lintel-status-section-title');
        this.menu.addMenuItem(this._profileHeading);

        this._profilesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._profilesSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addSettingsAction(_('Battery Settings…'), 'gnome-power-panel.desktop');
    }

    _tierName(tier) {
        return tier === Tier.SUPER ? _('Super Fast Charging') : _('Fast Charging');
    }

    // 充电中按档位显示快充名称，其余状态沿用 UPower 的状态文字
    _statusText() {
        const tier = this._charge.session.tier;
        if (this._battery.state === 1 && tier !== Tier.NORMAL)
            return this._tierName(tier);
        return this._battery.statusText;
    }

    _toastInfo() {
        const session = this._charge.session;
        const charging = this._battery.state === 1 && session.ready;
        return {
            percentage: this._battery.percentage,
            tier: session.tier,
            tierText: this._statusText(),
            powerText: charging ? formatWatts(session.inputWatts) : '',
        };
    }

    _syncToast(pluggedIn) {
        const wasPluggedIn = this._pluggedIn;
        this._pluggedIn = pluggedIn;
        if (!pluggedIn) {
            this._toast.dismiss();
            return;
        }
        if (wasPluggedIn === false && GLib.get_monotonic_time() - this._toastedAt >= TOAST_INTERVAL_US) {
            this._toastedAt = GLib.get_monotonic_time();
            this._toast.present(this._toastInfo());
        } else {
            this._toast.update(this._toastInfo());
        }
    }

    _syncCharge() {
        const session = this._charge.session;
        const charging = this._battery.state === 1 && session.ready;
        const watts = charging ? session.inputWatts : 0;
        const showPower = charging && watts >= MIN_DISPLAY_WATTS;
        this._panelPower.visible = showPower;
        if (showPower)
            this._panelPower.text = formatWatts(watts);

        this._inputPower.item.visible = showPower;
        this._adapter.item.visible = showPower;
        const batteryWatts = charging ? session.batteryWatts : 0;
        this._intoBattery.item.visible = showPower && batteryWatts >= MIN_DISPLAY_WATTS;
        if (showPower) {
            this._inputPower.value.text = formatWatts(watts);
            this._adapter.value.text = formatVoltsAmps(session.inputVolts, session.inputAmps);
        }
        if (this._intoBattery.item.visible)
            this._intoBattery.value.text = formatWatts(batteryWatts);
        return showPower ? formatWatts(watts) : '';
    }

    _sync() {
        if (!this._battery || !this._profiles)
            return;
        const available = this._battery.available;
        this.visible = available;
        if (!available)
            return;

        const pluggedIn = this._battery.pluggedIn;
        this._charge.setActive(pluggedIn);
        const power = this._syncCharge();
        this._syncToast(pluggedIn);

        const percentage = `${this._battery.percentage}%`;
        const status = this._statusText();
        const time = this._battery.timeText;
        const tier = this._charge.session.tier;
        this._panelIcon.sync(this._battery, tier);
        this._panelLabel.text = percentage;
        this.accessible_name = power
            ? _('Battery, %s, %s, %s').format(percentage, status, power)
            : _('Battery, %s, %s').format(percentage, status);

        this._summaryIcon.sync(this._battery, tier);
        this._summaryPercentage.text = percentage;
        this._summaryStatus.text = status;
        this._summaryTime.text = time;
        this._summaryTime.visible = time.length > 0;
        this._powerSourceItem.label.text = _('Power Source: %s')
            .format(this._battery.powerSourceText);

        const profiles = this._profiles.profiles;
        const profileVisible = this._profiles.available;
        this._profileHeading.visible = profileVisible;
        this._profilesSection.actor.visible = profileVisible;
        const signature = `${profiles.join(',')}|${this._profiles.activeProfile}`;
        if (signature !== this._profileSignature) {
            this._profileSignature = signature;
            this._rebuildProfiles(profiles);
        }
    }

    _rebuildProfiles(profiles) {
        this._profilesSection.removeAll();
        for (const profile of profiles) {
            const item = new PopupMenu.PopupMenuItem(
                powerProfileLabel(profile));
            item.setOrnament(profile === this._profiles.activeProfile
                ? PopupMenu.Ornament.CHECK
                : PopupMenu.Ornament.NONE);
            item.connect('activate', () => {
                this._profiles.setProfile(profile);
                this.menu.close();
            });
            this._profilesSection.addMenuItem(item);
        }
    }

    destroy() {
        if (this._batteryChangedId && this._battery)
            this._battery.disconnect(this._batteryChangedId);
        if (this._chargeChangedId && this._charge)
            this._charge.disconnect(this._chargeChangedId);
        if (this._profilesChangedId && this._profiles)
            this._profiles.disconnect(this._profilesChangedId);
        this._batteryChangedId = 0;
        this._chargeChangedId = 0;
        this._profilesChangedId = 0;
        this._battery?.destroy();
        this._charge?.destroy();
        this._profiles?.destroy();
        this._toast?.destroy();
        this._battery = null;
        this._charge = null;
        this._profiles = null;
        this._toast = null;
        super.destroy();
    }
});
