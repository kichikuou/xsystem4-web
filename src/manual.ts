import { $ } from './utils.js';

const dialog = $('#manual-viewer') as HTMLDialogElement;
const iframe = $('#manual-iframe') as HTMLIFrameElement;

$('#manual-viewer-close').addEventListener('click', () => dialog.close());

// Close the dialog when clicked outside of the dialog.
dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
        dialog.close();
    }
});

export function open() {
    iframe.src = '/Manual/index.html';
    dialog.showModal();
}
