// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

import { $ } from "./utils.js";

// This class is used from xsystem4/src/hll/InputString.c. To handle text input
// with IME, this creates a transparent input element on the canvas.
export class InputString {
    private input: HTMLInputElement;
    private compositing = false;
    private fontSize = 10;
    private fontWeight = 400;
    private posX = 0;
    private posY = 0;
    private resizeCheckTimer = 0;

    constructor() {
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.id = 'InputString';
        this.input.addEventListener('compositionstart', () => {
            this.compositing = true;
        });
        this.input.addEventListener('compositionend', () => {
            // Browser generates a keyup event after compositionend event.
            // Let xsystem4 ignore it.
            setTimeout(() => {
                this.compositing = false;
            }, 10);
        });
    }

    ClearResultString() {
        this.input.value = '';
    }

    GetResultString() {
        if (this.compositing) {
            return '';
        }
        const s = this.input.value;
        this.input.value = '';
        return s;
    }

    SetFont(size: number, name: string, weight: number) {
        this.fontSize = size;
        this.fontWeight = weight;
        this.updateStyle();
    }

    private updateStyle() {
        const scale = this.getCanvasViewport().w / this.getWindowSize().w;
        const size = Math.round(this.fontSize * scale) + 'px';
        this.input.style.fontSize = size;
        this.input.style.fontWeight = this.fontWeight.toString();
        this.input.style.height = size;
    }

    SetPos(x: number, y: number) {
        this.posX = x;
        this.posY = y;
        this.updatePosition();
    }

    private updatePosition() {
        const w = this.getWindowSize();
        const v = this.getCanvasViewport();
        const wx = this.posX * v.w / w.w + v.x;
        const wy = this.posY * v.h / w.h + v.y;
        const canvas = $('#canvas') as HTMLCanvasElement;
        this.input.style.left = (canvas.offsetLeft + wx) + 'px';
        this.input.style.top = (canvas.offsetTop + wy) + 'px';
        this.input.style.width = (canvas.width - wx) + 'px';
    }

    Begin() {
        this.input.value = '';
    }

    End() {
        this.input.value = '';
    }

    OpenIME() {
        $('#canvas').parentElement!.appendChild(this.input);
        this.input.focus();
        this.resizeCheckTimer = window.setInterval(() => {
            this.updateStyle();
            this.updatePosition();
        }, 100);
    }

    CloseIME() {
        this.input.remove();
        this.compositing = false;
        window.clearInterval(this.resizeCheckTimer);
    }

    addText(s: string) {
        this.input.value += s;
    }

    isCompsiting() {
        return this.compositing;
    }

    private getWindowSize() {
        const m = window.shell.m;
        const size = m._gfx_get_window_size();
        const w = m.HEAP32[(size >> 2) + 0];
        const h = m.HEAP32[(size >> 2) + 1];
        return { w, h };
    }

    private getCanvasViewport() {
        const m = window.shell.m;
        const rect = m._gfx_get_viewport();
        const x = m.HEAP32[(rect >> 2) + 0];
        const y = m.HEAP32[(rect >> 2) + 1];
        const w = m.HEAP32[(rect >> 2) + 2];
        const h = m.HEAP32[(rect >> 2) + 3];
        return { x, y, w, h };
    }
}
