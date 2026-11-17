# Personal portfolio

A small personal site with four pages: home, commits, logs and milestones.

🔗 **Live:** [mowtiie.cc](https://mowtiie.cc)

## Stack

- Plain HTML, CSS, and a small amount of JavaScript, with no build step and no framework
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/), self-hosted in `fonts/` under the OFL license
- Light and dark themes that follow the system, with a saved override from the toggle
- Deployed on [Vercel](https://vercel.com)

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Project list

The commits page is generated from my public GitHub repos by a Node script. The site itself stays static.

```bash
node scripts/update-projects.mjs
```

This needs Node 18 or newer. It fetches the repos, saves them to `scripts/projects.json`, and rewrites the project list in `commits/index.html`. Set `GITHUB_TOKEN` to avoid API rate limits.

To re-render from the saved data without calling the API:

```bash
node scripts/update-projects.mjs --cached
```

A daily GitHub Actions workflow (`.github/workflows/update-projects.yml`) runs the script and commits any change, which redeploys the site.

## License

[MIT](./LICENSE)
