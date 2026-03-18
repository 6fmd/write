# write.md

A minimal markdown editor. Runs entirely in the browser — no server required.

## Features

- **WYSIWYG** editing via Tiptap with full markdown support
- **Raw mode** with CodeMirror 6 + optional vim keybindings
- **localStorage** persistence — documents survive page refresh
- **GitHub sync** — push/pull `.md` files to any repo via the GitHub API (PAT auth, no OAuth server needed)
- Deploys as a static SPA to GitHub Pages with a custom domain

## Stack

- Vite + React
- [Tiptap](https://tiptap.dev/) + [tiptap-markdown](https://github.com/aguingand/tiptap-markdown)
- [CodeMirror 6](https://codemirror.net/) + [@replit/codemirror-vim](https://github.com/replit/codemirror-vim)
- GitHub Contents API (client-side, no backend)

## Development

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `write-md`)
2. In repo Settings → Pages → Source, select **GitHub Actions**
3. Push this repo to `main` — the workflow in `.github/workflows/deploy.yml` handles the rest
4. Add a CNAME DNS record: `write.6f.md → <your-gh-username>.github.io`
5. In repo Settings → Pages → Custom domain, enter `write.6f.md` and enable "Enforce HTTPS"

## GitHub Sync

1. Create a GitHub PAT with `repo` scope at https://github.com/settings/tokens
2. In the editor sidebar, click **+ Connect GitHub**
3. Enter your token, owner (username or org), repo name, and optional path prefix
4. Use **↑ push** to write the current document to the repo, **↓ pull** to import all `.md` files from the configured path

Documents are stored as `<id>.md` files. The ID is a short random string generated on document creation.

> **Security note:** The PAT is stored in `localStorage` and is only ever sent to `api.github.com`. It never touches any intermediate server.
