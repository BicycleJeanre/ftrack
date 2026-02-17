// Manifest-driven repository documentation viewer for documentation.html
// - Sidebar subsections are derived from filename prefixes (via docs-manifest.json)
// - Markdown is rendered to HTML client-side

document.addEventListener('DOMContentLoaded', async () => {
  const navContainer = document.getElementById('repo-docs-nav');
  const titleEl = document.getElementById('repo-doc-title');
  const metaEl = document.getElementById('repo-doc-meta');
  const contentEl = document.getElementById('repo-doc-content');

  if (!navContainer || !titleEl || !metaEl || !contentEl) return;

  const manifest = await loadManifest();
  if (!manifest) {
    navContainer.textContent = 'Repository docs manifest not found.';
    return;
  }

  const navState = renderNav(navContainer, manifest.items);

  const initialDocId = getInitialDocId(manifest.items);
  if (initialDocId) {
    openDoc(initialDocId, manifest.items);
  }

  navContainer.addEventListener('click', (e) => {
    const categoryHeader = e.target.closest('[data-doc-category]');
    if (categoryHeader) {
      e.preventDefault();
      const category = categoryHeader.getAttribute('data-doc-category');
      if (category) toggleCategory(category, navState);
      return;
    }

    const link = e.target.closest('a[data-doc-id]');
    if (!link) return;

    e.preventDefault();
    const docId = link.getAttribute('data-doc-id');
    if (!docId) return;

    openDoc(docId, manifest.items);
  });

  navContainer.addEventListener('keydown', (e) => {
    if (!(e.key === 'Enter' || e.key === ' ')) return;
    const categoryHeader = e.target.closest('[data-doc-category]');
    if (!categoryHeader) return;

    e.preventDefault();
    const category = categoryHeader.getAttribute('data-doc-category');
    if (category) toggleCategory(category, navState);
  });

  function openDoc(docId, items) {
    const item = items.find(d => d.id === docId);
    if (!item) return;

    // Ensure the repo-docs panel is visible
    if (typeof window.showDocPanel === 'function') {
      window.showDocPanel('repo-docs');
    }

    // Update hash so deep links are shareable
    window.location.hash = `repo-docs/${encodeURIComponent(docId)}`;

    titleEl.textContent = item.title;
    metaEl.textContent = `${item.category} • ${item.file}`;
    loadAndRenderDoc(item, contentEl);

    // Ensure the correct category is expanded
    if (item.category) {
      expandCategory(item.category, navState);
    }

    // Active state
    navContainer.querySelectorAll('a[data-doc-id]').forEach(a => {
      if (a.getAttribute('data-doc-id') === docId) a.classList.add('active');
      else a.classList.remove('active');
    });
  }
});

async function loadAndRenderDoc(item, contentEl) {
  contentEl.innerHTML = '<p>Loading...</p>';

  try {
    const url = `../${item.file}`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.text();

    let markdown = raw;
    if (item.kind === 'ipynb') {
      markdown = notebookJsonToMarkdown(raw);
    }

    contentEl.innerHTML = renderMarkdownToHtml(markdown);
  } catch (err) {
    contentEl.innerHTML = '<p>Failed to load document.</p>';
  }
}

function notebookJsonToMarkdown(rawJson) {
  try {
    const notebook = JSON.parse(rawJson);
    const cells = Array.isArray(notebook.cells) ? notebook.cells : [];

    const parts = [];
    for (const cell of cells) {
      const cellType = cell.cell_type;
      const source = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '');
      if (!source.trim()) continue;

      if (cellType === 'markdown') {
        parts.push(source.trim());
      } else if (cellType === 'code') {
        parts.push('```\n' + source.trimEnd() + '\n```');
      }
    }

    return parts.join('\n\n---\n\n');
  } catch {
    return '# Notebook\n\nUnable to parse notebook.';
  }
}

function renderMarkdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out = [];

  let inCode = false;
  let codeLines = [];
  let listMode = null; // 'ul' | 'ol'

  const flushList = () => {
    if (!listMode) return;
    out.push(`</${listMode}>`);
    listMode = null;
  };

  const flushCode = () => {
    const code = escapeHtml(codeLines.join('\n'));
    out.push(`<pre><code>${code}</code></pre>`);
    codeLines = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        inCode = false;
        flushList();
        flushCode();
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      flushList();
      const level = h[1].length;

      // Match existing documentation.html typography patterns:
      // - Treat Markdown H1 as an in-panel section title (doc title is already shown above)
      // - Treat Markdown H2 as a subsection title
      if (level === 1) {
        out.push(`<h2 class="page-section-title">${renderInline(h[2])}</h2>`);
      } else if (level === 2) {
        out.push(`<h3 class="subsection-title">${renderInline(h[2])}</h3>`);
      } else {
        out.push(`<h4>${renderInline(h[2])}</h4>`);
      }
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ol) {
      if (listMode && listMode !== 'ol') flushList();
      if (!listMode) {
        listMode = 'ol';
        out.push('<ol>');
      }
      out.push(`<li>${renderInline(ol[1])}</li>`);
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    if (ul) {
      if (listMode && listMode !== 'ul') flushList();
      if (!listMode) {
        listMode = 'ul';
        out.push('<ul>');
      }
      out.push(`<li>${renderInline(ul[1])}</li>`);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    flushList();
    out.push(`<p class="section-text">${renderInline(line)}</p>`);
  }

  if (inCode) {
    flushList();
    flushCode();
  }

  flushList();
  return out.join('\n');
}

function renderInline(text) {
  let html = escapeHtml(text);

  // inline code
  html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);

  // bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // italics (simple)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const safeHref = escapeAttribute(href);
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  return html;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(text) {
  // prevent quotes + javascript: style links
  const raw = String(text).trim();
  if (/^javascript:/i.test(raw)) return '#';
  return escapeHtml(raw);
}

async function loadManifest() {
  try {
    const res = await fetch('../assets/docs-manifest.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function renderNav(container, items) {
  container.innerHTML = '';

  const grouped = groupBy(items, (d) => d.category || 'Other');

  const state = {
    groups: new Map(),
  };

  for (const [category, docs] of grouped) {
    const group = document.createElement('div');
    group.className = 'repo-doc-group';
    group.setAttribute('data-category', category);

    const header = document.createElement('a');
    header.href = '#';
    header.className = 'doc-panel-link repo-doc-category';
    header.textContent = category;
    header.setAttribute('data-doc-category', category);
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'false');
    group.appendChild(header);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'repo-doc-items';
    itemsContainer.hidden = true;

    for (const doc of docs) {
      const a = document.createElement('a');
      a.href = `#repo-docs/${encodeURIComponent(doc.id)}`;
      a.className = 'doc-panel-link doc-panel-sublink';
      a.setAttribute('data-doc-id', doc.id);
      a.textContent = doc.title;
      itemsContainer.appendChild(a);
    }

    group.appendChild(itemsContainer);
    container.appendChild(group);

    state.groups.set(category, { group, header, itemsContainer });
  }

  return state;
}

function toggleCategory(category, navState) {
  if (!navState || !navState.groups) return;
  const entry = navState.groups.get(category);
  if (!entry) return;
  if (entry.itemsContainer.hidden) expandCategory(category, navState);
  else collapseCategory(category, navState);
}

function expandCategory(category, navState) {
  if (!navState || !navState.groups) return;
  const entry = navState.groups.get(category);
  if (!entry) return;
  entry.itemsContainer.hidden = false;
  entry.header.setAttribute('aria-expanded', 'true');
  entry.group.classList.add('expanded');
}

function collapseCategory(category, navState) {
  if (!navState || !navState.groups) return;
  const entry = navState.groups.get(category);
  if (!entry) return;
  entry.itemsContainer.hidden = true;
  entry.header.setAttribute('aria-expanded', 'false');
  entry.group.classList.remove('expanded');
}

function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }

  // stable-ish ordering
  return Array.from(map.entries()).map(([k, v]) => [k, v]);
}

function getInitialDocId(items) {
  const hash = window.location.hash || '';
  const match = hash.match(/^#repo-docs\/(.+)$/);
  if (match) {
    const docId = decodeURIComponent(match[1]);
    if (items.some(d => d.id === docId)) return docId;
  }

  // Prefer Getting Started when present.
  const preferredIds = [
    'USER_GETTING_STARTED',
    'CONCEPTS_GETTING_STARTED',
    'USER_OVERVIEW',
    'CONCEPTS_OVERVIEW',
    'TECH_OVERVIEW'
  ];
  for (const id of preferredIds) {
    if (items.some(d => d.id === id)) return id;
  }

  return items.length ? items[0].id : null;
}
