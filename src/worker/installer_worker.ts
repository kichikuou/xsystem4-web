// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

// A worker that writes files to OPFS.
// This is necessary because OPFS is not writable from the main thread in Safari.
import { crc32 } from '../zip.js';

type WriteRequest = { command: 'write', path: string, data: Blob, compression?: CompressionFormat, crc32?: number };

export type InstallerWorkerRequest = WriteRequest;

export type InstallerWorkerResponse =
    { path: string, command: 'write', error: string | null }
  | { path: string, command: 'progress', value: number };

onmessage = async (e: MessageEvent) => {
    const req: InstallerWorkerRequest = e.data;
    try {
        if (req.command === 'write') {
            await write(req);
        } else {
            throw new Error('Unknown command: ' + req.command);
        }
        postMessage({ path: req.path, command: req.command, error: null });
    } catch (e) {
        postMessage({ path: req.path, command: req.command, error: e.message });
    }
};

async function write(req: WriteRequest) {
    let stream = createBlobStream(req.data);
    if (req.compression) {
        stream = stream.pipeThrough(new DecompressionStream(req.compression));
    }

    const file = await createFile(req.path);
    // Since Safari doesn't support FileSystemFileHandle.createWritable(),
    // we need to use sync access to write the file.
    const handle = await file.createSyncAccessHandle();

    const reader = stream.getReader();
    let crc = -1;
    // Stream is not async iterable in Safari.
    await new Promise<void>((resolve, reject) => {
        reader.read().then(function processChunk({ done, value }) {
            if (done) {
                handle.close();
                if (req.crc32 && ~crc !== req.crc32) {
                    reject(new Error('CRC32 mismatch'));
                    return;
                }
                resolve();
                return;
            }
            handle.write(value);
            crc = crc32(value, crc);
            postMessage({ path: req.path, command: 'progress', value: value.byteLength });
            reader.read().then(processChunk).catch(reject);
        }).catch(reject);
    });
}

// Since Blob::stram() in WebKit does not have a backpressure mechanism, using
// it with a large file can cause memory exhaustion. This function creates a
// ReadableStream that reads a blob in pull mode.
function createBlobStream(blob: Blob): ReadableStream<Uint8Array> {
    // return data.stream();
    let offset = 0;
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            if (offset >= blob.size) {
                controller.close();
                return;
            }
            let chunkSize = 1024 * 1024;
            if (offset + chunkSize > blob.size) {
                chunkSize = blob.size - offset;
            }
            const slice = blob.slice(offset, offset + chunkSize);
            offset += chunkSize;
            controller.enqueue(new Uint8Array(await slice.arrayBuffer()));
        }
    }, new CountQueuingStrategy({ highWaterMark: 2 }));
}

async function createFile(path: string) {
    const components = path.split('/');
    let dir = await navigator.storage.getDirectory();
    for (let i = 0; i < components.length - 1; i++) {
        if (!components[i]) continue;
        dir = await dir.getDirectoryHandle(components[i], { create: true });
    }
    return await dir.getFileHandle(components[components.length - 1], { create: true });
}
