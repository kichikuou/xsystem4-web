import * as fsPromises from 'node:fs/promises';
import * as http from 'node:http';
import * as process from 'node:process';
import * as esbuild from 'esbuild';
import { makeSjisSubset } from './font-subset.js';

const logLevel = 'info';
const outdir = 'dist';

// An esbuild plugin that rewrites module specifiers for the external modules.
const resolveExternalModules = {
    name: 'resolveExternalModules',
    setup(build) {
        build.onResolve({ filter: /^[^.]/ }, async (args) => {
            switch (args.path) {
                case 'binaryen': return { path: './lib/binaryen.js', external: true };
            }
        })
    },
}

async function installExternalModules() {
    return Promise.all([
        fsPromises.copyFile('node_modules/binaryen/index.js', 'dist/lib/binaryen.js'),
        fsPromises.copyFile('node_modules/@picocss/pico/css/pico.min.css', 'dist/lib/pico.min.css'),
    ]);
}

async function buildFontSubset() {
    await makeSjisSubset('xsystem4/fonts/HanaMinA.ttf', 'dist/fonts/HanaMinA-SJIS.ttf');
    await makeSjisSubset('xsystem4/fonts/VL-Gothic-Regular.ttf', 'dist/fonts/VL-Gothic-Regular-SJIS.ttf');
}

async function runServer(ctx) {
    // Start esbuild's server on a random local port
    let { host, port } = await ctx.serve({ servedir: outdir });
    // Then start a proxy server on port 8080
    http.createServer((req, res) => {
        const options = {
            hostname: host,
            port: port,
            path: req.url,
            method: req.method,
            headers: req.headers,
        }

        // Forward each incoming request to esbuild
        const proxyReq = http.request(options, proxyRes => {
            if (req.url === '/play.html') {
                // Add COOP and COEP headers to the response from esbuild
                proxyRes.headers['Cross-Origin-Opener-Policy'] = 'same-origin';
                proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
            }
            // Forward the response to the client
            res.writeHead(proxyRes.statusCode, proxyRes.headers)
            proxyRes.pipe(res, { end: true })
        })

        // Forward the body of the request to esbuild
        req.pipe(proxyReq, { end: true })
    }).listen(8080)
    console.log(`Server running at http://localhost:8080/`);
}

const configs = [
    {
        entryPoints: ['src/index.ts', 'src/install.ts', 'src/play.ts', 'src/worker/installer_worker.ts'],
        plugins: [resolveExternalModules],
        bundle: true,
        external: ['./xsystem4.js'],
        minify: true,
        format: 'esm',
        target: ['esnext'],
        outdir,
        sourcemap: true,
        logLevel,
    },
];

for (const config of configs) {
    if (process.argv[2] === '--watch') {
        (await esbuild.context(config)).watch();
    } else if (process.argv[2] === '--serve') {
        config.logLevel = 'warning';  // Don't print backend server URLs
        await runServer(await esbuild.context(config));
    } else {
        esbuild.build(config);
    }
}

await fsPromises.mkdir('dist/lib', { recursive: true });
await fsPromises.mkdir('dist/fonts', { recursive: true });
await installExternalModules();
await buildFontSubset();
