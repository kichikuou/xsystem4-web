// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

import type { ZipFile } from './zip.js';
import { dictionary } from './strings.js';

export const $: (selector: string) => HTMLElement = document.querySelector.bind(document);

export const OPFS_GAMEDIR = 'game';

export function registerErrorHandlers() {
    window.addEventListener('error', (evt: ErrorEvent) => {
        const { message, filename, lineno, colno, error } = evt;
        console.error(error);
        addToast(dictionary.error_occurred + '\n' + message, 'error');
        gtag('event', 'Error', { Message: message, Filename: filename, Lineno: lineno, Colno: colno, Error: error });
    }, { once: true });

    window.addEventListener('unhandledrejection', (evt) => {
        const reason = evt.reason;
        if (reason instanceof Error) {
            let { name, message, stack } = reason;
            addToast(dictionary.error_occurred + '\n' + message, 'error');
            gtag('event', 'UnhandledRejection', { Name: name, Message: message, Stack: stack });
        } else {
            gtag('event', 'UnhandledRejection', { Name: reason.constructor.name, Reason: reason });
        }
    });
}

export function confirm(msg: string) {
    // window.confirm() on iOS Safari pauses the audio context.
    const result = window.confirm(msg);
    window.shell.resumeAudioContext();
    return result;
}

export function addToast(msg: string | Node, type: 'success' | 'warning' | 'error', timeout?: number): HTMLElement {
    let container = $('.toast-container');
    let card = document.createElement('article');
    card.classList.add('toast');
    card.classList.add('toast-' + type);
    if (typeof msg === 'string') {
        const span = document.createElement('span');
        span.classList.add('toast-msg');
        span.innerText = msg;
        card.appendChild(span);
    } else {
        card.appendChild(msg);
    }
    let btn = document.createElement('button');
    btn.innerText = 'OK';
    function dismiss() { if (card.parentNode === container) container.removeChild(card); }
    btn.addEventListener('click', dismiss);
    if (timeout === undefined)
        timeout = {success: 5000, warning: 10000, error: -1}[type];
    if (timeout >= 0)
        setTimeout(dismiss, timeout);
    card.appendChild(btn);
    container.insertBefore(card, container.firstChild);
    return card;
}

export function isAppleDevice(): boolean {
    return navigator.userAgent.includes('Mac OS X');
}

export function basename(path: string): string {
    return path.replace(/^.*\//, '');
}

export function dirname(path: string): string {
    return path.replace(/\/[^/]*$/, '');
}

export function concatBuffers(parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
    const result = new Uint8Array(parts.reduce((sum, p) => sum + p.byteLength, 0));
    let pos = 0;
    for (const part of parts) {
        result.set(new Uint8Array(part), pos);
        pos += part.byteLength;
    }
    return result;
}

export type GameIni = { iniPath: string, gameName: string };

export async function loadGameIni(files: ZipFile[]): Promise<GameIni | null> {
    const iniFile = files.find(f => f.name.match(/(^|\/)(System40|AliceStart)\.ini$/i));
    if (!iniFile) return null;
    const ini = new TextDecoder('shift_jis', { fatal: true }).decode(await iniFile.extract());
    const match = ini.match(/^GameName\s*=\s*"(.*)"/m);
    if (!match) return null;
    const gameName = match[1];
    return { iniPath: iniFile.name, gameName };
}
