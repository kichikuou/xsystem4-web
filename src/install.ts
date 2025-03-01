// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

import { dictionary } from './strings.js';
import { $, OPFS_GAMEDIR, addToast, dirname, loadGameIni, registerErrorHandlers } from './utils.js';
import * as zip from './zip.js';
import { OPFSWriter } from './opfs_writer.js';

$('#file-picker').addEventListener('change', async (evt: Event) => {
    const files = (evt.target as HTMLInputElement).files!;
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        await InstallFromZip(files[0]);
    } else {
        addToast(dictionary.not_a_zip_file, 'warning');
        gtag('event', 'InstallError', { Reason: 'No ZIP file selected' });
    }
}, false);

// Extract game files under '/game' OPFS directory.
export async function InstallFromZip(zipFile: File) {
    const files = await zip.load(zipFile);
    const ini = await loadGameIni(files);
    if (!ini) {
        addToast(dictionary.no_game_data_in_zip, 'error');
        gtag('event', 'InstallError', { Reason: 'No game data found in ZIP' });
        return;
    }

    const progress = new InstallProgress(files.reduce((sum, f) => sum + f.uncompressedSize, 0));
    const opfs_writer = new OPFSWriter((_, n) => progress.increase(n));

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
                await opfs_writer.writeZipFile(path, file);
                break;
            } catch (e) {
                gtag('event', 'InstallWorkerError', { Message: e, RetryCount: retryCount });
                if (++retryCount >= 3) {
                    addToast(dictionary.file_write_error + `\n${e}`, 'error');
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
        $('#message').textContent = dictionary.installation_finished;
        $('#game-start').hidden = false;
    }
}
registerErrorHandlers();

const url = new URL(location.href);
$('#title').textContent = decodeURIComponent(url.hash.slice(1));
