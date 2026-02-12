const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const testsDir = path.resolve(__dirname, 'tests');

const testFiles = fs.readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => path.join(testsDir, name));

const result = spawnSync('node', ['--test', ...testFiles], {
  stdio: 'inherit',
  cwd: repoRoot
});

process.exitCode = result.status ?? 1;
