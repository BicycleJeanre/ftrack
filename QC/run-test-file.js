const { spawnSync } = require('child_process');
const path = require('path');

function runTestFile(relativePath) {
  const repoRoot = path.resolve(__dirname, '..');
  const testPath = path.resolve(__dirname, relativePath);

  const result = spawnSync('node', ['--test', testPath], {
    stdio: 'inherit',
    cwd: repoRoot
  });

  process.exitCode = result.status ?? 1;
}

module.exports = runTestFile;
