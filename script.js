const root = document.documentElement;
const toggle = document.getElementById('theme-toggle');

const stored = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialTheme = stored || (prefersDark ? 'dark' : 'light');
root.setAttribute('data-theme', initialTheme);

if (toggle) {
  toggle.addEventListener('click', () => {
    const current = root.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

const grid = document.getElementById('project-grid');
const projects = window.PROJECTS || [];

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function projectCard(p) {
  const tags = Array.isArray(p.tags) && p.tags.length
    ? `<div class="project-tags">${p.tags.map(t => `<span class="project-tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const links = [];
  if (p.repo) links.push(`<a href="${escapeHtml(p.repo)}" target="_blank" rel="noopener">code →</a>`);
  if (p.live) links.push(`<a href="${escapeHtml(p.live)}" target="_blank" rel="noopener">live →</a>`);
  const linksHtml = links.length ? `<div class="project-links">${links.join('')}</div>` : '';

  return `<article class="project-card">
    <h3 class="project-title">${escapeHtml(p.title)}</h3>
    <p class="project-desc">${escapeHtml(p.description)}</p>
    ${tags}
    ${linksHtml}
  </article>`;
}

if (grid && projects.length) {
  grid.innerHTML = projects.map(projectCard).join('');
} else if (grid) {
  grid.innerHTML = `<p style="color: var(--text-soft);">No projects yet. Edit <code>projects.js</code> to add some.</p>`;
}

if ('IntersectionObserver' in window) {
  const drawObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('drawn');
        drawObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.draw-path').forEach((path) => {
    drawObserver.observe(path);
  });
} else {
  document.querySelectorAll('.draw-path').forEach((p) => p.classList.add('drawn'));
}

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();
