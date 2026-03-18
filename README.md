# write-md

A tiny, **client-only** Markdown editor (no backend). It supports a visual editor and a raw Markdown editor, and stores documents in `localStorage`.

## Scope

- **Runs entirely in the browser** (static SPA)
- **Local documents**: saved to `localStorage`
- **Editors**:
  - Visual: TipTap (+ Markdown support)
  - Raw: CodeMirror 6 (optional Vim keybindings)

## Dependencies

- **Node.js**: 20+ recommended
- **Package manager**: npm
- **Note (macOS arm64)**: Vite 8 pulls in `rolldown`, which uses a native binding. Due to an npm optional-dependency install issue, this repo includes `@rolldown/binding-darwin-arm64` as an explicit dev dependency so `npm run build` works reliably on Apple Silicon.

## Development

```bash
npm install
npm run dev
```

## Basic usage

- **Select a document**: click its row/title in the sidebar.
- **Rename a document**: click the **✎** button on the document row (or use **Cmd/Ctrl + Shift + R**).
- **Delete a document**: click the **✕** button (you’ll be prompted if the doc isn’t empty).

Common scripts:

```bash
npm run build
npm run preview
npm run lint
```

## Deploy (GitHub Pages)

This repo includes a GitHub Actions workflow at `.github/workflows/deploy.yml` that builds the app and publishes the `dist/` output to GitHub Pages on pushes to `main`.

- In your repo: **Settings → Pages → Source → GitHub Actions**
- Push to `main`

### Custom domain (optional)

- Set the Vite base in `vite.config.js`:
  - Custom domain: `base: '/'`
  - Repo subpath: `base: '/<repo-name>/'`
- Update `public/CNAME` if you’re using a custom domain (GitHub Pages will publish it).
