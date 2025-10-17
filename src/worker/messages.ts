// Copyright (c) 2025 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

export type WriteRequest = { command: 'write', path: string, data: Blob, compression?: CompressionFormat, crc32?: number };

export type InstallerWorkerRequest = WriteRequest;

export type InstallerWorkerResponse =
    { path: string, command: 'write', error: string | null }
  | { path: string, command: 'progress', value: number };
