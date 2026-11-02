// SPDX-License-Identifier: GPL-3.0-or-later
//
// 插入电源时弹层里的充电动画：细环形进度、沿环流动的流光、柔和辉光与闪电呼吸。
// 档位越高，流光越快、越多。本文件不依赖 GNOME Shell。
import Cairo from 'cairo';

export const SIZE = 200;

const CENTER = SIZE / 2;
const RADIUS = 76;
const THICKNESS = 7;
const START = -Math.PI / 2;
const SPEED = [1, 1.6, 2.4];
const COMETS = [1, 1, 2];
const COMET_SECONDS = 2.4;
const COMET_TAIL = Math.PI * 0.5;
const FILL_SECONDS = 1.2;
const RIPPLE_SECONDS = 1.5;
const TAIL_COLOR = [0.10, 0.72, 0.36];
const HEAD_COLOR = [0.55, 0.98, 0.70];
const LIGHT_COLOR = [0.86, 1, 0.92];
const BOLT = [[6, -24], [-12, 4], [-2, 4], [-6, 24], [13, -6], [2, -6]];

const easeOutExpo = progress => progress >= 1 ? 1 : 1 - 2 ** (-10 * progress);
const mix = (from, to, amount) => from.map((value, index) => value + (to[index] - value) * amount);

function arc(cr, from, to, radius = RADIUS) {
    cr.newPath();
    cr.arc(CENTER, CENTER, radius, from, to);
}

function glowAt(cr, angle, radius, alpha, color) {
    const x = CENTER + RADIUS * Math.cos(angle);
    const y = CENTER + RADIUS * Math.sin(angle);
    const glow = new Cairo.RadialGradient(x, y, 0, x, y, radius);
    glow.addColorStopRGBA(0, ...color, alpha);
    glow.addColorStopRGBA(1, ...color, 0);
    cr.setSource(glow);
    cr.arc(x, y, radius, 0, 2 * Math.PI);
    cr.fill();
}

function drawRipples(cr, time) {
    for (let index = 0; index < 2; index++) {
        const age = time - 0.1 - 0.55 * index;
        if (age < 0 || age > RIPPLE_SECONDS)
            continue;
        const progress = age / RIPPLE_SECONDS;
        cr.setSourceRGBA(...HEAD_COLOR, 0.4 * (1 - progress) ** 2);
        cr.setLineWidth(1.2);
        arc(cr, 0, 2 * Math.PI, RADIUS + 4 + 20 * easeOutExpo(progress));
        cr.stroke();
    }
}

function drawProgress(cr, sweep) {
    cr.setLineCap(Cairo.LineCap.ROUND);
    cr.setLineWidth(THICKNESS + 11);
    cr.setSourceRGBA(...mix(TAIL_COLOR, HEAD_COLOR, 0.5), 0.1);
    arc(cr, START, START + sweep);
    cr.stroke();
    cr.setLineWidth(THICKNESS + 5);
    cr.setSourceRGBA(...mix(TAIL_COLOR, HEAD_COLOR, 0.5), 0.14);
    arc(cr, START, START + sweep);
    cr.stroke();

    cr.setLineCap(Cairo.LineCap.BUTT);
    cr.setLineWidth(THICKNESS);
    const segments = Math.max(2, Math.ceil(sweep / (Math.PI / 90)));
    for (let index = 0; index < segments; index++) {
        const from = START + sweep * index / segments;
        const to = START + sweep * (index + 1) / segments;
        cr.setSourceRGB(...mix(TAIL_COLOR, HEAD_COLOR, (index + 0.5) / segments));
        arc(cr, from, to + 0.012);
        cr.stroke();
    }
    cr.setSourceRGB(...TAIL_COLOR);
    cr.arc(CENTER + RADIUS * Math.cos(START), CENTER + RADIUS * Math.sin(START), THICKNESS / 2, 0, 2 * Math.PI);
    cr.fill();
    cr.setSourceRGB(...HEAD_COLOR);
    const end = START + sweep;
    cr.arc(CENTER + RADIUS * Math.cos(end), CENTER + RADIUS * Math.sin(end), THICKNESS / 2, 0, 2 * Math.PI);
    cr.fill();
}

