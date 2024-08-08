import type { MainModule as XSys4Module } from './xsystem4.js';
import { $, HOMEDIR, addToast, basename, isAppleDevice } from './utils.js';
import { AssetManager } from './asset_manager.js';
import { Audio } from './audio.js';
import { HllValidator } from './hll_validator.js';
import { InputString } from './input.js';
import * as sysmenu from './sysmenu.js';

export interface XSys4Shell {
    m: XSys4Module;
    resumeAudioContext: () => void;
}

declare global {
    var shell: XSys4Shell;
}

const GAMEDIR = '/game';

async function create_xsystem4(preRun : (m : XSys4Module) => Promise<void>) {
    const module: any = {
        arguments: ['--save-format=rsm', GAMEDIR],
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
            maximum: 256 * 1024 * 1024 / 65536,
            shared: true
        });
    }
    const url = ('Suspender' in WebAssembly) ? './jspi/xsystem4.js' : './xsystem4.js';
    const xsystem4_factory = (await import(url)).default;
    return xsystem4_factory(module);
}

export type GameFile = { path: string, file: File };

export class Shell {
    m: XSys4Module & { arguments?: string[] };
    private audio = new Audio();
    private nonResidentFiles = new Map<string, File>();
    assets = new AssetManager();
    input = new InputString();

    constructor(files: AsyncGenerator<GameFile>) {
        document.documentElement.setAttribute('data-theme', 'dark');
        create_xsystem4(async (module) => {
            this.m = module;
            (module as any).shell = this;  // Enable C code to access this object.
            await Promise.all([
                this.loadGameFiles(files),
                this.loadFonts(),
                this.setupSaveDir(),
            ]);
            $('#spinner')?.remove();
            window.onbeforeunload = (e: BeforeUnloadEvent) => e.returnValue = 'Any unsaved progress will be lost.';
        });
    }

    // Load files into Emscripten virtual filesystem.
    private async loadGameFiles(files: AsyncGenerator<GameFile>) {
        const alds = new Map<string, File[]>();

        for await (let { path, file } of files) {
            // Skip files unnecessary for us.
            if (/\.(exe|inc|dll)$/i.test(path)) continue;

            // Normalize the name to NFC to avoid issues with decomposed dakuon
            // characters (e.g. 'が' (\u304C) -> 'が' (\u304B\u3099)) on macOS.
            path = path.normalize('NFC');

            path = `${GAMEDIR}/${path}`;

            const dir = path.replace(/\/[^/]+$/, '');
            this.m.FS.mkdirTree(dir, undefined);

            const m = path.match(/(.)([a-z])\.ald$/i);
            if (m) {
                const type = m[1].toUpperCase();
                const vol = m[2].toUpperCase().charCodeAt(0) - 65 /* 'A' */;
                if (!alds.has(type)) {
                    alds.set(type, []);
                }
                alds.get(type)![vol] = file;
                // Create a dummy file in the FS.
                this.m.FS.writeFile(path, new Uint8Array());
            } else if (/\.dlf$/i.test(path)) {
                await this.assets.addDlf(path, file);
            } else if (basename(path).toLowerCase() === 'reigndata.red') {
                await this.assets.addAar(path, file);
            } else if (/\.(alm|mpg)$/i.test(path)) {
                this.nonResidentFiles.set(path, file);
                // Create a dummy file in the FS.
                this.m.FS.writeFile(path, new Uint8Array());
            } else {
                this.m.FS.writeFile(path, new Uint8Array(await file.arrayBuffer()));
                const time = file.lastModified;
                this.m.FS.utime(path, time, time);
            }
        }

        for (const [type, files] of alds) {
            await this.assets.addAld(type, files);
        }
    }

    private async setupSaveDir() {
        this.m.ENV['XSYSTEM4_HOME'] = HOMEDIR;
        this.m.FS.mkdir(HOMEDIR, undefined);
        this.m.FS.mount(this.m.FS.filesystems.IDBFS, { autoPersist: true }, HOMEDIR);
        await new Promise<any>((res) => this.m.FS.syncfs(true, res));
    }

    private async loadFonts() {
        this.m.FS.mkdir('/fonts', undefined);
        const gothic = 'fonts/VL-Gothic-Regular-SJIS.ttf';
        const mincho = 'fonts/HanaMinA-SJIS.ttf';
        for (const font of [gothic, mincho]) {
            const resp = await fetch(font);
            const buffer = new Uint8Array(await resp.arrayBuffer());
            if (buffer) {
                this.m.FS.writeFile(font, buffer);
            }
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
        gtag('event', 'GameStart', { Title: title });
    }

    on_error(msg: string) {
        console.error(msg);
        msg = msg.replace(/^\*ERROR\*\([^)]+\):/, '').trim();
        gtag('event', 'XSys4Error', { Message: msg });
        window.onbeforeunload = null;
        addToast(`エラーが発生しました。\n${msg}`, 'error');
    }

    init_save(gameName: string, saveDir: string) {
        sysmenu.initSaveMenu(this.m.FS, gameName);

        // Import save files from the user-provided game data.
        const src = `${GAMEDIR}/${saveDir}`;
        const dest = `${HOMEDIR}/${gameName}/${saveDir}`;
        try {
            if (!this.m.FS.isDir(this.m.FS.stat(src, undefined).mode))
                return;
            this.m.FS.mkdir(`${HOMEDIR}/${gameName}`, undefined);
            this.m.FS.mkdir(dest, undefined);
        } catch (e) {
            // `src` doesn't exist, or xsystem4 saves already exist.
            return;
        }
        try {
            for (const name of this.m.FS.readdir(src)) {
                const stat = this.m.FS.stat(`${src}/${name}`, undefined);
                if (this.m.FS.isDir(stat.mode)) continue;
                this.m.FS.writeFile(`${dest}/${name}`, this.m.FS.readFile(`${src}/${name}`));
                this.m.FS.utime(`${dest}/${name}`, stat.atime, stat.mtime);
            }
            this.schedule_syncfs();
        } catch (e) {
            console.warn(e);
        }
    }

    get_audio_dest_node(): AudioNode {
        return this.audio.getDestNode();
    }

    async load_nonresident_file(path: string): Promise<Uint8Array | null> {
        const file = this.nonResidentFiles.get(path);
        if (!file) return null;
        return new Uint8Array(await file.arrayBuffer());
    }

    private fsyncTimer: number | undefined;
    schedule_syncfs(timeout = 100) {
        window.clearTimeout(this.fsyncTimer);
        this.fsyncTimer = window.setTimeout(() => {
            this.m.FS.syncfs(false, (err) => {
                if (err)
                    console.warn(`syncfs failed: ${err}`);
            });
        }, timeout);
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
