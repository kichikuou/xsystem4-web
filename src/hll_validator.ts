import type Binaryen from 'binaryen';

// This class is used by `xsystem4 --audit` to ensure that HLL function calls
// do not result in a function type mismatch error.
//
// Function types in xsystem4 are obtained by inspecting the wasm binary
// using binaryen.
export class HllValidator {
    private functbl: string[];
    private functbl_offset: number;

    static async create(): Promise<HllValidator> {
        const binaryen = (await import('binaryen')).default;
        const wasm = await (await fetch('xsystem4.wasm')).arrayBuffer();
        const module = binaryen.readBinary(new Uint8Array(wasm));
        return new HllValidator(binaryen, module);
    }

    constructor(private binaryen: typeof Binaryen, private module: Binaryen.Module) {
        if (module.getNumElementSegments() !== 1)
            throw new Error('Expected exactly one element segment');
        const seg = binaryen.getElementSegmentInfo(module.getElementSegmentByIndex(0));
        const m = binaryen.emitText(seg.offset).match(/^\(i32.const (\d+)\)/);
        if (!m) throw new Error('Invalid element segment offset');
        this.functbl_offset = parseInt(m[1]);
        this.functbl = seg.data;
    }

    validate(lib: string, name: string, funcidx: number, sig: string) {
        const func = this.functbl[funcidx - this.functbl_offset];
        let f = this.module.getFunction(func);
        const info = this.binaryen.getFunctionInfo(f);
        const required = this.format_sig(sig);
        const implemented = this.format_functype(info);
        if (required !== implemented) {
            console.error(`HLL function type mismatch: ${lib}.${name}: required ${required}, impremented ${implemented}`);
        }
    }

    private format_sig(sig: string) {
        const a = sig.split('').map(c => {
            switch (c) {
                case 'v': return 'void';
                case 'i':
                case 'p': return 'i32';
                case 'f': return 'f32';
                default: return c;
            }
        });
        return `(${a.slice(1).join(', ')}) -> ${a[0]}`;
    }

    private format_functype(f: Binaryen.FunctionInfo) {
        const formatType = (t: Binaryen.Type) => {
            switch (t) {
                case this.binaryen.none: return 'void';
                case this.binaryen.i32: return 'i32';
                case this.binaryen.f32: return 'f32';
                default: return `type${t}`;
            }
        }
        const argtypes = this.binaryen.expandType(f.params).map(formatType).join(', ');
        const rettype = formatType(f.results);
        return `(${argtypes}) -> ${rettype}`;
    }
}
