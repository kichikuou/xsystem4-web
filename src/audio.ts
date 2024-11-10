// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

import { $ } from './utils.js';

export class Audio {
    private context: AudioContext;
    private masterGain: GainNode;

    constructor() {
        this.context = new AudioContext({ latencyHint: 'balanced' });
        this.masterGain = this.context.createGain();
        this.masterGain.connect(this.context.destination);
        this.autoResumeAudioContext();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.context.resume();
            }
        });
    }

    getDestNode() {
        if (this.context.state === 'suspended') {
            this.context.resume();
        }
        return this.masterGain;
    }

    resumeContext() {
        this.context.resume();
    }

    private autoResumeAudioContext() {
        if (this.context.state !== 'suspended') return;
        $('#mute-indicator').hidden = false;
        this.context.resume();
        [document, $('#canvas')].forEach((el) => {
            ['keydown', 'mousedown', 'touchstart', 'touchend'].forEach((event) => {
                el.addEventListener(event, () => {
                    if (this.context.state === 'suspended') {
                        this.context.resume();
                    }
                    $('#mute-indicator').hidden = true;
                }, { once: true });
            });
        });
    }
}
