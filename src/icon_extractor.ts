// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

import { concatBuffers } from './utils.js';

// Resource types.
const RT_ICON = 3
const RT_GROUP_ICON = 14

export function extractIconFromExe(exe: ArrayBuffer): Uint8Array | null {
    const extractor = createIconExtractor(exe);
    if (!extractor) return null;
    return extractor.extractIcon();
}

// Returns null if the given file is not in PE format or has no resource section.
function createIconExtractor(exe: ArrayBuffer): IconExtractor | null {
    const v = new DataView(exe);
    // MS-DOS Stub
    if (v.getUint16(0, true) !== 0x5a4d) {  // "MZ"
        return null;
    }
    const ofsPe = v.getUint32(0x3c, true);
    // PE signature
    if (v.getUint32(ofsPe, true) !== 0x4550) {  // "PE\0\0"
        return null;
    }
    // COFF file header
    const ofsCoff = ofsPe + 4;
    const numSections = v.getUint16(ofsCoff + 2, true);
    const sizeOfOptionalHeader = v.getUint16(ofsCoff + 16, true);
    let ofs = ofsCoff + 20 + sizeOfOptionalHeader;
    // Section table
    for (let i = 0; i < numSections; i++) {
        const sectionName = String.fromCharCode(...new Uint8Array(exe, ofs, 8));
        if (sectionName === '.rsrc\0\0\0') {
            const virtualAddress = v.getUint32(ofs + 12, true);
            const sizeOfRawData = v.getUint32(ofs + 16, true);
            const pointerToRawData = v.getUint32(ofs + 20, true);
            return new IconExtractor(new Uint8Array(exe, pointerToRawData, sizeOfRawData), virtualAddress - pointerToRawData);
        }
        ofs += 40;
    }
    return null;
}

class IconExtractor {
    constructor(private data: Uint8Array, private rvaDelta: number) {}

    getView(): DataView {
        return new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    }

    private getRoot(): ResourceDirectory {
        return new ResourceDirectory(this, 0);
    }

    getDirectory(type: number): ResourceDirectory | null {
        return this.getRoot().getDirectory(type);
    }

    getResource(offset: number): Uint8Array {
        const v = this.getView();
        const offsetInFile = v.getUint32(offset, true) - this.rvaDelta;
        const size = v.getUint32(offset + 4, true);
        return new Uint8Array(this.data.buffer, offsetInFile, size);
    }

    // Reconstruct an icon file from RT_GROUP_ICON / RT_ICON resources.
    // https://devblogs.microsoft.com/oldnewthing/20120720-00/?p=7083
    extractIcon(): Uint8Array | null {
        const iconResources = this.getDirectory(RT_ICON);
        if (!iconResources) return null;
        const grpIconBytes = this.getDirectory(RT_GROUP_ICON)?.getFirstResource();
        if (!grpIconBytes) return null;

        const iv = new DataView(grpIconBytes.buffer, grpIconBytes.byteOffset, grpIconBytes.byteLength);
        const numIcons = iv.getUint16(4, true);
        const header = new Uint8Array(6 + numIcons * 16);
        const ov = new DataView(header.buffer);
        header.set(grpIconBytes.subarray(0, 6));

        const parts = [header];
        let offsetInFile = header.length;
        for (let i = 0; i < numIcons; i++) {
            const iOfs = 6 + i * 14;
            const oOfs = 6 + i * 16;
            header.set(grpIconBytes.subarray(iOfs, iOfs + 12), oOfs);
            ov.setUint32(oOfs + 12, offsetInFile, true);
            const iconId = iv.getUint16(iOfs + 12, true);
            const iconBytes = iconResources.getDirectory(iconId)?.getFirstResource();
            if (!iconBytes) return null;
            parts.push(iconBytes);
            offsetInFile += iconBytes.length;
        }
        return concatBuffers(parts);
    }
}

type ResourceDirectoryEntry = { nameOrId: number, isDirectory: boolean, ofs: number };

class ResourceDirectory {
    private entries: ResourceDirectoryEntry[] = [];

    constructor(private e: IconExtractor, pos: number) {
        const v = e.getView();
        const numNamedEntries = v.getUint16(pos + 12, true);
        const numIdEntries = v.getUint16(pos + 14, true);
        this.entries = [];
        pos += 16;
        for (let i = 0; i < numNamedEntries + numIdEntries; i++) {
            const nameOrId = v.getUint32(pos, true);
            const ofs = v.getUint32(pos + 4, true);
            if (ofs & 0x80000000) {
                this.entries.push({ nameOrId, isDirectory: true, ofs: ofs & 0x7fffffff });
            } else {
                this.entries.push({ nameOrId, isDirectory: false, ofs });
            }
            pos += 8;
        }
    }

    getDirectory(nameOrId: number): ResourceDirectory | null {
        for (const e of this.entries) {
            if (e.nameOrId === nameOrId && e.isDirectory) {
                return new ResourceDirectory(this.e, e.ofs);
            }
        }
        return null;
    }

    getResource(nameOrId: number): Uint8Array | null {
        for (const e of this.entries) {
            if (e.nameOrId === nameOrId && !e.isDirectory) {
                return this.e.getResource(e.ofs);
            }
        }
        return null;
    }

    getFirstResource(): Uint8Array | null {
        if (this.entries[0].isDirectory) {
            return new ResourceDirectory(this.e, this.entries[0].ofs).getFirstResource();
        }
        return this.e.getResource(this.entries[0].ofs);
    }
}
