import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(repoRoot, 'Documentation');
const outPath = path.join(repoRoot, 'assets', 'docs-manifest.json');

const categoryRules = [
  { prefix: 'concepts_', category: 'Concepts' },
  { prefix: 'plan_', category: 'Plan' },
  { prefix: 'user_', category: 'User' },
  { prefix: 'other_', category: 'Other' },
  { prefix: 'TECH_', category: 'Technical' },
  { prefix: 'DEBT_REPAYMENT_', category: 'Debt Repayment' },
  { prefix: 'GOAL_', category: 'Goal Planning' },
  { prefix: 'PERIODIC_CHANGE_', category: 'Periodic Change' },
  { prefix: 'GRID_STATE_', category: 'Grid State' },
  { prefix: 'RELEASE_', category: 'Release' },
  { prefix: 'AI_', category: 'AI' },
  { prefix: 'USER_', category: 'User' },
  { prefix: 'USAGE_', category: 'User' }
];

const ignoreNames = new Set([
  '.DS_Store'
]);

async function main() {
  const docs = await collectDocs(docsRoot);

  const items = [];
  for (const absolutePath of docs) {
    const relFromRepo = path.relative(repoRoot, absolutePath).replaceAll(path.sep, '/');
    const fileName = path.basename(absolutePath);

    if (ignoreNames.has(fileName)) continue;

    const ext = path.extname(fileName).toLowerCase();
    const baseName = path.basename(fileName, ext);

    const category = inferCategory(baseName);
    const subTitle = inferTitle(baseName, category);

    let markdown = '';
    if (ext === '.md') {
      markdown = await readFile(absolutePath, 'utf8');
    } else if (ext === '.ipynb') {
      const json = await readFile(absolutePath, 'utf8');
      markdown = notebookToMarkdown(json);
    } else {
      continue;
    }

    const title = extractFirstHeading(markdown) || subTitle;

    items.push({
      id: baseName,
      title,
      category,
      file: relFromRepo,
      kind: ext === '.ipynb' ? 'ipynb' : 'md'
    });
  }

  items.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.title.localeCompare(b.title);
  });

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    items
  };

  await writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${items.length} docs -> ${path.relative(repoRoot, outPath)}`);
}

async function collectDocs(dir) {
  const result = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      result.push(...await collectDocs(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (ext !== '.md' && ext !== '.ipynb') continue;

    result.push(fullPath);
  }

  return result;
}

function inferCategory(baseName) {
  const normalized = baseName.replaceAll('-', '_');

  if (normalized.includes('__')) {
    const [rawCategory] = normalized.split('__');
    if (rawCategory && rawCategory.trim()) {
      return toTitleCase(rawCategory.replaceAll('_', ' '));
    }
  }

  for (const rule of categoryRules) {
    if (normalized.toUpperCase().startsWith(rule.prefix.toUpperCase())) return rule.category;
  }

  // Dynamic prefix support:
  // If the filename starts with a simple prefix followed by an underscore,
  // treat that prefix as the category. This allows adding new doc families
  // without updating this script.
  // Examples:
  // - concepts_accounts -> Concepts
  // - plan_project_notes -> Plan
  // - user_getting_started -> User
  const genericPrefix = getGenericPrefix(baseName);
  if (genericPrefix) return toTitleCase(genericPrefix.replaceAll('_', ' '));

  return 'Other';
}

function inferTitle(baseName, category) {
  let working = baseName.replaceAll('-', '_');

  if (working.includes('__')) {
    const parts = working.split('__');
    working = parts.slice(1).join('__');
  }

  for (const rule of categoryRules) {
    if (working.toUpperCase().startsWith(rule.prefix.toUpperCase())) {
      working = working.slice(rule.prefix.length);
      break;
    }
  }

  // Match inferCategory dynamic prefixes (lowercase style) so fallback titles
  // don't include the category prefix.
  const genericPrefix = getGenericPrefix(working);
  if (genericPrefix) {
    working = working.slice(genericPrefix.length + 1);
  }

  if (!working) working = baseName;

  return toTitleCase(working.replaceAll('_', ' '));
}

function toTitleCase(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.length ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word)
    .join(' ');
}

function getGenericPrefix(baseName) {
  // Only treat lowercase prefixes as dynamic categories.
  // This avoids changing behavior for existing uppercase convention files
  // like TECH_ARCHITECTURE.
  const match = String(baseName).match(/^([a-z0-9]+)_/);
  return match ? match[1] : null;
}

function extractFirstHeading(markdown) {
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) return match[1].trim();
  }
  return null;
}

function notebookToMarkdown(rawJson) {
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
    return '# Notebook\n\nUnable to parse notebook content.';
  }
}

await main();
