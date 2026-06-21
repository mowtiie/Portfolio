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

const menuToggle = document.getElementById('menu-toggle');
const primaryNav = document.getElementById('primary-nav');

if (menuToggle && primaryNav) {
  const closeMenu = () => {
    primaryNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
  };

  const openMenu = () => {
    primaryNav.classList.add('open');
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', 'Close menu');
  };

  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = primaryNav.classList.contains('open');
    isOpen ? closeMenu() : openMenu();
  });

  document.addEventListener('click', (e) => {
    if (!primaryNav.classList.contains('open')) return;
    if (!primaryNav.contains(e.target) && !menuToggle.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && primaryNav.classList.contains('open')) {
      closeMenu();
      menuToggle.focus();
    }
  });

  primaryNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
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

const awardList = document.getElementById('award-list');
const awards = window.AWARDS || [];

function awardItem(a) {
  const verify = a.link
    ? `<a class="award-verify" href="${escapeHtml(a.link)}" target="_blank" rel="noopener">verify →</a>`
    : '<span></span>';
  return `<li class="award">
    <h3 class="award-title">${escapeHtml(a.title)}</h3>
    <div class="award-meta">${escapeHtml(a.issuer)}</div>
    <div class="award-footer">
      <span class="award-year">${escapeHtml(a.year)}</span>
      ${verify}
    </div>
  </li>`;
}

if (awardList && awards.length) {
  awardList.innerHTML = awards.map(awardItem).join('');
} else if (awardList) {
  awardList.innerHTML = `<li style="color: var(--text-soft); list-style: none;">No awards yet. Edit <code>awards.js</code> to add some.</li>`;
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
