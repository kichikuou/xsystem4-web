const OS_UNIX = 3;

export class ZipFile {
    name: string;
    fileOffset: number;
    compressedSize: number;
    uncompressedSize: number;
    crc32: number;
    method: number;
    gpbf: number;

    isEncrypted(): boolean {
        return (this.gpbf & 1) !== 0;
    }

    constructor(private file: Blob, cde: Uint8Array) {
        const v = new DataView(cde.buffer, cde.byteOffset, cde.byteLength);
        if (v.getUint32(0, true) !== 0x02014B50) {  // "PK\001\002"
            throw new Error('Invalid central directory');
        }
        const versionMadeBy = v.getUint16(4, true);
        const versionNeeded = v.getUint16(6, true);
        if (versionNeeded > 20) throw new Error('Unsupported ZIP version: ' + versionNeeded);
        this.gpbf = v.getUint16(8, true);
        this.method = v.getUint16(10, true);
        this.crc32 = v.getInt32(16, true);
        this.compressedSize = v.getUint32(20, true);
        this.uncompressedSize = v.getUint32(24, true);
        const fileNameLength = v.getUint16(28, true);
        this.fileOffset = v.getUint32(42, true);
        const encoding = this.guessPathEncoding(versionMadeBy);
        this.name = new TextDecoder(encoding, { fatal: true }).decode(cde.subarray(46, 46 + fileNameLength));
    }

    guessPathEncoding(versionMadeBy: number): string {
        if (this.gpbf & 0x800) return 'utf-8';
        const os = versionMadeBy >> 8;
        if (os === OS_UNIX) return 'utf-8';
        return 'shift_jis';
    }

    async compressedData(): Promise<Blob> {
        const localHeader = await readBytes(this.file, this.fileOffset, 30);
        const lhView = new DataView(localHeader);
        if (lhView.getUint32(0, true) !== 0x04034B50) {  // "PK\003\004"
            throw new Error('Invalid local header');
        }
        const compressedDataOffset = this.fileOffset + 30 + lhView.getUint16(26, true) + lhView.getUint16(28, true);
        return this.file.slice(compressedDataOffset, compressedDataOffset + this.compressedSize);
    }

    async extract(): Promise<Uint8Array> {
        if (this.isEncrypted()) throw new Error('Encrypted ZIP files are not supported');
        if (this.method === 0) {
            return new Uint8Array(await (await this.compressedData()).arrayBuffer());
        }
        if (this.method !== 8) throw new Error('Unsupported compression method: ' + this.method);
        const stream = (await this.compressedData()).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const data = await new Response(stream).arrayBuffer();
        if (~crc32(new Uint8Array(data)) !== this.crc32) {
            throw new Error('CRC32 mismatch');
        }
        return new Uint8Array(data);
    }
}

export async function load(file: Blob): Promise<ZipFile[]> {
    // Find the OECD record.
    const oecdBuf = await readBytes(file, Math.max(0, file.size - 65558), Math.min(65558, file.size));
    const view = new DataView(oecdBuf);
    let oecdp = oecdBuf.byteLength - 22;
    while (oecdp >= 0) {
        if (view.getUint32(oecdp, true) === 0x06054B50) {  // "PK\005\006"
            break;
        }
        oecdp--;
    }
    if (oecdp < 0) throw new Error('Not a ZIP file');

    // Read the central directory.
    const cdSize = view.getUint32(oecdp + 12, true);
    const cdOffset = view.getUint32(oecdp + 16, true);
    const cdBuf = await readBytes(file, cdOffset, cdSize);
    const cdView = new DataView(cdBuf);
    let pos = 0;
    const files: ZipFile[] = [];
    while (pos < cdSize) {
        const fileNameLength = cdView.getUint16(pos + 28, true);
        const extraFieldLength = cdView.getUint16(pos + 30, true);
        const commentLength = cdView.getUint16(pos + 32, true);
        const cdeSize = 46 + fileNameLength + extraFieldLength + commentLength;
        files.push(new ZipFile(file, new Uint8Array(cdBuf, pos, cdeSize)));
        pos += cdeSize;
    }
    return files;
}

const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    }
    crc32Table[i] = crc;
}

export function crc32(data: Uint8Array, crc: number = -1): number {
    for (let i = 0; i < data.length; i++) {
        crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return crc;
}

function readBytes(file: Blob, offset: number, length: number): Promise<ArrayBuffer> {
    return file.slice(offset, offset + length).arrayBuffer();
}
