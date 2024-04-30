interface Archive {
    exists(no: number): boolean;
    load(no: number): Promise<Uint8Array | null>;
    load_by_name(name: string): Promise<Uint8Array | null>;
}

export class AssetManager {
    private alds = new Map<string, Ald>();
    private archives = new Map<string, Archive>();
    private handles = new Map<number, Archive>();

    async addAld(type: string, files: File[]) {
        this.alds.set(type, await Ald.create(files));
    }

    async addAar(path: string, file: File) {
        this.archives.set(path, await Aar.create(file));
    }

    async addDlf(path: string, file: File) {
        this.archives.set(path, await Dlf.create(file));
    }

    // snake_case methods are called from C code.

    ald_exists(type: number, no: number): boolean {
        const ald = this.alds.get(String.fromCharCode(type));
        return !!ald && ald.exists(no);
    }

    async ald_load(type: number, no: number): Promise<Uint8Array | null> {
        const ald = this.alds.get(String.fromCharCode(type));
        if (!ald) return null;
        return ald.load(no);
    }

    open(path: string, handle: number): boolean {
        const ar = this.archives.get(path);
        if (!ar) return false;
        this.handles.set(handle, ar);
        return true;
    }

    close(handle: number): void {
        this.handles.delete(handle);
    }

    exists(handle: number, no: number): boolean {
        return this.handles.get(handle)!.exists(no);
    }

    load(handle: number, no: number): Promise<Uint8Array | null> {
        return this.handles.get(handle)!.load(no);
    }

    load_by_name(handle: number, name: string): Promise<Uint8Array | null> {
        return this.handles.get(handle)!.load_by_name(name);
    }
}

class Ald {
    constructor(private files: File[], private ltbl: DataView, private offsets: number[]) {}

    static async create(files: File[]) {
        let ltbl: DataView | null = null;
        const offsets: number[] = [];
        for (let vol = 0; vol < files.length; vol++) {
            const file = files[vol];
            if (!file) continue;
            const header = new Uint8Array(await file.slice(0, 6).arrayBuffer());
            if (header.byteLength < 6) {
                throw new Error(file.name + ': Invalid ALD header');
            }
            // un-obfuscate the first 3 bytes if necessary
            switch (header[2]) {
            case 0x44:  // Sengoku Rance DL edition, Haruka DL edition
                header[0] -= 0x40;
                header[1] -= 0x4c;
                header[2] = 0x00;
                break;
            case 0x14:  // GALZOO island DL edition
                header[0] -= 0x17;
                header[1] -= 0x1c;
                header[2] = 0x00;
                break;
            }
            const offsize = getUint24(header, 0) << 8;
            const linksize = (getUint24(header, 3) << 8) - offsize;
            if (linksize <= 0 || offsize + linksize > file.size) {
                throw new Error(file.name + ': Invalid ALD header');
            }
            // Read the link table.
            if (!ltbl) {
                ltbl = new DataView(await file.slice(offsize, offsize + linksize).arrayBuffer());
            }
            const numFiles = Math.floor(ltbl.byteLength / 3);
            // Read the offsets table.
            const otbl = new Uint8Array(await file.slice(0, offsize).arrayBuffer());
            for (let i = 0; i < numFiles; i++) {
                if (ltbl.getUint8(i * 3) !== vol + 1) continue;
                const offsetIndex = ltbl.getUint16(i * 3 + 1, true);
                if (offsetIndex * 3 + 2 >= otbl.byteLength) {
                    throw new Error(file.name + ': Invalid ALD index');
                }
                offsets[i] = getUint24(otbl, offsetIndex * 3) << 8;
            }
        }
        if (!ltbl) {
            throw new Error('No ALD files found');
        }
        return new Ald(files, ltbl, offsets);
    }

    exists(no: number): boolean {
        return !!this.offsets[no];
    }

    // Load the descriptor of the specified file.
    async load_descriptor(no: number): Promise<Uint8Array | null> {
        const offset = this.offsets[no];
        if (!offset) return null;
        const file = this.files[this.ltbl.getUint8(no * 3) - 1];
        let buffer = await file.slice(offset, offset + 32).arrayBuffer();
        if (buffer.byteLength < 32) {
            throw new Error(`${file.name}: Invalid ALD entry ${no}`);
        }
        const hdrSize = new DataView(buffer).getUint32(0, true);
        if (hdrSize > buffer.byteLength) {
            buffer = await file.slice(offset, offset + hdrSize).arrayBuffer();
        }
        return new Uint8Array(buffer);
    }

