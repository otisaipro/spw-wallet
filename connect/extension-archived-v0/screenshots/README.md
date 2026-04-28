# Screenshot templates

Each `*.html` in this folder renders at the exact pixel size Chrome Web Store expects. You open it in a browser at 100% zoom and capture the outer `.frame` element as a PNG.

## Recommended capture method (Chrome DevTools)

1. Open the `.html` file in Chrome (drag-and-drop into a tab).
2. Press `F12` to open DevTools.
3. In the Elements panel, right-click the `<div class="frame">` node.
4. Choose **Capture node screenshot**.
5. Chrome saves a pixel-perfect PNG to your Downloads folder.

This method ignores window chrome, scrollbars, and zoom level — you always get the exact dimensions declared in CSS.

## Files

| File | Size | Purpose |
|---|---|---|
| `screenshot-1-hero.html` | 1280×800 | Main listing screenshot — dApp with Sign-in button + extension popup |
| `screenshot-2-popup.html` | 1280×800 | Close-up of the extension popup UI |
| `screenshot-3-code.html` | 1280×800 | Developer integration snippet |
| `promo-small.html` | 440×280 | Small promotional tile |
| `promo-marquee.html` | 1400×560 | Optional marquee promo |

## Output target

Save the PNGs under `screenshots/out/` (gitignored). Upload them to the Chrome Web Store dashboard alongside `icons/icon-128.png`.

## Quick sanity check on dimensions

```bash
file screenshots/out/*.png    # should print "PNG image data, 1280 x 800" etc.
```
