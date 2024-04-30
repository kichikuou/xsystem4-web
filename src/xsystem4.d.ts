export interface XSys4Module extends EmscriptenModule {
    canvas: HTMLCanvasElement;
    FS: typeof FS & {
        filesystems: { IDBFS: typeof IDBFS },
        mkdirTree: (path: string, mode?: number) => void
    };
    ENV: { [key: string]: string };
    addRunDependency: typeof addRunDependency;
    removeRunDependency: typeof removeRunDependency;
    _gfx_get_window_size: () => number;
    _gfx_get_viewport: () => number;
}

declare function create(moduleArg: any): Promise<XSys4Module>;
export default create;
