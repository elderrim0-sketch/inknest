# InkNest — Offline iPad Notebooks

A self-contained **progressive web app (PWA)** for school notes, inspired by the general notebook/drawing workflow of Goodnotes. InkNest is independent software; it does not copy Goodnotes code, assets, or branding.

## What's included

- Unlimited notebooks and unlimited pages (limited only by your device's available storage).
- Pencil / finger drawing, highlighter, eraser, and adjustable pen colors and thickness.
- Auto-save to **IndexedDB on the same device**. No login, no servers, no paid tiers.
- Blank, graph-grid, lined, and dot-grid paper.
- White, black, pastel, and any custom page color; optionally apply paper style to every page.
- Neat editable text blocks using the `T` tool. iPadOS **Scribble** can convert Apple Pencil handwriting to typed text **inside the text entry field**.
- Insert photos into a page from Files or Photos.
- Add/delete pages, duplicate pages or whole notebooks, rename notebooks, search, undo and redo.
- Export entire notebooks as PDF, export the current page as PNG.
- Download **JSON backups of all notebooks** and restore them later.
- After initial HTTPS installation, the app works offline using a service worker.

**Not yet included:** OCR conversion of arbitrary pen strokes, audio recording, PDF importing/editing, collaboration, handwriting search, handwriting math recognition, and exact Goodnotes feature parity. For an **on-device handwriting-to-neat-text conversion button**, see the separate native iOS project.

## Install on your iPad — no Mac needed

A web app must be hosted at an HTTPS URL for reliable offline installation and storage. Hosting its static code is NOT cloud storage for your notes; your notebook data stays in the browser on the iPad.

### Free GitHub Pages route

1. Unzip `InkNest-Web.zip`.
2. On github.com, create a new **public** repository, e.g. `inknest`.
3. Use **Add file → Upload files** to upload the actual files `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png` **into the root of the repository**, not into an extra nested folder. Commit the files.
4. In the repository go to **Settings → Pages**. Choose **Deploy from a branch**, choose `main`, `/ (root)`, and Save.
5. Open the published website URL (usually `https://YOUR_USERNAME.github.io/inknest/`) in **Safari on your iPad**.
6. Tap **Share → Add to Home Screen → Add**. Open **InkNest** from the new Home Screen icon.
7. Open the app online once, then it can run without a network connection.

You may use any other static HTTPS host if you prefer (Netlify, Cloudflare Pages, etc.).

### School-use notes

- Safari/iPadOS can clear site data when storage is low or you clear browsing data. **Export a backup often** from the top-right `···` menu → *Export all notebooks (backup)*, and save the JSON file in On My iPad.
- If you use a different browser, private browsing, different website URL, or a different device, your locally saved notebooks will not automatically appear.
- A private/incognito window is not recommended for important schoolwork.
- Do not delete the iPad app, clear its site data, or reset your iPad without saving a backup.
- The `T` tool uses clean system text. On supported iPads, Apple Pencil **Scribble** works in the typing box, but the browser version does NOT automatically turn existing hand-drawn ink into a font.
- Apple Pencil pressure support depends on Safari/iPadOS. Drawing with your finger also works.

## Local development

From this directory, start any static server, for example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000` in your desktop browser. For iPad installation, publish through HTTPS.

## Project structure

- `index.html`: all app screens and controls
- `styles.css`: responsive iPad/tablet layout
- `app.js`: notebook model, drawing engine, IndexedDB, export/import, interactions
- `sw.js`: offline cache for static app files
- `manifest.webmanifest`, `icon-*.png`: Add to Home Screen support

No frameworks, ads, analytics, accounts, CDNs, or external packages.
