# Helium Dither New Tab

A dark, local new-tab page for [Helium](https://helium.computer/) with Aura's
animated blue-noise photo treatment. It includes a clock, address/search box,
shortcuts, and an on-device wallpaper picker.

This is an unofficial fork of
[`mlemlabs/custom-helium-start`](https://github.com/mlemlabs/custom-helium-start).
It replaces the original dashboard implementation with a dependency-free
WebGL2 renderer modeled on Aura's animated photo shader.

## Features

- Aura-style four-step color dithering and moving blue-noise threshold
- Dissolving half-wallpaper fade over a black background
- The same bundled waterfall used by the reference Aura setup
- Local image selection; chosen images never leave the browser
- 15 FPS animation that pauses while the page is hidden
- Reduced-motion support
- No build step and no runtime dependencies

## Install in Helium

1. Download or clone this repository.
2. Open `helium://flags/#custom-ntp`.
3. Enable **Custom New Tab Page** and set its value to the absolute file URL
   for `index.html`, for example:

   ```text
   file:///Users/you/Hacks/custom-helium-start/index.html
   ```

4. Open `helium://settings/onStartup` and select **Open the New Tab page**.
5. Open a new tab.

Use the palette button in the lower-right corner to select a different image
or return to a plain dark background. Images are resized and stored in that
page's local browser storage.

## Search and shortcuts

The search box uses Google by default. Change `SEARCH_URL` in `app.js` to use a
different search engine. Shortcut destinations are plain links in `index.html`.

The page performs no background network requests. A network request occurs
only when you submit a search or open a shortcut.

## Attribution

This project is not affiliated with Helium or Imput. Helium names and marks
belong to their respective owners.

The original start-page project is MIT-licensed. The animated photo shader is
based on Aura and Paper Shaders. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
and the included `licenses/` directory for provenance and license texts.
