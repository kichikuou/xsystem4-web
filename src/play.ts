import { GameFile, Shell } from './shell.js'
import { $, OPFS_GAMEDIR, addToast, registerErrorHandlers } from './utils.js';

registerErrorHandlers();

getFilesFromOPFS().then(files => {
    (window as any).shell = new Shell(files);
    persistStorage();
}, () => {
    const url = new URL(location.href);
    if (url.searchParams.get('pwa')) {
        // The user has just added the PWA to the home screen.
        // Continue the installation process.
        location.href = './install.html' + url.hash;
    } else {
        addToast('ゲームがインストールされていません。', 'error');
        gtag('event', 'GameNotInstalled');
        registerDropHandler();
    }
    $('#spinner').remove();
});

async function persistStorage() {
    if (navigator.storage && navigator.storage.persisted) {
        const persistent = await navigator.storage.persisted();
        if (!persistent && navigator.storage.persist) {
            const result = (await navigator.storage.persist()) ? 'granted' : 'denied';
            console.log(`Storage persist: ${result}`);
            gtag('event', 'StoragePersist', { Result: result });
        }
    }
}

function registerDropHandler() {
    document.body.addEventListener('dragover', (evt: DragEvent) => {
        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer!.dropEffect = 'copy';
    }, false);

    document.body.addEventListener('drop', async (evt: DragEvent) => {
        evt.stopPropagation();
        evt.preventDefault();
        const t = evt.dataTransfer!;
        const entry = t.items[0].webkitGetAsEntry();
        if (entry?.isDirectory) {
            const files = getFilesFromDirectory(entry as FileSystemDirectoryEntry);
            (window as any).shell = new Shell(files);
        } else {
            addToast('フォルダーをドラッグ＆ドロップしてください。', 'warning');
        }
    }, false);
}

async function getFilesFromOPFS(): Promise<AsyncGenerator<GameFile>> {
    if (localStorage.getItem('installed') !== 'true') {
        throw new Error('Game not installed');
    }
    async function *walk(entry: FileSystemDirectoryHandle, dir: string) {
        for await (const e of entry.values()) {
            const path = dir + e.name;
            if (e.kind === 'directory') {
                yield* walk(e as FileSystemDirectoryHandle, path + '/');
            } else if (e.kind === 'file') {
                const file = await (e as FileSystemFileHandle).getFile();
                yield { path, file };
            }
        }
    }
    const root = await navigator.storage.getDirectory();
    const gameRoot = await root.getDirectoryHandle(OPFS_GAMEDIR, { create: false });
    return walk(gameRoot, '');
}

async function *getFilesFromDirectory(entry: FileSystemDirectoryEntry, dir: string = ''): AsyncGenerator<GameFile> {
    const entries = await new Promise<FileSystemEntry[]>(
        (res, rej) => entry.createReader().readEntries(res, rej));
    for (const e of entries) {
        const path = dir + e.name;
        if (e.isDirectory) {
            yield* getFilesFromDirectory(e as FileSystemDirectoryEntry, path + '/');
        } else if (e.isFile) {
            const file = await new Promise<File>(
                (res, rej) => (e as FileSystemFileEntry).file(res, rej));
            yield { path, file };
        }
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
}
