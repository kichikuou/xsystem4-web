importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js');

// Return files from OPFS for /Manual/ paths.
workbox.routing.registerRoute(
  ({url}) => url.pathname.startsWith('/Manual/'),
  async ({url}) => {
    try {
      const opfsRoot = await navigator.storage.getDirectory();
      const filePath = `game${url.pathname}`; // e.g., game/Manual/index.html
      const components = filePath.split('/');
      let dirHandle = opfsRoot;
      for (let i = 0; i < components.length - 1; i++) {
        const component = components[i];
        if (!component) continue;
        dirHandle = await dirHandle.getDirectoryHandle(component);
      }
      const fileHandle = await dirHandle.getFileHandle(components[components.length - 1]);
      const file = await fileHandle.getFile();
      const headers = {
        'Content-Length': file.size.toString(),
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      };
      if (file.type) {
        headers['Content-Type'] = file.type;
      }
      return new Response(file.stream(), { headers });
    } catch (error) {
      console.error(`OPFS file not found: ${url.pathname}`, error);
      return new Response('File not found', { status: 404 });
    }
  }
);

// Network first for other same-origin resources.
workbox.routing.registerRoute(/\//, new workbox.strategies.NetworkFirst());
