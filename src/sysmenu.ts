// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

import { dictionary } from './strings.js';
import { $, OPFS_GAMEDIR, addToast, confirm } from './utils.js';
import * as zip from './zip.js';
import { OPFSWriter } from './opfs_writer.js';

const dialog = $('#system-menu') as HTMLDialogElement;
const msgskip = $('#msgskip') as HTMLInputElement;

$('#system-menu-close').addEventListener('click', () => dialog.close());
$('#restart-game').addEventListener('click', () => {
    if (confirm(dictionary.restart_confirmation)) {
        gtag('event', 'RestartGame');
        window.shell.m._xsystem4_reset();
        dialog.close();
    }
});

// Close the dialog when clicked outside of the dialog.
dialog.addEventListener('click', () => dialog.close());
for (const e of Array.from(dialog.children)) {
    e.addEventListener('click', (e) => e.stopPropagation());
}
$('.toast-container').addEventListener('click', (e) => e.stopPropagation());


export function initSaveMenu(gameName: string) {
    $('#export-save').addEventListener('click', () => exportSave(gameName));
    $('#import-save').addEventListener('click', () => importSave(gameName));
}

export function open() {
    dialog.appendChild($('.toast-container'));  // So that toasts are not hidden by the dialog.
    msgskip.checked = window.shell.m._MsgSkip_GetState() !== 0;
    dialog.showModal();
}

dialog.addEventListener('close', () => {
    window.shell.m._MsgSkip_SetState(msgskip.checked ? 1 : 0);
    document.body.appendChild($('.toast-container'));
});

async function exportSave(gameName: string) {
    const z = new zip.ZipBuilder();
    async function walk(dir: FileSystemDirectoryHandle, pathInZip: string) {
        for await (const e of dir.values()) {
            const entryPathInZip = pathInZip + '/' + e.name;
            if (e.kind === 'directory') {
                z.addDir(entryPathInZip, new Date());
                await walk(e as FileSystemDirectoryHandle, entryPathInZip);
            } else if (e.kind === 'file') {
                const file = await (e as FileSystemFileHandle).getFile();
                const data = new Uint8Array(await file.arrayBuffer());
                z.addFile(entryPathInZip, data, new Date(file.lastModified));
            }
        }
    }
    const root = await navigator.storage.getDirectory();
    const gameRoot = await root.getDirectoryHandle(OPFS_GAMEDIR, { create: false });
    const saveDir = await gameRoot.getDirectoryHandle('SaveData', { create: false });
    z.addDir(gameName, new Date());
    z.addDir(gameName + '/SaveData', new Date());
    await walk(saveDir, gameName + '/SaveData');

    downloadAs(URL.createObjectURL(z.build()), `${gameName}_save.zip`);
    gtag('event', 'ExportSave');
}

function downloadAs(url: string, filename: string) {
    let elem = document.createElement('a');
    elem.setAttribute('download', filename);
    elem.setAttribute('href', url);
    document.body.appendChild(elem);
    elem.click();
    setTimeout(() => { document.body.removeChild(elem); }, 5000);
}

async function importSave(gameName: string) {
    const zipFile = await openFileInput();
    if (!zipFile) return;
    const files = await zip.load(zipFile);
    if (!files.every(f => f.name.startsWith(gameName + '/'))) {
        addToast(dictionary.not_savefiles_for(gameName), 'error');
        return;
    }
    const opfs_writer = new OPFSWriter(() => {});
    for (const file of files) {
        if (file.name.endsWith('/')) {
            continue;
        }
        const path = file.name.replace(`${gameName}/`, `/${OPFS_GAMEDIR}/`);
        await opfs_writer.writeZipFile(path, file);
    }
    gtag('event', 'ImportSave');
    if (confirm(dictionary.saves_imported)) {
        window.shell.m._xsystem4_reset();
        dialog.close();
    }
}

function openFileInput(): Promise<File | null> {
    return new Promise((resolve) => {
        let input = document.createElement('input');
        input.type = 'file';
        input.addEventListener('change', (evt: Event) => {
            document.body.removeChild(input);
            resolve(input.files![0]);
        });
        input.addEventListener('cancel', () => {
            document.body.removeChild(input);
            resolve(null);
        });
        input.style.display = 'none';
        document.body.appendChild(input);
        input.click();
    });
}
