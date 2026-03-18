# write-md

A fast, beautiful, **client-only** Markdown editor built with React and Vite. It runs entirely in your browser with zero backend requirements, storing all your documents safely in your browser's local storage.

## Features

- **Blazing Fast & Local**: No backend, no accounts. Everything is saved locally via IndexedDB/`localStorage` with automatic saving.
- **Dual Editors**:
  - **Visual Mode**: A rich-text, WYSIWYG editor powered by [TipTap](https://tiptap.dev/), with full Markdown support.
  - **Raw Mode**: A powerful plain-text Markdown editor built on [CodeMirror 6](https://codemirror.net/).
  - **Vim Mode**: Optional Vim keybindings for power users in Raw Mode.
- **Document Management**:
  - Organize and rename multiple documents from the sidebar.
  - **Fuzzy Search**: Instantly find any document by its title or content using the lightning-fast built-in search.
  - **Drag and Drop**: Simply drop `.md` or `.txt` files directly into the sidebar to import them instantly.
- **Customizable Workspace**:
  - Adjustable content wrap width for comfortable reading and writing.
  - Light and Dark themes.
- **Export & Stats**:
  - Download documents as `.md` files or print directly to PDF.
  - Live word count, character count, estimated read time, and storage usage statistics.

## Tech Stack

- **Framework**: React 19 + Vite 8
- **Editors**: TipTap (Visual) & CodeMirror 6 (Raw)
- **Search**: Fuse.js
- **Storage**: idb-keyval + localStorage

## Getting Started

### Prerequisites

- **Node.js**: 20+ recommended
- **Package manager**: npm

*Note for macOS (Apple Silicon) users: Vite 8 uses `rolldown` with native bindings. This repository explicitly includes `@rolldown/binding-darwin-arm64` as a dev dependency to ensure seamless builds on M1/M2/M3 chips.*

### Installation

Clone the repository and install the dependencies:

```bash
npm install
```

### Development

Start the local development server:

```bash
npm run dev
```

### Production Build

Build the application for production:

```bash
npm run build
```

You can preview the production build locally with:

```bash
npm run preview
```

## Keyboard Shortcuts

- **`Cmd/Ctrl + \`**: Toggle Sidebar
- **`Cmd/Ctrl + Shift + F`**: Search documents
- **`Cmd/Ctrl + Shift + K`**: Create new document
- **`Cmd/Ctrl + Shift + E`**: Toggle Visual/Raw mode
- **`Cmd/Ctrl + Shift + V`**: Switch to Raw mode with Vim keybindings
- **`Cmd/Ctrl + Shift + R`**: Rename current document
- **`Cmd/Ctrl + Shift + S`**: Download document as `.md`
- **`Cmd/Ctrl + P`**: Print current document
- **`Cmd/Ctrl + Shift + X`**: Close current document
- **`Cmd/Ctrl + /`**: Open shortcuts menu

## Deployment (GitHub Pages)

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys the `dist/` directory to GitHub Pages whenever you push to the `main` branch.

1. Go to your repository **Settings** → **Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Push your changes to `main`.

### Custom Domain

If you want to use a custom domain:
1. Update your Vite base path in `vite.config.js` (`base: '/'`). If hosting on a subpath, use `base: '/<repo-name>/'`.
2. Add your custom domain to `public/CNAME`.
