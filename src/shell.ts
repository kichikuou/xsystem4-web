// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

import type { MainModule as XSys4Module } from './xsystem4.js';
import { $, addToast, isAppleDevice } from './utils.js';
import { Audio } from './audio.js';
import { HllValidator } from './hll_validator.js';
import { InputString } from './input.js';
import { dictionary } from './strings.js';
import * as sysmenu from './sysmenu.js';

export interface XSys4Shell {
    m: XSys4Module;
    resumeAudioContext: () => void;
}

declare global {
    var shell: XSys4Shell;
}

const GAMEDIR = '/opfs/game';

async function create_xsystem4(preRun : (m : XSys4Module) => Promise<void>) {
    const module: any = {
        arguments: ['--save-format=rsm', `--save-folder=${GAMEDIR}/SaveData`, GAMEDIR],
        canvas: document.getElementById('canvas') as HTMLCanvasElement,
        preRun: [] as (() => void)[],
    };
    // URL parameters starting with '-' are passed as command-line arguments.
    const urlParams = new URLSearchParams(location.search.slice(1));
    for (let [name, val] of urlParams) {
        if (name.startsWith('-')) {
            module.arguments.push(name);
            if (val)
                module.arguments.push(val);
        }
    }
    module.preRun.push(() => {
        const m = module as XSys4Module;
        m.addRunDependency('create_xsystem4');
        preRun(m).then(() => m.removeRunDependency('create_xsystem4'));
    });
    if (isAppleDevice()) {
        // Workaround for https://bugs.webkit.org/show_bug.cgi?id=255103
        module.wasmMemory = new WebAssembly.Memory({
            initial:  64 * 1024 * 1024 / 65536,
            maximum: 512 * 1024 * 1024 / 65536,
            shared: true
        });
    }
    const url = './xsystem4.js';
    const xsystem4_factory = (await import(url)).default;
    return xsystem4_factory(module);
}

export class Shell {
    m: XSys4Module & { arguments?: string[] };
    private audio = new Audio();
    input = new InputString();
    private fonts: { path: string, file: Uint8Array }[] = [];

    constructor() {
        document.documentElement.setAttribute('data-theme', 'dark');
        create_xsystem4(async (module) => {
            this.m = module;
            (module as any).shell = this;  // Enable C code to access this object.
            await this.loadFonts();
            $('#spinner')?.remove();
            window.onbeforeunload = (e: BeforeUnloadEvent) => e.returnValue = 'Any unsaved progress will be lost.';
        });
    }

    private async loadFonts() {
        const gothic = 'fonts/VL-Gothic-Regular-SJIS.ttf';
        const mincho = 'fonts/HanaMinA-SJIS.ttf';
        for (const font of [gothic, mincho]) {
            const resp = await fetch(font);
            const buffer = new Uint8Array(await resp.arrayBuffer());
            this.fonts.push({ path: font, file: buffer });
        }
        this.m.arguments!.push('--font-gothic', gothic);
        this.m.arguments!.push('--font-mincho', mincho);
    }

    resumeAudioContext() {
        this.audio.resumeContext();
    }

    // snake_case methods are called from C code.

    set_title(title: string) {
        document.title = title + ' - xsystem4';
        sysmenu.initSaveMenu(title);
        gtag('event', 'GameStart', { Title: title });
    }

    on_error(msg: string) {
        console.error(msg);
        msg = msg.replace(/^\*ERROR\*\([^)]+\):/, '').trim();
        gtag('event', 'XSys4Error', { Message: msg });
        window.onbeforeunload = null;
        addToast(dictionary.error_occurred + '\n' + msg, 'error');
    }

    init_filesystem() {
        this.m.FS.mkdir('/fonts', undefined);
        this.fonts.forEach(({ path, file }) => {
            this.m.FS.writeFile(path, file);
        });
        this.fonts = [];
    }

    get_audio_dest_node(): AudioNode {
        return this.audio.getDestNode();
    }

    open_system_menu() {
        sysmenu.open();
    }

    private hll_validator: HllValidator | undefined;
    async init_hll_validator(): Promise<number> {
        this.hll_validator = await HllValidator.create();
        return 1;
    }

    validate_hll_signature(lib: string, name: string, func: number, sig: string) {
        this.hll_validator!.validate(lib, name, func, sig);
    }
}

// SDL resets the canvas's width and height in window.onresize, but it does
// not work well when the screen orientation changes (in Safari).
new ResizeObserver((entries) => {
    for (const entry of entries) {
        const canvas = entry.target as HTMLCanvasElement;
        const { width, height } = entry.contentRect;
        if (canvas.width !== width || canvas.height !== height) {
            // Fire a resize event again to update the state in SDL.
            window.dispatchEvent(new Event('resize'));
        }
    }
}).observe($('#canvas')!);
