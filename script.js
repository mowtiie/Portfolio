const meta = document.querySelector('meta[name="color-scheme"]');
const toggle = document.getElementById('theme-toggle');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

const SYSTEM = 'light dark';

function renderedScheme() {
  if (meta.content === 'dark' || meta.content === 'light') return meta.content;
  return systemDark.matches ? 'dark' : 'light';
}

function applyStored(value) {
  meta.content = value ?? SYSTEM;
}

if (toggle && meta) {
  toggle.addEventListener('click', () => {
    // Target is the opposite of what the user sees right now.
    const target = renderedScheme() === 'dark' ? 'light' : 'dark';
    const system = systemDark.matches ? 'dark' : 'light';

    // Matching the system means undoing an override; don't pin it.
    const stored = target === system ? null : target;
    applyStored(stored);

    try {
      if (stored) localStorage.setItem('color-scheme', stored);
      else localStorage.removeItem('color-scheme');
    } catch {}
  });

  // Keep other open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key === 'color-scheme' || e.key === null) applyStored(e.newValue);
  });
}
