# Portfolio

This is a minimal, doodle-themed personal site. Hand-built with plain HTML, CSS, and a small amount of JavaScript. One Three.js voxel scene for personality. Dark mode included.

## What's in it

- One-page layout — hero, about, things-I'm-into, work, contact
- Light / dark mode that remembers your choice across visits
- A draggable Three.js voxel scene in the hero (auto-rotates, pauses when grabbed)
- Doodle scribbles, squiggles, and hand-drawn frames as inline SVG
- Caveat (handwritten) for display, Geist for body
- Responsive down to mobile
- Respects `prefers-reduced-motion`
- ~45KB of source, no build step, no framework

## Stack

- Plain HTML, CSS, JavaScript
- [Three.js](https://threejs.org/) via ES module imports from unpkg
- Caveat + Geist via Google Fonts
- Deployed on [Vercel](https://vercel.com)

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure, name, tagline, social links, copy |
| `style.css` | All styling, theme tokens, responsive rules |
| `script.js` | Theme toggle, project rendering, scroll animations |
| `voxel.js` | The 3D voxel scene |
| `projects.js` | Project list — edit this to add work |

## Run locally

You can't just double-click `index.html` because the ES module import for Three.js needs a real HTTP server.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Or use the **Live Server** extension in VS Code.

## Customizing

**For the details.** In `index.html`, search-and-replace `yourname`, `Sam`, `you@yourname.com`, and `yourusername`. Edit the two paragraphs inside `<section class="about">`.

**For the photo.** Save it as `profile.jpg` in the project root. If the file isn't there, the site falls back to your initial letter.

**For the projects.** Open `projects.js`. Each project is an object with `title`, `description`, `tags` (array), `repo` (URL), and an optional `live` (URL). Copy a block to add one, delete to remove.

**For the voxel.** In `voxel.js`, the `buildScene` function is where the books and mug are drawn. Each `makeBox(width, height, depth, x, y, z, color)` is one cube — change sizes, positions, or add more.

## Deploy

Push this repo to GitHub, then on [Vercel](https://vercel.com):

1. Add New → Project → import this repo → Deploy
2. Settings → Domains → add your custom domain
3. Update DNS at your registrar with the records Vercel shows

Subsequent pushes auto-deploy.

## Credits

- [Three.js](https://threejs.org/) by mrdoob and contributors
- [Caveat](https://fonts.google.com/specimen/Caveat) and [Geist](https://fonts.google.com/specimen/Geist) via Google Fonts

## License

[MIT](./LICENSE)
