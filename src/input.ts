// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

import { $ } from "./utils.js";

// This class is used from xsystem4/src/hll/InputString.c. To handle text input
// with IME, this creates a transparent input element on the canvas.
// The visible <input> only shows the in-progress IME composition; committed
// text is moved to an internal buffer as games draw the text themselves.
export class InputString {
    private input: HTMLInputElement;
    private buffer = '';
    // Non-IME text the browser natively inserted into <input> and we have
    // already moved into `buffer` via the 'input' event. SDL also delivers
    // the same characters via addText() on most desktop browsers, so addText()
    // dedupes against this queue to avoid double-insertion.
    private pendingNativeInput = '';
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
        this.input.addEventListener('compositionend', (e: CompositionEvent) => {
            this.buffer += e.data ?? '';
            this.input.value = '';
            // Browser generates a keyup event after compositionend event.
            // Let xsystem4 ignore it.
            setTimeout(() => {
                this.compositing = false;
            }, 10);
        });
        this.input.addEventListener('input', (e: Event) => {
            // The browser natively inserts non-IME characters into the focused
            // <input>. Modern browsers don't honor SDL's keypress preventDefault
            // (keypress is deprecated), so the inserted text would remain
            // visible on top of whatever the game draws itself. Move it into
            // our buffer and clear the <input> so only the game's rendering
            // is visible.
            const ie = e as InputEvent;
            if (ie.isComposing) return;
            if (this.input.value) {
                const text = this.input.value;
                this.buffer += text;
                this.pendingNativeInput += text;
                this.input.value = '';
            }
        });
        this.input.addEventListener('keydown', (e: KeyboardEvent) => {
            // Mirror the native xsystem4 behavior: Backspace pops one character
            // from the buffer when not composing. (Without this, games like
            // Rance 02 that rely on InputString as their text buffer can't
            // delete characters, since the <input> itself is kept empty.)
            if (e.key === 'Backspace' && !this.compositing && this.buffer.length > 0) {
                this.buffer = this.buffer.slice(0, -1);
            }
        });
    }

    GetResultString() {
        return this.buffer;
    }

    SetResultString(s: string) {
        this.buffer = s;
    }

    SetFont(size: number, name: string, weight: number) {
        this.fontSize = size;
        this.fontWeight = weight;
        this.updateStyle();
    }

    private updateStyle() {
        const scale = this.getCanvasViewport().w / this.getWindowSize().w;
        const sizePx = Math.round(this.fontSize * scale);
        this.input.style.fontSize = sizePx + 'px';
        this.input.style.fontWeight = this.fontWeight.toString();
        this.input.style.height = sizePx + 'px';
        // The <input> only ever shows in-progress IME composition (committed
        // text is moved to our internal buffer). Make it just wide enough to
        // hold a typical composition so it doesn't visually overlap unrelated
        // game UI to its right.
        this.input.style.width = (sizePx * 10) + 'px';
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
    }

    Begin() {
        this.buffer = '';
        this.pendingNativeInput = '';
        this.input.value = '';
    }

    End() {
        this.buffer = '';
        this.pendingNativeInput = '';
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
        // Deduplicate against text already captured via the 'input' event.
        // On platforms where SDL's keypress preventDefault works, only addText
        // is called and pendingNativeInput is empty.
        if (this.pendingNativeInput.startsWith(s)) {
            this.pendingNativeInput = this.pendingNativeInput.slice(s.length);
            return;
        }
        this.buffer += s;
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
