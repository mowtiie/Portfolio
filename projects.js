// Filters and the query bar for the project list.
// The list is plain HTML, so without JavaScript every project is still visible.

const filters = document.querySelector('.filters');

if (filters) {
  const DEFAULT_QUERY = 'SELECT * FROM projects';
  const GROUPS = ['platform', 'language'];

  // The fields a query can use, and what kind of value each one holds.
  const FIELDS = { name: 'text', description: 'text', platform: 'enum', language: 'enum', stars: 'number', updated: 'date' };
  const KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'LIKE', 'IN', 'ORDER', 'BY', 'ASC', 'DESC', 'LIMIT']);

  const list = document.querySelector('.project-list');
  const statusLine = document.querySelector('.filter-status');
  const emptyState = document.querySelector('.filter-empty');
  const resetButton = filters.querySelector('.filter-reset');
  const filterEls = [...filters.querySelectorAll('.filter')];
  const boxes = [...filters.querySelectorAll('input[type="checkbox"]')];
  const queryToggle = filters.querySelector('.pill-query');
  const queryPanel = document.getElementById('query-panel');
  const queryInput = document.getElementById('query-input');
  const queryError = document.getElementById('query-error');

  // Each project, read once from the page.
  const rows = [...list.querySelectorAll('.project')].map((el, index) => ({
    el,
    index,
    name: el.querySelector('.project-name').firstChild.textContent.trim(),
    description: el.querySelector('.project-desc')?.textContent.trim() ?? '',
    platform: el.querySelector('.meta-platform').textContent.trim(),
    platformSlug: el.dataset.platform,
    language: el.querySelector('.meta-language').textContent.trim(),
    languageSlug: el.dataset.language,
    stars: parseInt(el.querySelector('.meta-stars').textContent, 10) || 0,
    updated: el.querySelector('time').dateTime,
  }));

  const normalize = (text) => text.trim().toLowerCase();

  // Same rule the page generator uses, so 'Android app' and 'C#' match their slugs.
  const slugify = (text) =>
    text.toLowerCase().replace(/#/g, '-sharp').replace(/\+/g, '-plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // ---------- Reading a query ----------

  class QueryError extends Error {}

  function distance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const kept = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = kept;
      }
    }
    return row[b.length];
  }

  function unknownField(name) {
    let guess = null;
    let best = 3;
    for (const field of Object.keys(FIELDS)) {
      const d = distance(name.toLowerCase(), field);
      if (d < best) {
        guess = field;
        best = d;
      }
    }
    return `There's no field called '${name}'. ${guess ? `Did you mean '${guess}'?` : `The fields are ${Object.keys(FIELDS).join(', ')}.`}`;
  }

  // Splits the text into words, quoted strings, operators and brackets.
  function tokenize(source) {
    const tokens = [];
    const pattern = /\s*(?:('(?:[^']|'')*'|"(?:[^"]|"")*")|(<=|>=|<>|!=|=|<|>)|([(),*])|([^\s(),=<>!'"*]+))/y;
    let position = 0;

    while (position < source.length) {
      pattern.lastIndex = position;
      const match = pattern.exec(source);
      if (!match) {
        const rest = source.slice(position).trimStart();
        if (!rest) break;
        throw new QueryError(rest[0] === "'" || rest[0] === '"' ? 'A quote is never closed.' : `I don't understand '${rest[0]}'.`);
      }
      position = pattern.lastIndex;

      const [, text, operator, punctuation, word] = match;
      if (text !== undefined) {
        tokens.push({ type: 'string', value: text.slice(1, -1).replaceAll(text[0] + text[0], text[0]) });
      } else if (operator) {
        tokens.push({ type: 'op', value: operator === '<>' ? '!=' : operator });
      } else if (punctuation) {
        tokens.push({ type: 'punct', value: punctuation });
      } else {
        tokens.push({ type: 'word', value: word });
      }
    }
    return tokens;
  }

  // Turns query text into { where, order, limit }, or throws a QueryError that says what is wrong.
  // The syntax is forgiving on purpose: any case, optional SELECT and WHERE, bare words are searches.
  function parse(source) {
    const tokens = tokenize(source);
    let at = 0;

    const upper = (token) => (token?.type === 'word' ? token.value.toUpperCase() : '');
    const isWord = (name) => upper(tokens[at]) === name;
    const accept = (name) => {
      if (!isWord(name)) return false;
      at++;
      return true;
    };
    const isPunct = (char) => tokens[at]?.type === 'punct' && tokens[at].value === char;
    const expectPunct = (char, message) => {
      if (!isPunct(char)) throw new QueryError(message);
      at++;
    };

    function valueAfter(what) {
      const token = tokens[at];
      const missing = !token || token.type === 'op' || token.type === 'punct' || (token.type === 'word' && KEYWORDS.has(upper(token)));
      if (missing) throw new QueryError(`I expected a value after ${what}.`);
      at++;
      return token.value;
    }

    function checkedValue(field, what) {
      const value = valueAfter(what);
      if (FIELDS[field] === 'number' && (value === '' || Number.isNaN(Number(value)))) {
        throw new QueryError(`'${field}' is a number, so '${value}' won't work.`);
      }
      return value;
    }

    function parseComparison(field) {
      const kind = FIELDS[field];
      const negated = accept('NOT');
      let op;
      if (!negated && tokens[at]?.type === 'op') op = tokens[at++].value;
      else if (accept('LIKE')) op = 'LIKE';
      else if (accept('IN')) op = 'IN';
      else throw new QueryError(`After '${field}' I expected =, !=, <, >, LIKE or IN.`);

      if (op === 'LIKE' && (kind === 'number' || kind === 'date')) {
        throw new QueryError(`LIKE works on text, and '${field}' isn't text.`);
      }
      if (['<', '<=', '>', '>='].includes(op) && (kind === 'text' || kind === 'enum')) {
        throw new QueryError(`'${field}' is text, so use =, != or LIKE.`);
      }

      let node;
      if (op === 'IN') {
        expectPunct('(', "After IN I expected a list like ('a', 'b').");
        const values = [checkedValue(field, `'${field} IN ('`)];
        while (isPunct(',')) {
          at++;
          values.push(checkedValue(field, "the comma"));
        }
        expectPunct(')', "The list is missing its closing ')'.");
        node = { type: 'cmp', field, op, values };
      } else {
        node = { type: 'cmp', field, op, value: checkedValue(field, `'${field} ${op}'`) };
      }
      return negated ? { type: 'not', node } : node;
    }

    function parsePrimary() {
      const token = tokens[at];
      if (!token) throw new QueryError('The query ends too early.');

      if (isPunct('(')) {
        at++;
        const node = parseOr();
        expectPunct(')', "I'm missing a closing ')'.");
        return node;
      }

      const next = tokens[at + 1];
      const comparisonFollows = next && (next.type === 'op' || ['LIKE', 'IN', 'NOT'].includes(upper(next)));
      if (token.type === 'word' && comparisonFollows) {
        const field = token.value.toLowerCase();
        if (!Object.hasOwn(FIELDS, field)) throw new QueryError(unknownField(token.value));
        at++;
        return parseComparison(field);
      }

      const unexpected = token.type === 'op' || token.type === 'punct' || (token.type === 'word' && KEYWORDS.has(upper(token)));
      if (unexpected) throw new QueryError(`I didn't expect '${token.value}' here.`);

      // Anything else is a plain search for that word.
      at++;
      return { type: 'text', value: token.value };
    }

    function parseNot() {
      return accept('NOT') ? { type: 'not', node: parseNot() } : parsePrimary();
    }

    function parseAnd() {
      let node = parseNot();
      while (accept('AND')) node = { type: 'and', left: node, right: parseNot() };
      return node;
    }

    function parseOr() {
      let node = parseAnd();
      while (accept('OR')) node = { type: 'or', left: node, right: parseAnd() };
      return node;
    }

    if (accept('SELECT')) {
      if (!isPunct('*')) throw new QueryError('Use SELECT *, because every field is always shown.');
      at++;
      if (accept('FROM')) {
        const table = tokens[at++];
        if (table?.value.toLowerCase() !== 'projects') throw new QueryError("The only table is 'projects'.");
      }
    }

    let where = null;
    if (accept('WHERE') || (tokens[at] && !isWord('ORDER') && !isWord('LIMIT'))) where = parseOr();

    const order = [];
    if (accept('ORDER')) {
      if (!accept('BY')) throw new QueryError('After ORDER I expected BY.');
      for (;;) {
        const token = tokens[at++];
        const field = token?.type === 'word' ? token.value.toLowerCase() : '';
        if (!Object.hasOwn(FIELDS, field)) throw new QueryError(token ? unknownField(token.value) : 'After ORDER BY I expected a field.');
        order.push({ field, direction: accept('DESC') ? 'DESC' : (accept('ASC'), 'ASC') });
        if (!isPunct(',')) break;
        at++;
      }
    }

    let limit = null;
    if (accept('LIMIT')) {
      const token = tokens[at++];
      if (!token || !/^\d+$/.test(token.value)) throw new QueryError('LIMIT needs a whole number, like LIMIT 5.');
      limit = Number(token.value);
    }

    if (at < tokens.length) throw new QueryError(`I didn't expect '${tokens[at].value}' here.`);
    return { where, order, limit };
  }

  // ---------- Running a query ----------

  // LIKE: % is any run of characters and _ is one. Without either, it means "contains".
  function likeRegex(pattern) {
    const text = /[%_]/.test(pattern) ? pattern : `%${pattern}%`;
    const source = [...text]
      .map((char) => (char === '%' ? '.*' : char === '_' ? '.' : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('');
    return new RegExp(`^${source}$`, 'is');
  }

  function compare(row, { field, op, value, values }) {
    const kind = FIELDS[field];
    const wanted = op === 'IN' ? values : [value];

    if (kind === 'number') {
      const left = row[field];
      const [first] = wanted.map(Number);
      switch (op) {
        case '=': return left === first;
        case '!=': return left !== first;
        case '<': return left < first;
        case '<=': return left <= first;
        case '>': return left > first;
        case '>=': return left >= first;
        default: return wanted.map(Number).includes(left);
      }
    }

    // Dates are compared by their first characters, so '2026-10' means "in October 2026".
    if (kind === 'date') {
      const [first = ''] = wanted;
      const part = row.updated.slice(0, first.length);
      switch (op) {
        case '=': return part === first;
        case '!=': return part !== first;
        case '<': return part < first;
        case '<=': return part <= first;
        case '>': return part > first;
        case '>=': return part >= first;
        default: return wanted.some((item) => row.updated.startsWith(item));
      }
    }

    // Text and choices (platform, language) match by label or by slug, in any case.
    const options = field === 'platform' ? [normalize(row.platform), row.platformSlug]
      : field === 'language' ? [normalize(row.language), row.languageSlug]
      : [normalize(row[field])];
    const same = (item) => options.includes(normalize(item)) || options.includes(slugify(item));

    if (op === 'LIKE') {
      const regex = likeRegex(wanted[0]);
      return options.some((option) => regex.test(option));
    }
    if (op === '!=') return !same(wanted[0]);
    return wanted.some(same);
  }

  function test(row, node) {
    switch (node.type) {
      case 'or': return test(row, node.left) || test(row, node.right);
      case 'and': return test(row, node.left) && test(row, node.right);
      case 'not': return !test(row, node.node);
      case 'text': {
        const haystack = normalize([row.name, row.description, row.platform, row.language].join(' '));
        return haystack.includes(normalize(node.value));
      }
      default: return compare(row, node);
    }
  }

  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

  function sorter(order) {
    return (a, b) => {
      for (const { field, direction } of order) {
        const result = typeof a[field] === 'number' ? a[field] - b[field] : collator.compare(a[field], b[field]);
        if (result) return direction === 'DESC' ? -result : result;
      }
      return a.index - b.index;
    };
  }

  // ---------- The pills ----------

  const totals = new Map(boxes.map((box) => [box, rows.filter((row) => row[`${box.dataset.group}Slug`] === box.value).length]));
  const labels = new Map(boxes.map((box) => [`${box.dataset.group}:${box.value}`, box.closest('.menu-item').querySelector('.menu-label').textContent]));

  let query = { where: null, order: [], limit: null };
  // True when the current query is more than the pills can show (text, stars, OR and so on).
  let customQuery = false;

  function optionSlug(group, value) {
    const box = boxes.find((item) =>
      item.dataset.group === group && (item.value === slugify(value) || normalize(labels.get(`${group}:${item.value}`)) === normalize(value)));
    return box?.value ?? null;
  }

  // The pills can show a query made only of platform and language choices joined by AND.
  // Returns those choices, or null when the query is something else.
  function pillSelection(where) {
    const selection = { platform: new Set(), language: new Set() };
    if (!where) return selection;

    const terms = [];
    const collect = (node) => (node.type === 'and' ? (collect(node.left), collect(node.right)) : terms.push(node));
    collect(where);

    const seen = new Set();
    for (const term of terms) {
      const usable = term.type === 'cmp' && GROUPS.includes(term.field) && ['=', 'IN'].includes(term.op) && !seen.has(term.field);
      if (!usable) return null;
      seen.add(term.field);
      for (const value of term.op === 'IN' ? term.values : [term.value]) {
        const slug = optionSlug(term.field, value);
        if (!slug) return null;
        selection[term.field].add(slug);
      }
    }
    return selection;
  }

  function updatePillUi(selection) {
    const passes = (row, skipGroup) =>
      GROUPS.every((group) => group === skipGroup || selection[group].size === 0 || selection[group].has(row[`${group}Slug`]));

    for (const box of boxes) {
      const { group } = box.dataset;
      // What this box would add, based on the other group's current choice.
      const count = customQuery ? totals.get(box) : rows.filter((row) => passes(row, group) && row[`${group}Slug`] === box.value).length;
      box.closest('.menu-item').querySelector('.chip-count').textContent = count;
      box.disabled = !customQuery && count === 0 && !box.checked;
    }

    for (const filter of filterEls) {
      const pill = filter.querySelector('.pill');
      const badge = pill.querySelector('.pill-count');
      const total = customQuery ? 0 : selection[filter.querySelector('input').dataset.group].size;
      pill.toggleAttribute('data-active', total > 0);
      badge.hidden = total === 0;
      badge.textContent = total;
    }

    // With a single platform chosen, every note would show the same platform.
    list.toggleAttribute('data-platform-filtered', !customQuery && selection.platform.size === 1);
  }

  function syncPills(parsed) {
    const selection = pillSelection(parsed.where);
    customQuery = selection === null;
    for (const box of boxes) box.checked = !customQuery && selection[box.dataset.group].has(box.value);
    updatePillUi(selection ?? { platform: new Set(), language: new Set() });
  }

  // Writes the query that matches the pills, keeping any ORDER BY and LIMIT already typed.
  function queryFromPills() {
    const selection = { platform: [], language: [] };
    for (const box of boxes) if (box.checked) selection[box.dataset.group].push(box.value);

    const quote = (text) => `'${text.replaceAll("'", "''")}'`;
    const terms = GROUPS.filter((group) => selection[group].length).map((group) => {
      const quoted = selection[group].map((slug) => quote(labels.get(`${group}:${slug}`)));
      return quoted.length === 1 ? `${group} = ${quoted[0]}` : `${group} IN (${quoted.join(', ')})`;
    });

    const parts = [DEFAULT_QUERY];
    if (terms.length) parts.push(`WHERE ${terms.join(' AND ')}`);
    if (query.order.length) parts.push(`ORDER BY ${query.order.map(({ field, direction }) => `${field} ${direction}`).join(', ')}`);
    if (query.limit !== null) parts.push(`LIMIT ${query.limit}`);
    return parts.join(' ');
  }

  // ---------- Showing the result ----------

  function applyQuery(parsed) {
    query = parsed;

    const matched = rows.filter((row) => !parsed.where || test(row, parsed.where));
    if (parsed.order.length) matched.sort(sorter(parsed.order));
    const shown = parsed.limit === null ? matched : matched.slice(0, parsed.limit);
    const shownSet = new Set(shown);

    // Matches go first, in the requested order. The rest stay hidden behind them.
    const rest = rows.filter((row) => !shownSet.has(row));
    list.append(...[...shown, ...rest].map((row) => row.el));
    for (const row of rows) row.el.hidden = !shownSet.has(row);

    const narrowed = Boolean(parsed.where) || parsed.limit !== null;
    const changed = narrowed || parsed.order.length > 0;
    statusLine.textContent = narrowed ? `showing ${shown.length} of ${rows.length} projects` : `${rows.length} projects`;
    emptyState.hidden = shown.length > 0;
    resetButton.hidden = !changed;
  }

  function saveToUrl(text) {
    const params = new URLSearchParams();
    if (text.trim() !== DEFAULT_QUERY) params.set('q', text.trim());
    const queryString = params.toString();
    history.replaceState(null, '', queryString ? `?${queryString}` : location.pathname);
  }

  // ---------- Errors ----------

  // Errors wait until the person pauses or presses Enter, so half-typed words don't shout.
  let errorTimer;

  function showError(message) {
    queryInput.setAttribute('aria-invalid', 'true');
    queryInput.setAttribute('aria-describedby', 'query-error');
    queryError.textContent = `Error: ${message}`;
  }

  function clearError() {
    clearTimeout(errorTimer);
    queryInput.setAttribute('aria-invalid', 'false');
    queryInput.removeAttribute('aria-describedby');
    queryError.textContent = '';
  }

  // Runs the text in the query bar. A query that can't be read leaves the last good result in place.
  function runQuery(text, { showErrorNow = false } = {}) {
    let parsed;
    try {
      parsed = parse(text);
    } catch (error) {
      if (!(error instanceof QueryError)) throw error;
      clearTimeout(errorTimer);
      if (showErrorNow) showError(error.message);
      else errorTimer = setTimeout(() => showError(error.message), 800);
      return;
    }
    clearError();
    applyQuery(parsed);
    syncPills(parsed);
    saveToUrl(text);
  }

  function clearAll() {
    queryInput.value = DEFAULT_QUERY;
    runQuery(DEFAULT_QUERY);
  }

  // ---------- Wiring ----------

  function setQueryOpen(open) {
    queryToggle.setAttribute('aria-expanded', String(open));
    queryPanel.hidden = !open;
  }

  function setMenuOpen(filter, open) {
    filter.querySelector('.pill').setAttribute('aria-expanded', String(open));
    filter.querySelector('.menu').hidden = !open;
  }

  function closeMenus(except) {
    for (const filter of filterEls) if (filter !== except) setMenuOpen(filter, false);
  }

  filters.addEventListener('click', (event) => {
    const pill = event.target.closest('.filter .pill');
    if (pill) {
      const filter = pill.closest('.filter');
      const opening = pill.getAttribute('aria-expanded') !== 'true';
      closeMenus(filter);
      setMenuOpen(filter, opening);
    }
    if (event.target.closest('.filter-reset')) clearAll();
  });

  queryToggle.addEventListener('click', () => setQueryOpen(queryToggle.getAttribute('aria-expanded') !== 'true'));

  // Checking or unchecking a box rewrites the query to match.
  filters.addEventListener('change', (event) => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    queryInput.value = queryFromPills();
    runQuery(queryInput.value);
  });

  queryInput.addEventListener('input', () => runQuery(queryInput.value));
  queryInput.addEventListener('blur', () => runQuery(queryInput.value, { showErrorNow: true }));
  queryInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    // Enter can confirm a character in an input method. That is not a request to run.
    if (event.isComposing || event.keyCode === 229) return;
    runQuery(queryInput.value, { showErrorNow: true });
  });

  // The sample queries.
  queryPanel.addEventListener('click', (event) => {
    const example = event.target.closest('.example');
    if (!example) return;
    queryInput.value = example.querySelector('code').textContent;
    runQuery(queryInput.value, { showErrorNow: true });
  });

  emptyState.addEventListener('click', (event) => {
    if (event.target.closest('.filter-clear')) clearAll();
  });

  // Clicking anywhere else closes an open menu.
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.filter')) closeMenus();
  });

  filters.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const filter = event.target.closest('.filter');
    if (!filter || filter.querySelector('.menu').hidden) return;
    setMenuOpen(filter, false);
    filter.querySelector('.pill').focus();
  });

  // Tabbing out of a menu closes it. A click on its own label moves focus to nowhere for a moment,
  // so only a move to another element counts.
  filters.addEventListener('focusout', (event) => {
    const filter = event.target.closest('.filter');
    if (filter && event.relatedTarget && !filter.contains(event.relatedTarget)) setMenuOpen(filter, false);
  });

  // Start from the whole list, then restore a shared or reloaded query if there is one.
  const sharedQuery = new URLSearchParams(location.search).get('q');
  runQuery(DEFAULT_QUERY);
  if (sharedQuery) {
    queryInput.value = sharedQuery;
    setQueryOpen(true);
    runQuery(sharedQuery, { showErrorNow: true });
  }
}
