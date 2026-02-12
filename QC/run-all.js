const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: repoRoot
  });

  return result.status === 0;
}

const verifyOk = run('node', [path.join(__dirname, 'verify.js'), '--all', '--no-report']);
const testsOk = run('node', [path.join(__dirname, 'run-tests.js')]);

if (!verifyOk || !testsOk) {
  process.exitCode = 1;
}
