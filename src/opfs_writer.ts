import * as zip from './zip.js';
import type { InstallerWorkerRequest, InstallerWorkerResponse } from './worker/installer_worker.js';

export class OPFSWriter {
    private worker: Worker;
    private resolvers: Map<string, { resolve: (name: string) => void, reject: (err: any) => void }> = new Map();

    constructor(private progressCallback: (path: string, value: number) => void) {
        this.worker = new Worker('worker/installer_worker.js');
        this.worker.addEventListener('message', (e) => this.onMessage(e.data));
    }

    private postMessage(msg: InstallerWorkerRequest, transfer: Transferable[] = []) {
        this.worker.postMessage(msg, transfer);
    }

    private onMessage(msg: InstallerWorkerResponse) {
        if (msg.command === 'progress') {
            this.progressCallback(msg.path, msg.value);
            return;
        }
        if (msg.error) {
            this.resolvers.get(msg.path)!.reject(msg.error);
        } else if (msg.command === 'write') {
            this.resolvers.get(msg.path)!.resolve(msg.path);
        }
    }

    async writeZipFile(path: string, file: zip.ZipFile) {
        if (file.isEncrypted()) throw new Error('Encrypted ZIP files are not supported');
        let compression: CompressionFormat | undefined;
        switch (file.method) {
            case 0: break;
            case 8: compression = 'deflate-raw'; break;
            default: throw new Error('Unsupported compression method: ' + file.method);
        }
        const data = await file.compressedData();
        return new Promise<string>(async (res, rej) => {
            this.resolvers.set(path, { resolve: res, reject: rej });
            this.postMessage({ command: 'write', path, data, compression, crc32: file.crc32 });
        });
    }
}
