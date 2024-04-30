// A worker that writes files to OPFS.
// This is necessary because OPFS is not writable from the main thread in Safari.

export type InstallerWorkerRequest =
  { command: 'write', path: string, data: Blob, compression?: CompressionFormat };

export type InstallerWorkerResponse =
    { path: string, command: 'write', error: string | null }
  | { path: string, command: 'progress', value: number };

onmessage = async (e: MessageEvent) => {
    const req: InstallerWorkerRequest = e.data;
    try {
        if (req.command === 'write') {
            await write(req.path, req.data, req.compression);
        } else {
            throw new Error('Unknown command: ' + req.command);
        }
        postMessage({ path: req.path, command: req.command, error: null });
    } catch (e) {
        postMessage({ path: req.path, command: req.command, error: e.message });
    }
};

async function write(path: string, data: Blob, compression?: CompressionFormat) {
    let stream = createBlobStream(data);
    if (compression) {
        stream = stream.pipeThrough(new DecompressionStream(compression));
    }

    const file = await createFile(path);
    // Since Safari doesn't support FileSystemFileHandle.createWritable(),
    // we need to use sync access to write the file.
    const handle = await file.createSyncAccessHandle();

    const reader = stream.getReader();
    // Stream is not async iterable in Safari.
    await new Promise<void>((resolve, reject) => {
        reader.read().then(function processChunk({ done, value }) {
            if (done) {
                handle.close();
                resolve();
                return;
            }
            handle.write(value);
            postMessage({ path, command: 'progress', value: value.byteLength });
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
