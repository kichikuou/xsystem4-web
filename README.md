# XSystem4 for Web

This is the source code for the [XSystem4 Web Installer](https://xsystem4-pwa.web.app)
website.

## Building the site

To build the site, you will need to have the following software installed:

- [Node.js](https://nodejs.org)
- [Emscripten](https://emscripten.org/)
- [CMake](https://cmake.org/)
- [Bison](https://www.gnu.org/software/bison/)
- [Flex](https://github.com/westes/flex)

First, clone the repository and install the dependencies:

```sh
git clone --recurse-submodules https://github.com/kichikuou/xsystem4-web.git
cd xsystem4-web
npm install
```

Then, build the site:

```sh
npm run build
```

The built site will be in the `dist` directory. You can serve the site locally
using the `serve` command:

```sh
npm run serve
```

## Running a game without installing

On desktop environments, you can run a game without installing it, by opening
`<server-address>/play.html` and dropping the game folder onto the page.

## License

The source code in this repository is licensed under the [MIT License](LICENSE).

[xsystem4](https://github.com/nunuhara/xsystem4) is licensed under
[GPL 2.0](https://github.com/kichikuou/xsystem4/blob/wasm/COPYING).

This site also uses the following open-source software:
- [Pico](https://picocss.com/) ([MIT License](https://github.com/picocss/pico/blob/v2.0.6/LICENSE.md))
- [Tabler Icons](https://tabler.io/icons) ([MIT License](https://tabler.io/license))
