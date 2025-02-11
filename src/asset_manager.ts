// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

interface Archive {
    exists(no: number): boolean;
    exists_by_name(name: string): number;
    load(no: number): Promise<Uint8Array | null>;
    load_by_name(name: string): Promise<{data: Uint8Array, no: number} | null>;
}

export class AssetManager {
    private alds = new Map<string, Ald>();
    private archives = new Map<string, Archive>();
    private handles = new Map<number, Archive>();

    async addAld(type: string, files: File[]) {
        this.alds.set(type, await Ald.create(files));
    }

    async addAfa(path: string, file: File) {
        this.archives.set(path, await Afa1.create(file));
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

    exists_by_name(handle: number, name: string): number {
        return this.handles.get(handle)!.exists_by_name(name);
    }

    load(handle: number, no: number): Promise<Uint8Array | null> {
        return this.handles.get(handle)!.load(no);
    }

    load_by_name(handle: number, name: string): Promise<{data: Uint8Array, no: number} | null> {
        return this.handles.get(handle)!.load_by_name(name);
    }
}

class Ald {
    constructor(private files: File[], private ltbl: DataView, private offsets: number[]) {}

    static async create(files: File[]) {
        let ltbl: DataView | null = null;
        const offsets: number[] = [];
        let magic: Uint8Array | null = null;
        for (let vol = 0; vol < files.length; vol++) {
            const file = files[vol];
            if (!file) continue;
            const header = new Uint8Array(await file.slice(0, 6).arrayBuffer());
            if (header.byteLength < 6) {
                throw new Error(file.name + ': Invalid ALD header');
            }
            if (!magic && header[2] !== 0) {
                magic = await this.findMagic(file, header);
            }
            // un-obfuscate the first 3 bytes if necessary
            if (magic) {
                header[0] -= magic[0];
                header[1] -= magic[1];
                header[2] -= magic[2];
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

    // Find the magic number used to obfuscate the ALD header.
    static async findMagic(file: File, header: Uint8Array): Promise<Uint8Array> {
        const linksize = getUint24(header, 3) << 8;
        const buf = new Uint8Array(await file.slice(0, linksize).arrayBuffer());
        // Find the boundary between the ptr table and the link table.
        let prev = -1;
        for (let i = 6; i < buf.length - 2; i += 3) {
            const n = getUint24(buf, i);
            if (prev < n) {
                prev = n;
                continue;
            }
            const work = new ArrayBuffer(4);
            const view = new DataView(work);
            view.setUint32(0, (i + 0xff) >> 8, true);
            const magic = new Uint8Array(work, 0, 3);
            magic[0] = header[0] - magic[0];
            magic[1] = header[1] - magic[1];
            magic[2] = header[2] - magic[2];
            console.log(`${file.name}: Magic bytes ${magic}`);
            gtag('event', 'AldMagic', { FileName: file.name, Magic: `${magic}` });
            return magic;
        }
        throw new Error(file.name + ': Invalid ALD header');
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

type Afa1Entry = { offset: number, size: number, name: string, no: number };

class Afa1 implements Archive {
    static async create(file: File) {
        const header = await file.slice(0, 44).arrayBuffer();
        const hv = new DataView(header);
        if (hv.getUint32(0, true) !== 0x48414641) {  // 'AFAH'
            throw new Error('not an AFA file');
        }
        if (hv.getUint32(8, true) !== 0x63696c41 || hv.getUint32(12, true) !== 0x68637241) {  // 'AlicArch'
            throw new Error('not an AlicArch file');
        }
        const afaVersion = hv.getUint32(0x10, true);
        if (afaVersion !== 1 && afaVersion !== 2) {
            throw new Error('unsupported AFA version ' + afaVersion);
        }
        const dataStart = hv.getUint32(0x18, true);
        if (hv.getUint32(0x1c, true) !== 0x4F464E49) {  // 'INFO'
            throw new Error('cannot find INFO section');
        }
        const compressedSize = hv.getUint32(0x20, true) - 16;
        const fileCount = hv.getUint32(0x28, true);
        const stream = file.slice(44, 44 + compressedSize).stream().pipeThrough(new DecompressionStream('deflate'));
        const indexBuf = await new Response(stream).arrayBuffer();
        const v = new DataView(indexBuf);
        const entries: Afa1Entry[] = [];
        let ofs = 0;
        for (let i = 0; i < fileCount; i++) {
            const nameSize = v.getUint32(ofs, true);
            const paddedSize = v.getUint32(ofs + 4, true);
            // FIXME: This may not match xsystem4's sjis2utf().
            const name = new TextDecoder('shift_jis').decode(new Uint8Array(indexBuf, ofs + 8, nameSize));
            ofs += 8 + paddedSize;
            let no = i;
            if (afaVersion === 1) {
                const n = v.getUint32(ofs, true) - 1;
                if (n !== 0) no = n;  // for Oyako Rankan
                ofs += 4;
            }
            ofs += 8; // skip the timestamp
            const offset = v.getUint32(ofs, true) + dataStart;
            const size = v.getUint32(ofs + 4, true);
            ofs += 8;
            entries.push({ offset, size, name, no });
        }
        if (ofs !== indexBuf.byteLength) {
            throw new Error('invalid AFA index');
        }
        return new Afa1(file, entries);
    }

    private nameIndex = new Map<string, Afa1Entry>();
    private numberIndex = new Map<number, Afa1Entry>();
    constructor(private file: File, entries: Afa1Entry[]) {
        for (const entry of entries) {
            this.nameIndex.set(archiveBasename(entry.name), entry);
            this.numberIndex.set(entry.no, entry);
        }
    }

    exists(no: number): boolean {
        return this.numberIndex.has(no);
    }

    exists_by_name(name: string): number {
        const entry = this.nameIndex.get(archiveBasename(name));
        if (!entry) return -1;
        return entry.no;
    }

    async load(no: number): Promise<Uint8Array | null> {
        const entry = this.numberIndex.get(no);
        if (!entry) return null;
        return new Uint8Array(await this.file.slice(entry.offset, entry.offset + entry.size).arrayBuffer());
    }

    async load_by_name(name: string): Promise<{data: Uint8Array, no: number} | null> {
        const entry = this.nameIndex.get(archiveBasename(name));
        if (!entry) return null;
        const data = new Uint8Array(await this.file.slice(entry.offset, entry.offset + entry.size).arrayBuffer());
        return { data, no: entry.no };
    }
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

    exists_by_name(name: string): number {
        throw new Error('not implemented');
    }

    async load(no: number): Promise<Uint8Array | null> {
        const entry = this.entries[no];
        if (!entry) return null;
        return new Uint8Array(await entry.arrayBuffer());
    }

    async load_by_name(name: string): Promise<{data: Uint8Array, no: number} | null> {
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

    exists_by_name(name: string): number {
        throw new Error('not implemented');
    }

    async load(no: number): Promise<Uint8Array | null> {
        throw new Error('not implemented');
    }

    async load_by_name(name: string): Promise<{data: Uint8Array, no: number} | null> {
        const entry = this.entries.get(name.toLowerCase());
        if (!entry) return null;
        const data = new Uint8Array(await this.file.slice(entry.offset, entry.offset + entry.size).arrayBuffer());
        return { data, no: -1 };
    }
}

function archiveBasename(path: string) {
    const i = path.lastIndexOf('.');
    if (i >= 0) path = path.slice(0, i);
    return path.toLowerCase().replace(/\//g, '\\');
}

function readStrZ(v: DataView, ofs: number): Uint8Array {
    const start = ofs;
    while (v.getUint8(ofs)) ofs++;
    return new Uint8Array(v.buffer, v.byteOffset + start, ofs - start);
}
