// Refreshes the project ledger from your public GitHub repos.
// Usage: node scripts/update-projects.mjs
// The site itself needs no build step: this only rewrites static HTML.
//
// It fills the <!-- projects:start --> ... <!-- projects:end --> block in projects/index.html
// with the ledger and its filters.

import { readFile, writeFile } from 'node:fs/promises';

const USER = 'mowtiie';
const PROJECTS_PAGE = new URL('../projects/index.html', import.meta.url);

// Repos that are not projects (profile README, this site).
const EXCLUDE = new Set(['mowtiie', 'Portfolio']);

// Application type, taken from the first rule whose topics match a repo.
const TYPES = [
  { slug: 'android-app', label: 'Android app', topics: ['android'] },
  { slug: 'discord-bot', label: 'Discord bot', topics: ['discord-bot'] },
  { slug: 'desktop-app', label: 'Desktop app', topics: ['desktop', 'gtk4', 'windows', 'linux'] },
  { slug: 'web-app', label: 'Web app', topics: ['website', 'aspnet-core', 'web-api'] },
  { slug: 'config', label: 'Config', topics: ['dotfiles', 'neovim', 'neovim-config'] },
];
const OTHER = { slug: 'other', label: 'Other' };

// Projects with at least this many stars get a stronger star count.
const STARRED_AT = 10;

// Sample queries shown in the query panel. Each one runs when clicked.
const EXAMPLES = [
  { query: "platform = 'Android app' AND language = 'Kotlin'", note: 'Kotlin Android apps' },
  { query: "language IN ('Java', 'Kotlin') ORDER BY updated DESC", note: 'Java or Kotlin, newest first' },
  { query: "description LIKE '%offline%'", note: 'Anything offline-first' },
  { query: 'stars > 0 ORDER BY stars DESC', note: 'Projects with stars' },
  { query: 'SELECT * FROM projects ORDER BY updated DESC LIMIT 5', note: 'The five most recent' },
  { query: "platform != 'Android app' ORDER BY name", note: 'Everything except Android apps' },
  { query: "name LIKE 'f%'", note: 'Names starting with F' },
  { query: 'kotlin', note: 'Just search for a word' },
];

const DEFAULT_QUERY = 'SELECT * FROM projects';

// Small outline icons for the filter pills. They are decorative, so the label does the talking.
const icon = (paths) =>
  `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  platform: icon('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  language: icon('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>'),
  query: icon('<path d="M4 7l5 5-5 5M12 18h8"/>'),
};

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slugify = (text) =>
  text.toLowerCase().replace(/#/g, '-sharp').replace(/\+/g, '-plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const typeOf = (repo) =>
  TYPES.find((type) => type.topics.some((topic) => repo.topics?.includes(topic))) ?? OTHER;

const monthYear = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toLowerCase();

async function fetchProjects() {
  const url = `https://api.github.com/users/${USER}/repos?per_page=100&type=owner`;
  const headers = { 'User-Agent': 'portfolio-update-projects' };
  // In GitHub Actions, the built-in token lifts the rate limit that shared runner addresses hit quickly.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GitHub API responded ${response.status}`);
  const repos = await response.json();
  return repos
    .filter((repo) => !repo.fork && !repo.archived && !EXCLUDE.has(repo.name))
    // Most recently touched first.
    .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at))
    .map((repo) => {
      const type = typeOf(repo);
      const language = repo.language ?? '';
      return { repo, type, language, languageSlug: language ? slugify(language) : '' };
    });
}

