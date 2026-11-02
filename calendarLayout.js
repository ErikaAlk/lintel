import Clutter from 'gi://Clutter';

export function centerCalendarNumbers(card) {
    const walk = actor => {
        if (actor.has_style_class_name?.('lintel-nc-calendar-day-number')) {
            actor.x_align = Clutter.ActorAlign.CENTER;
            actor.y_align = Clutter.ActorAlign.CENTER;
            const text = actor.clutter_text;
            const align = () => {
                if (!actor.mapped || actor.width <= 0 || actor.height <= 0)
                    return;
                const [ink] = text.get_layout().get_pixel_extents();
                const scale = text.get_resource_scale();
                const [offsetX, offsetY] = text.get_layout_offsets();
                const disc = actor.get_parent();
                text.translation_x = disc.width / 2 - actor.x - text.x
                    - offsetX - (ink.x + ink.width / 2) / scale;
                text.translation_y = disc.height / 2 - actor.y - text.y
                    - offsetY - (ink.y + ink.height / 2) / scale;
            };
            actor.connectObject('notify::allocation', align, 'notify::mapped', align,
                'style-changed', align, card);
            align();
        }
        actor.get_children().forEach(walk);
    };
    walk(card);
}
