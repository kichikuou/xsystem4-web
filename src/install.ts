import { $, OPFS_GAMEDIR, addToast, dirname, loadGameIni, registerErrorHandlers } from './utils.js';
import * as zip from './zip.js';
import type { InstallerWorkerRequest, InstallerWorkerResponse } from './worker/installer_worker.js';

$('#file-picker').addEventListener('change', async (evt: Event) => {
    const files = (evt.target as HTMLInputElement).files!;
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        await InstallFromZip(files[0]);
    } else {
        addToast('ZIPファイルを選択してください。', 'warning');
        gtag('event', 'InstallError', { Reason: 'No ZIP file selected' });
    }
}, false);

// Extract game files under '/game' OPFS directory.
export async function InstallFromZip(zipFile: File) {
    const files = await zip.load(zipFile);
    const ini = await loadGameIni(files);
    if (!ini) {
        addToast('ZIPファイルにゲームデータが見つかりません。', 'error');
        gtag('event', 'InstallError', { Reason: 'No game data found in ZIP' });
        return;
    }

    const progress = new InstallProgress(files.reduce((sum, f) => sum + f.uncompressedSize, 0));
    const worker = new InstallerWorker((_, n) => progress.increase(n));

    // Clear previous installation if exists.
    try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(OPFS_GAMEDIR, { recursive: true });
    } catch (e) {}

    const rootInZip = dirname(ini.iniPath);
    for (const file of files) {
        if (!file.name.startsWith(rootInZip + '/') || file.name.endsWith('/')) {
            progress.increase(file.uncompressedSize);
            continue;
        }
        progress.setFilename(file.name);
        const path = file.name.replace(rootInZip, `/${OPFS_GAMEDIR}`);
        // TODO: Consider extracting files in parallel.
        let retryCount = 0;
        while (true) {
            try {
                await worker.writeZipFile(path, file);
                break;
            } catch (e) {
                gtag('event', 'InstallWorkerError', { Message: e, RetryCount: retryCount });
                if (++retryCount >= 3) {
                    addToast(`ファイルの書き込みに失敗しました。\n${e}`, 'error');
                    return;
                };
            }
        }
    }

    progress.finish();
    localStorage.setItem('installed', 'true');
    gtag('event', 'InstallSuccess', { Title: ini.gameName });
}

class InstallProgress {
    private progress = $('#progress') as HTMLProgressElement;

    constructor(max: number) {
        $('#installer').hidden = true;
        $('#installing').hidden = false;
        this.progress.max = max;
        this.progress.value = 0;
    }

    increase(value: number) {
        this.progress.value += value;
        $('#percentages').textContent = Math.round(this.progress.value / this.progress.max * 100) + '%';
    }

    setFilename(filename: string) {
        $('#filename').textContent = filename;
    }

    finish() {
        this.progress.max = this.progress.value = 1;
        this.setFilename('');
        $('#message').textContent = 'インストール完了';
        $('#game-start').hidden = false;
    }
}

class InstallerWorker {
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

registerErrorHandlers();

const url = new URL(location.href);
$('#title').textContent = decodeURIComponent(url.hash.slice(1));