    // Load the specified file.
    async load(no: number): Promise<Uint8Array | null> {
        const offset = this.offsets[no];
        if (!offset) return null;
        const file = this.files[this.ltbl.getUint8(no * 3) - 1];
        const header = new DataView(await file.slice(offset, offset + 8).arrayBuffer());
        if (header.byteLength < 8) {
            throw new Error(`${file.name}: Invalid ALD entry ${no}`);
        }
        const headerSize = header.getUint32(0, true);
        const dataSize = header.getUint32(4, true);
        const buffer = await file.slice(offset, offset + headerSize + dataSize).arrayBuffer();
        if (buffer.byteLength < headerSize + dataSize) {
            throw new Error(`${file.name}: Invalid ALD entry ${no}`);
        }
        return new Uint8Array(buffer);
    }
}

function getUint24(buf: Uint8Array, offset: number) {
    return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
}

class Dlf implements Archive {
    private entries: Blob[] = [];

    static async create(file: File) {
        const header = await file.slice(0, 8 + 300 * 8).arrayBuffer();
        return new Dlf(file, header);
    }

    constructor(file: File, header: ArrayBuffer) {
        const v = new DataView(header);
        if (v.getUint32(0, true) !== 0x464c44) {  // 'DLF\0'
            throw new Error('not a dlf file');
        }
        for (let i = 0; i < 300; i++) {
            const offset = v.getUint32(8 + i * 8, true);
            const length = v.getUint32(8 + i * 8 + 4, true);
            if (offset)
                this.entries[i] = file.slice(offset, offset + length);
        }
    }

    exists(no: number): boolean {
        return !!this.entries[no];
    }

    async load(no: number): Promise<Uint8Array | null> {
        const entry = this.entries[no];
        if (!entry) return null;
        return new Uint8Array(await entry.arrayBuffer());
    }

    async load_by_name(name: string): Promise<Uint8Array | null> {
        throw new Error('not implemented');
    }
}

type AarEntry = { offset: number, size: number, type: number, name: string };

class Aar implements Archive {
    static async create(file: File) {
        const header = await file.slice(0, 16).arrayBuffer();
        const hv = new DataView(header);
        if (hv.getUint32(0, true) !== 0x524141 ) {  // 'AAR\0'
            throw new Error('not an AAR file');
        }
        const version = hv.getUint32(4, true);
        if (version !== 0) {
            throw new Error('unsupported AAR version ' + version);
        }
        const nr_entries = hv.getUint32(8, true);
        const first_entry_offset = hv.getUint32(12, true);
        const indexBuf = await file.slice(12, first_entry_offset).arrayBuffer();
        const v = new DataView(indexBuf);
        const entries = new Map<string, AarEntry>();
        let ofs = 0;
        for (let i = 0; i < nr_entries; i++) {
            const offset = v.getUint32(ofs, true);
            const size = v.getUint32(ofs + 4, true);
            const type = v.getInt32(ofs + 8, true);
            const sjisName = readStrZ(v, ofs + 12);
            ofs += 12 + sjisName.length + 1;
            const name = new TextDecoder('shift_jis').decode(sjisName);
            entries.set(name.toLowerCase(), { offset, size, type, name });
        }
        return new Aar(file, entries);
    }

    constructor(private file: File, private entries: Map<string, AarEntry>) {}

    exists(no: number): boolean {
        throw new Error('not implemented');
    }

    async load(no: number): Promise<Uint8Array | null> {
        throw new Error('not implemented');
    }

    async load_by_name(name: string): Promise<Uint8Array | null> {
        const entry = this.entries.get(name.toLowerCase());
        if (!entry) return null;
        return new Uint8Array(await this.file.slice(entry.offset, entry.offset + entry.size).arrayBuffer());
    }
}

function readStrZ(v: DataView, ofs: number): Uint8Array {
    const start = ofs;
    while (v.getUint8(ofs)) ofs++;
    return new Uint8Array(v.buffer, v.byteOffset + start, ofs - start);
}
