import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class CalendarButton {
    constructor(control, center) {
        this.actor = control.menu.actor;
        this.manager = Main.panel.menuManager;
        this.control = control;
        this.center = center;
        this.muteGesture = control.menu._boxPointer._muteInput;
        this.muteId = this.muteGesture.connect('should-handle-sequence',
            (_gesture, event) => !this.accepts(event));
        this.gesture = this.manager._clickGesture;
        this.prepareId = this.gesture.connect('may-recognize', gesture => {
            this.activateDate = this.accepts(gesture.get_point_event(0));
            return true;
        });
        this.recognizeId = this.gesture.connect('recognize', () => {
            const activateDate = this.activateDate;
            this.activateDate = false;
            if (activateDate)
                center.open();
        });
    }

    accepts(event) {
        if (Main.modalActorFocusStack.at(-1)?.actor !== this.actor || !this.control.menu.isOpen)
            return false;
        const type = event.type();
        if (type !== Clutter.EventType.TOUCH_BEGIN
            && (type !== Clutter.EventType.BUTTON_PRESS || event.get_button() !== 1))
            return false;
        const date = this.center._hookedDateMenu;
        if (!this.center._enabled || !date?.mapped || !date.reactive)
            return false;
        const [stageX, stageY] = event.get_coords();
        const [valid, x, y] = date.transform_stage_point(stageX, stageY);
        return valid && x >= 0 && y >= 0 && x < date.width && y < date.height;
    }

    destroy() {
        if (!this.actor)
            return;
        this.gesture.disconnect(this.prepareId);
        this.gesture.disconnect(this.recognizeId);
        this.muteGesture.disconnect(this.muteId);
        this.activateDate = false;
        this.actor = null;
    }
}

export class CalendarMenuRedirect {
    constructor(menu) {
        this.menu = menu;
        this.descriptor = Object.getOwnPropertyDescriptor(menu, 'open');
        menu.close({animate: false});
        menu.actor.remove_all_transitions();
        menu.actor.hide();
        this.open = () => false;
        menu.open = this.open;
    }

    destroy() {
        if (this.menu.open !== this.open)
            return;
        if (this.descriptor)
            Object.defineProperty(this.menu, 'open', this.descriptor);
        else
            delete this.menu.open;
    }
}