function drawComets(cr, sweep, tier, time) {
    if (sweep < 0.2)
        return;
    const length = Math.min(sweep, COMET_TAIL);
    for (let comet = 0; comet < COMETS[tier]; comet++) {
        const cycle = (time * SPEED[tier] / COMET_SECONDS + comet / COMETS[tier]) % 1;
        const head = START + sweep * cycle;
        const steps = 72;
        cr.setLineCap(Cairo.LineCap.BUTT);
        for (let step = 0; step < steps; step++) {
            const from = head - length * (1 - step / steps);
            const to = head - length * (1 - (step + 1) / steps);
            if (from < START)
                continue;
            const along = (step + 1) / steps;
            cr.setLineWidth(THICKNESS * (0.5 + 0.5 * along));
            cr.setSourceRGBA(...LIGHT_COLOR, 0.8 * along ** 2.2);
            arc(cr, from, to + 0.002);
            cr.stroke();
        }
        glowAt(cr, head, 12, 0.55, LIGHT_COLOR);
    }
}

function drawHalo(cr, tier, time) {
    for (let index = 0; index < tier; index++) {
        const breath = 0.5 + 0.5 * Math.sin(time * SPEED[tier] * 1.9 - index * 1.4);
        cr.setSourceRGBA(...HEAD_COLOR, 0.04 + 0.1 * breath);
        cr.setLineWidth(1);
        arc(cr, 0, 2 * Math.PI, RADIUS + 11 + 7 * index);
        cr.stroke();
    }
}

function drawBolt(cr, color, tier, time) {
    const [red, green, blue, alpha] = color;
    const breath = 0.5 + 0.5 * Math.sin(time * SPEED[tier] * 2.2);
    const glow = new Cairo.RadialGradient(CENTER, CENTER, 0, CENTER, CENTER, 52);
    glow.addColorStopRGBA(0, ...HEAD_COLOR, 0.12 + 0.12 * breath);
    glow.addColorStopRGBA(1, ...HEAD_COLOR, 0);
    cr.setSource(glow);
    cr.arc(CENTER, CENTER, 52, 0, 2 * Math.PI);
    cr.fill();

    const appear = easeOutExpo(Math.min(1, Math.max(0, time - 0.15) / 0.6));
    const scale = 0.8 + 0.2 * appear;
    cr.save();
    cr.translate(CENTER, CENTER);
    cr.scale(scale, scale);
    BOLT.forEach(([x, y], index) => index ? cr.lineTo(x, y) : cr.moveTo(x, y));
    cr.closePath();
    cr.setLineJoin(Cairo.LineJoin.ROUND);
    cr.setLineWidth(3);
    cr.setSourceRGBA(red, green, blue, alpha * appear);
    cr.strokePreserve();
    cr.fill();
    cr.restore();
}

// state：percentage 为 0～100，tier 为 0～2，time 为弹层出现后的秒数；color 为 [r, g, b, a]（0～1）
export function paint(cr, state, color) {
    const {percentage, tier, time} = state;
    const [red, green, blue, alpha] = color;
    const level = Math.max(0, Math.min(100, percentage)) / 100 * easeOutExpo(Math.min(1, time / FILL_SECONDS));
    const sweep = 2 * Math.PI * level;

    drawRipples(cr, time);
    drawHalo(cr, tier, time);

    cr.setLineWidth(THICKNESS);
    cr.setSourceRGBA(red, green, blue, alpha * 0.14);
    arc(cr, 0, 2 * Math.PI);
    cr.stroke();

    if (sweep > 0.02) {
        drawProgress(cr, sweep);
        drawComets(cr, sweep, tier, time);
        glowAt(cr, START + sweep, 16, 0.45, HEAD_COLOR);
    }
    drawBolt(cr, color, tier, time);
}
