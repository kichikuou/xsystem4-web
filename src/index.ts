import { extractIconFromExe } from './icon_extractor.js';
import { $, addToast, basename, dirname, loadGameIni, registerErrorHandlers } from './utils.js';
import * as zip from './zip.js';

$('#file-picker').addEventListener('change', (evt: Event) => {
    const files = (evt.target as HTMLInputElement).files!;
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        handleZip(files[0]);
    } else {
        addToast('ZIPファイルを選択してください。', 'warning');
        gtag('event', 'InstallError', { Reason: 'No ZIP file selected' });
    }
}, false);

export async function handleZip(zipFile: File) {
    const files = await zip.load(zipFile);
    const ini = await loadGameIni(files);
    if (!ini) {
        if (files.find(f => f.name.match(/SA\.ALD$/i))) {
            addToast('System3.xのゲームです。鬼畜王 on Webをご利用ください。', 'error');
            gtag('event', 'InstallError', { Reason: 'System 3.x game data' });
        } else {
            addToast('ZIPファイルにゲームデータが見つかりません。', 'error');
            gtag('event', 'InstallError', { Reason: 'No game data found in ZIP' });
        }
        return;
    }

    let icon: Uint8Array | null = null;
    // Find an .ico file.
    const iniDir = dirname(ini.iniPath);
    const iconFile = files.find(f => dirname(f.name) === iniDir && f.name.toLowerCase().endsWith('.ico'));
    if (iconFile) {
        icon = await iconFile.extract();
    } else {
        // Find an .exe file and extract an icon from it.
        const exeFile = files.find((f) => {
            if (dirname(f.name) !== iniDir) return false;
            const lowerName = basename(f.name).toLowerCase();
            return lowerName.endsWith('.exe') &&
                   lowerName !== 'opensavefolder.exe' &&
                   lowerName !== 'resetconfig.exe' &&
                   lowerName !== 'uninstaller.exe';
        });
        if (exeFile) {
            icon = extractIconFromExe((await exeFile.extract()).buffer);
        }
    }

    await generateManifest(ini.gameName, icon);
    gtag('event', 'ManifestGenerated', { Title: ini.gameName });
    ($('#add-to-home-screen') as HTMLDialogElement).showModal();
}

async function generateManifest(title: string, icon: Uint8Array | null) {
    if (icon) {
        await new Promise<void>((res, rej) => {
            const blob = new Blob([icon], { type: 'image/x-icon' });
            const reader = new FileReader();
            reader.onload = () => {
                const link = document.createElement('link');
                link.rel = 'apple-touch-icon';
                link.href = reader.result as string;
                document.head.appendChild(link);
                res();
            };
            reader.onerror = rej;
            reader.readAsDataURL(blob);
        });
    }
    const baseUrl = new URL(location.href);
    const startUrl = new URL('play.html?pwa=1#' + encodeURIComponent(title), baseUrl);

    const manifest = {
        name: title + ' - XSystem4 for Web',
        short_name: title,
        start_url: startUrl.href,
        display: 'standalone',
        background_color: '#000',
        theme_color: '#525f7a'
    };
    console.log(manifest);
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
    document.head.appendChild(link);
}

registerErrorHandlers();

if (!navigator.storage || !navigator.storage.estimate) {
    ($('#file-picker') as HTMLInputElement).disabled = true;
    addToast('このブラウザでは動作しません。iOS / iPadOS 17以上が必要です。', 'error');
    gtag('event', 'UnsupportedBrowser');
}
