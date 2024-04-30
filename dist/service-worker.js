importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js');

// Network first for all same-origin resources.
workbox.routing.registerRoute(/\//, new workbox.strategies.NetworkFirst());
