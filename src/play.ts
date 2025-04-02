// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

import { Shell } from './shell.js'
import { dictionary } from './strings.js';
import { $, addToast, registerErrorHandlers } from './utils.js';
import createFsModule from '@irori/idbfs';
import { OPFSWriter } from './opfs_writer.js';

registerErrorHandlers();

if (localStorage.getItem('installed') !== 'true') {
    const url = new URL(location.href);
    if (url.searchParams.get('pwa')) {
        // The user has just added the PWA to the home screen.
        // Continue the installation process.
        document.cookie = "firebase-language-override=" + url.searchParams.get('lang') + "; max-age=315360000";
        location.href = './install.html' + url.hash;
        localStorage.setItem('savefile_migrated', 'true');  // no need to migrate save files
    } else {
        addToast(dictionary.no_game_installed, 'error');
        gtag('event', 'GameNotInstalled');
    }
    $('#spinner').remove();
} else {
    await migrateSaveFiles();
    window.shell = new Shell();
    persistStorage();
}

async function migrateSaveFiles() {
    if (localStorage.getItem('savefile_migrated')) return;
    const HOMEDIR = '/.xsystem4';
    const idbfs = await createFsModule();
    const fs = idbfs.FS;
    fs.mkdir(HOMEDIR, undefined);
    fs.mount(fs.filesystems.IDBFS, {}, HOMEDIR);
    await new Promise<any>((res) => fs.syncfs(true, res));
    const opfs_writer = new OPFSWriter(() => {});
    for (const saveRoot of fs.readdir(HOMEDIR)) {
        if (saveRoot.startsWith('.')) continue;
        const copyRecursively = async (idbfsDir: string, opfsDir: string) => {
            for (const fname of fs.readdir(idbfsDir)) {
                if (fname.startsWith('.')) continue;
                const idbfsPath = idbfsDir + '/' + fname;
                const opfsPath = opfsDir + '/' + fname;
                if (fs.isDir(fs.stat(idbfsPath, undefined).mode)) {
                    await copyRecursively(idbfsPath, opfsPath);
                } else {
                    const data = fs.readFile(idbfsPath, { encoding: 'binary' });
                    console.log('Migrating save file:', idbfsPath, '->', opfsPath);
                    await opfs_writer.writeFile(opfsPath, data);
                }
            }
        }
        await copyRecursively(HOMEDIR + '/' + saveRoot + '/SaveData', '/game/SaveData');
    }
    localStorage.setItem('savefile_migrated', 'true');
}

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

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
}
