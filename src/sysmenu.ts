import type { MainModule as XSys4Module } from './xsystem4.js';
import { dictionary } from './strings.js';
import { $, HOMEDIR, addToast, confirm } from './utils.js';
import * as zip from './zip.js';

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


export function initSaveMenu(FS: XSys4Module['FS'], gameName: string) {
    $('#export-save').addEventListener('click', () => exportSave(FS, gameName));
    $('#import-save').addEventListener('click', () => importSave(FS, gameName));
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

function exportSave(FS: XSys4Module['FS'], gameName: string) {
    const z = new zip.ZipBuilder();
    function walk(dir: string) {
        for (const name of FS.readdir(dir)) {
            if (name[0] === '.') continue;
            const path = dir + '/' + name;
            const pathInZip = path.replace(`${HOMEDIR}/`, '');
            const stat = FS.stat(path, false);
            if (FS.isDir(stat.mode)) {
                z.addDir(pathInZip, stat.mtime);
                walk(path);
            } else {
                const data = FS.readFile(path);
                z.addFile(pathInZip, data, stat.mtime);
            }
        }
    }
    walk(HOMEDIR);

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

async function importSave(FS: XSys4Module['FS'], gameName: string) {
    const zipFile = await openFileInput();
    if (!zipFile) return;
    const files = await zip.load(zipFile);
    if (!files.every(f => f.name.startsWith(gameName + '/'))) {
        addToast(dictionary.not_savefiles_for(gameName), 'error');
        return;
    }
    for (const file of files) {
        const path = '.xsystem4/' + file.name;
        if (file.name.endsWith('/')) {
            try {
                FS.mkdir(path, undefined);
            } catch (e) {}
        } else {
            FS.writeFile(path, await file.extract());
        }
    }
    await new Promise<any>((res) => FS.syncfs(false, res));
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
