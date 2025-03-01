// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

import { Shell } from './shell.js'
import { dictionary } from './strings.js';
import { $, addToast, registerErrorHandlers } from './utils.js';

registerErrorHandlers();

if (localStorage.getItem('installed') !== 'true') {
    const url = new URL(location.href);
    if (url.searchParams.get('pwa')) {
        // The user has just added the PWA to the home screen.
        // Continue the installation process.
        document.cookie = "firebase-language-override=" + url.searchParams.get('lang') + "; max-age=315360000";
        location.href = './install.html' + url.hash;
    } else {
        addToast(dictionary.no_game_installed, 'error');
        gtag('event', 'GameNotInstalled');
    }
    $('#spinner').remove();
} else {
    window.shell = new Shell();
    persistStorage();
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
