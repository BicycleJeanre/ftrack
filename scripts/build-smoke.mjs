import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

async function fileExists(relativePath) {
  await access(path.join(repoRoot, relativePath));
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), 'utf8'));
}

function localReferencesFromHtml(html) {
  const references = [];
  const attrPattern = /\b(?:href|src)=["']([^"']+)["']/g;
  let match;

  while ((match = attrPattern.exec(html))) {
    const reference = match[1];
    if (
      reference.startsWith('http:') ||
      reference.startsWith('https:') ||
      reference.startsWith('data:') ||
      reference.startsWith('#')
    ) {
      continue;
    }
    references.push(reference.split('?')[0]);
  }

  return references;
}

async function assertHtmlReferences(pagePath) {
  const html = await readFile(path.join(repoRoot, pagePath), 'utf8');
  const pageDir = path.dirname(pagePath);

  for (const reference of localReferencesFromHtml(html)) {
    const target = path.normalize(path.join(pageDir, reference));
    assert.ok(!target.startsWith('..'), `${pagePath} references file outside repo: ${reference}`);
    await fileExists(target);
  }
}

async function main() {
  const packageJson = await readJson('package.json');

  assert.equal(packageJson.main, 'main.js', 'package main should point to the Electron entry file');
  await fileExists(packageJson.main);
  await fileExists('preload.js');
  await fileExists('server.py');
  await fileExists('index.html');
  await fileExists('pages/ftrack.html');
  await fileExists('styles/app.css');
  await fileExists('assets/lookup-data.json');
  await fileExists('assets/docs-manifest.json');

  const buildFiles = packageJson.build?.files || [];
  for (const entry of buildFiles.filter((value) => !value.includes('*') && !value.startsWith('!'))) {
    await fileExists(entry);
  }

  await assertHtmlReferences('index.html');
  await assertHtmlReferences('pages/ftrack.html');

  const docsManifest = await readJson('assets/docs-manifest.json');
  assert.equal(docsManifest.version, 1, 'docs manifest version should be stable');
  assert.ok(Array.isArray(docsManifest.items), 'docs manifest should expose items');
  assert.ok(docsManifest.items.length >= 30, 'docs manifest should include the documentation library');

  const docs = await readdir(path.join(repoRoot, 'Documentation'));
  const markdownCount = docs.filter((name) => name.endsWith('.md')).length;
  assert.equal(
    docsManifest.items.length,
    markdownCount,
    'docs manifest should include every top-level markdown document'
  );

  console.log('Build smoke passed');
}

await main();
