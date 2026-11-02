// SPDX-License-Identifier: GPL-3.0-or-later
//
// 菜单栏电池图形的 Cairo 绘制，坐标系为 26×14。本文件不依赖 GNOME Shell，
// 离线渲染测试与真实菜单栏使用同一份绘制代码。
import Cairo from 'cairo';

export const WIDTH = 26;
export const HEIGHT = 14;

const FILL_X = 2.9;
const FILL_Y = 3.4;
const FILL_WIDTH = 17.7;
const FILL_HEIGHT = 7.2;
const FLOW_STEPS = 32;
const FLOW_BASE_ALPHA = 0.68;
// 按档位给出亮带波长（像素）与扫过一个波长所需秒数
const FLOW = [
    {wavelength: 17.7, period: 2.0},
    {wavelength: 11.8, period: 1.4},
    {wavelength: 8.85, period: 0.9},
];

export function roundedRect(cr, x, y, width, height, radius) {
    cr.newSubPath();
    cr.arc(x + width - radius, y + radius, radius, -Math.PI / 2, 0);
    cr.arc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2);
    cr.arc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI);
    cr.arc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5);
    cr.closePath();
}

function flowGradient(color, flow, time) {
    const [red, green, blue, alpha] = color;
    const gradient = new Cairo.LinearGradient(FILL_X, 0, FILL_X + FILL_WIDTH, 0);
    for (let step = 0; step <= FLOW_STEPS; step++) {
        const x = FILL_WIDTH * step / FLOW_STEPS;
        const along = x / flow.wavelength - time / flow.period;
        const crest = 0.5 - 0.5 * Math.cos(2 * Math.PI * along);
        gradient.addColorStopRGBA(step / FLOW_STEPS, red, green, blue,
            alpha * (FLOW_BASE_ALPHA + (1 - FLOW_BASE_ALPHA) * crest));
    }
    return gradient;
}

// state.time 为秒数时电量填充上有亮带从左向右流动，档位越高流动越快；为 null 时静止绘制
export function paintBattery(cr, state, color) {
    const [red, green, blue, alpha] = color;
    const foreground = () => cr.setSourceRGBA(red, green, blue, alpha);
    foreground();
    cr.setLineWidth(1.7);
    roundedRect(cr, 1, 1.5, 21.5, 11, 2.7);
    cr.stroke();
    roundedRect(cr, 24, 4.5, 1.7, 5, 0.8);
    cr.fill();
    const fillWidth = FILL_WIDTH * Math.max(0, Math.min(100, state.percentage)) / 100;
    if (fillWidth > 0) {
        roundedRect(cr, FILL_X, FILL_Y, fillWidth, FILL_HEIGHT, Math.min(1.1, fillWidth / 2));
        if (state.time === null) {
            cr.fill();
        } else {
            cr.setSource(flowGradient(color, FLOW[state.tier], state.time));
            cr.fill();
        }
    }
    if (state.bolt) {
        const bolt = () => {
            cr.moveTo(13.5, 2.2);
            cr.lineTo(8.7, 7.6);
            cr.lineTo(11.5, 7.6);
            cr.lineTo(10.6, 11.8);
            cr.lineTo(15.5, 6.1);
            cr.lineTo(12.6, 6.1);
            cr.closePath();
        };
        bolt();
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.setLineWidth(2);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        cr.strokePreserve();
        cr.fill();
        cr.setOperator(Cairo.Operator.OVER);
        foreground();
        bolt();
        cr.fill();
    }
}
