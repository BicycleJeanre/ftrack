import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readRepoFile = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('shortcut registry, asset, controller, and documentation expose only supported app shortcuts', async () => {
  const [managerSource, controllerSource, shortcutsJson, documentation] = await Promise.all([
    readRepoFile('js/shared/keyboard-shortcuts.js'),
    readRepoFile('js/ui/controllers/forecast-controller.js'),
    readRepoFile('assets/shortcuts.json'),
    readRepoFile('Documentation/OTHER_SHORTCUTS.md')
  ]);

  const registeredKeys = [...managerSource.matchAll(/this\.register\('([^']+)'/g)]
    .map((match) => match[1]);
  assert.deepEqual(registeredKeys, ['ctrl+1', 'ctrl+2', 'ctrl+3', 'ctrl+4', '?']);

  const configuredApplicationShortcuts = JSON.parse(shortcutsJson).Application;
  assert.deepEqual(configuredApplicationShortcuts, {
    focusScenarios: 'Ctrl+1',
    focusAccounts: 'Ctrl+2',
    focusPlanActuals: 'Ctrl+3',
    focusProjections: 'Ctrl+4',
    showShortcuts: '?'
  });

  assert.doesNotMatch(
    controllerSource,
    /shortcut:(?:addRow|deleteRow|save|generateProjections)/
  );

  for (const unsupportedShortcut of ['Ctrl+N', 'Delete selected rows', 'Ctrl+S', 'Ctrl+G']) {
    assert.doesNotMatch(documentation, new RegExp(unsupportedShortcut.replace('+', '\\+')));
  }

  for (const supportedShortcut of [
    'Focus Scenarios',
    'Focus Accounts',
    'Focus Plan & Actuals',
    'Focus Projections',
    'Show shortcut help'
  ]) {
    assert.match(documentation, new RegExp(supportedShortcut));
  }
});
