import { build } from 'esbuild';
await build({
  entryPoints: ['js/agent/solver-entry.js'],
  outfile: 'js/vendor/agent-solver.bundle.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  // Optional external lpsolve backend is not available in the browser Worker.
  // The existing in-process Solve engine does not invoke these modules.
  external: ['fs', 'child_process'],
  target: ['chrome120'],
  legalComments: 'eof',
  sourcemap: false,
  minify: true
});
console.log('Built local agent goal solver bundle');
