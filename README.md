# InkNest 2.0 — iPad writing and zoom update

InkNest is a standalone **offline-first note-taking progressive web app (PWA)**. It is inspired by notebook workflows, but is not Goodnotes and does not include or reproduce its proprietary code, artwork, branding or paid services.

## Update an existing GitHub Pages installation

**IMPORTANT: Back up your notes BEFORE upgrading.**

1. On your iPad, open the **existing InkNest** home-screen app. Tap the **three-dot menu → Export all notebooks (backup)**. Save the backup JSON to **Files → On My iPad**, or another safe location.
2. On Windows, unzip `InkNest-2.0-GitHub-Pages.zip`. You will see `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, and this `README.md`.
3. Go to the **same GitHub repository** where your current InkNest is published. Do **not** create a new repository or rename the current repository. Your existing local notes are tied to the app's website address.
4. On the repository home page, use **Add file → Upload files**, and upload the **individual extracted files**, not the ZIP. If GitHub prompts about replacing files with the same names, choose to replace them. Commit the changes to `main`.
5. Wait for deployment: **Settings → Pages** shows the published URL. On your iPad, open that exact URL in Safari while online, and refresh after deployment. Reopen the existing InkNest home-screen app. If it still shows the old UI, wait a minute and fully close/reopen it while online so Safari can activate the updated service worker.
6. **Do not clear Safari website data, delete the existing home-screen app, or change the GitHub Pages URL** to force a refresh. Doing so may delete or strand local notebooks. Keep your JSON backup safe.

### First-time installation

Publish extracted files in the root of a **public GitHub repository** using **Settings → Pages → Deploy from a branch → main → / (root)**. Open the generated HTTPS URL in iPad Safari, tap **Share → Add to Home Screen** and launch InkNest from the icon. You need online access once to cache the app.

## What's new in version 2

- **Responsive Apple Pencil ink**: drawing happens on a transparent, incremental ink canvas over the finished notebook canvas, instead of repainting all existing strokes on *every pointer move*. Uses Safari Pointer Events and coalesced samples where supported.
- **Zoom only on the paper**: pinch with two fingers directly on the sheet to zoom in and out; move the two fingers together to pan around. The drawing area is now scrollable even when the enlarged paper is wider than the viewport.
- **25%–400% zoom**, with `+`, `−`, and **Fit** controls. Resolution re-rasterizes after zoom stops to keep fine lines crisp.
- **Hand tool** for dragging the paper and **Pencil only** mode so one finger pans and Apple Pencil writes. For the smoothest classroom experience, turn **Pencil only** on when using Apple Pencil.
- **Shape tool** for straight lines, rectangles, and ellipses.
- **Pressure-responsive ink width** for Apple Pencil events that report pressure.
- **Faster undo** for ordinary pen strokes without cloning the entire page on each stroke.
- Updated offline service worker that prefers current assets when online and keeps assets cached for offline use.

## Existing functionality

Unlimited notebooks/pages (constrained by your device's storage), local IndexedDB autosave, pen/highlighter/eraser, editable typed text, on-iPad Scribble *inside text fields*, custom ink colors, custom paper colors including midnight, blank/grid/dotted/ruled paper, notebook search/rename/duplicate/delete, page management, photo insertion, PDF/PNG export and JSON backup/import.

## Important limitations

- This is **not a 100% Goodnotes replica**. There is no arbitrary-stroke handwriting-to-font converter, PDF import/annotation, OCR handwriting search, audio-synced notes, lasso, collaboration, or Goodnotes proprietary interface and recognition engine.
- A browser PWA cannot access all the Apple Pencil/PencilKit latency optimizations that a compiled iPadOS app can. It should be noticeably less laggy than version 1, but identical Goodnotes-level performance isn't guaranteed.
- Apple Pencil pressure, sampling rate, palm rejection and some gestures depend on your iPad, Apple Pencil model, Safari/iPadOS version, and available memory.
- All notebook **data** stays in the browser's IndexedDB on this iPad. GitHub Pages hosts app code only; it does not sync your notebooks to other devices.
- Local site data may be purged by iPadOS under storage pressure. **Export backup JSON regularly**. Do not use private browsing.
- Publishing to a different repository name, moving the app to a new domain or changing its URL can make previous local notes inaccessible, even though they may still exist in the original site's storage.

## Testing

Version 2 was checked for JavaScript syntax, HTML control ID integrity, and exercised in a headless Chromium session (including drawing, undo/redo, rectangle shape, dark/dotted paper, button zoom, fit, synthetic two-finger pinch and Pencil-only finger rejection). **It has not been tested on a physical iPad or real Apple Pencil**.

## Run on Windows for development

You can serve the extracted folder on your computer with Python: `python -m http.server 8000`, then open `http://localhost:8000` in your desktop browser. For the iPad home-screen installation use the hosted HTTPS GitHub Pages version.