function renderItem({ repo, type, language, languageSlug }) {
  const description = repo.description ? `\n        <p class="project-desc">${escapeHtml(repo.description)}</p>` : '';
  const stars = repo.stargazers_count;
  const starred = stars >= STARRED_AT ? ' is-starred' : '';
  const starsText = stars ? `${stars} ${stars === 1 ? 'star' : 'stars'}` : '';
  return `      <li class="project note" data-platform="${type.slug}" data-language="${languageSlug}">
        <a class="project-name" href="${repo.html_url}" target="_blank" rel="noopener">${escapeHtml(repo.name)}<span class="visually-hidden"> (opens in a new tab)</span></a>${description}
        <p class="project-meta">
          <span class="meta-platform">${type.label}</span>
          <span class="meta-language">${escapeHtml(language)}</span>
          <span class="meta-stars${starred}">${starsText}</span>
          <time class="meta-date" datetime="${repo.pushed_at.slice(0, 10)}">${monthYear(repo.pushed_at)}</time>
        </p>
      </li>`;
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

// A pill button that opens a menu of checkboxes.
function renderFilter(name, label, entries, labels) {
  const items = entries
    .map(([slug, count]) =>
      `          <label class="menu-item"><input type="checkbox" data-group="${name}" value="${slug}"><span class="menu-label">${escapeHtml(labels.get(slug))}</span><span class="chip-count">${count}</span></label>`)
    .join('\n');
  return `        <div class="filter">
          <button type="button" class="pill" id="pill-${name}" aria-expanded="false" aria-controls="menu-${name}">
            ${ICONS[name]}<span>${label}</span><span class="pill-count" hidden></span>
          </button>
          <div class="menu" id="menu-${name}" role="group" aria-labelledby="pill-${name}" hidden>
${items}
            <p class="menu-note" hidden></p>
          </div>
        </div>`;
}

// The query bar, its short reference and the sample queries.
function renderQueryPanel() {
  const examples = EXAMPLES
    .map(({ query, note }) =>
      `            <li><button type="button" class="example"><code>${escapeHtml(query)}</code><span>${escapeHtml(note)}</span></button></li>`)
    .join('\n');
  return `        <div class="query-panel" id="query-panel" hidden>
          <label class="query-label" for="query-input">Query</label>
          <textarea class="query-input" id="query-input" rows="2" spellcheck="false" autocomplete="off" autocapitalize="off" aria-invalid="false" data-error="query-error">${DEFAULT_QUERY}</textarea>
          <p class="query-error" id="query-error" role="status"></p>
          <p class="query-help-title" id="examples-title">Examples (press one to run it)</p>
          <ul class="query-examples" role="group" aria-labelledby="examples-title">
${examples}
          </ul>
          <details class="query-reference">
            <summary>Reference</summary>
            <p class="query-help-title">Fields</p>
            <p class="query-fields"><code>name</code> <code>description</code> <code>platform</code> <code>language</code> <code>stars</code> <code>updated</code></p>
            <p class="query-help-title">Operators</p>
            <p class="query-fields"><code>=</code> <code>!=</code> <code>&lt;</code> <code>&lt;=</code> <code>&gt;</code> <code>&gt;=</code></p>
            <p class="query-help-title">Keywords</p>
            <p class="query-fields"><code>AND</code> <code>OR</code> <code>NOT</code> <code>IN</code> <code>LIKE</code> <code>ORDER BY</code> <code>LIMIT</code></p>
            <p class="query-note">Case doesn't matter, and <code>SELECT * FROM projects</code> is optional. A bare word searches names and descriptions. <code>%</code> in <code>LIKE</code> matches anything.</p>
          </details>
        </div>`;
}
function renderProjectsBlock(projects) {
  const labels = new Map();
  for (const { type, language, languageSlug } of projects) {
    labels.set(type.slug, type.label);
    if (language) labels.set(languageSlug, language);
  }
  const platformEntries = countBy(projects.map((item) => item.type.slug));
  const languageEntries = countBy(projects.filter((item) => item.language).map((item) => item.languageSlug));

  return `<div class="filters">
${renderFilter('platform', 'Platform', platformEntries, labels)}
${renderFilter('language', 'Language', languageEntries, labels)}
        <button type="button" class="filter-reset" hidden>Clear filters</button>
        <button type="button" class="pill pill-query" id="pill-query" aria-expanded="false" aria-controls="query-panel">${ICONS.query}<span>Query</span></button>
${renderQueryPanel()}
      </div>
      <p class="filter-status" role="status">${projects.length} projects</p>
      <p class="filter-empty" hidden>No projects match those filters. <button type="button" class="filter-clear">Clear filters</button></p>
      <ul class="project-list">
${projects.map(renderItem).join('\n')}
      </ul>`;
}

async function replaceBlock(file, name, content) {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const html = await readFile(file, 'utf8');
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end);
  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`Add ${start} and ${end} markers to ${file.pathname} first.`);
  }
  await writeFile(file, `${html.slice(0, startIndex + start.length)}\n      ${content}\n      ${html.slice(endIndex)}`);
}

const projects = await fetchProjects();
await replaceBlock(PROJECTS_PAGE, 'projects', renderProjectsBlock(projects));
console.log(`Wrote ${projects.length} projects`);
