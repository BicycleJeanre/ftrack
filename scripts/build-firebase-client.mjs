import { build } from 'esbuild';

await build({
  entryPoints: ['js/cloud/firebase-client-entry.js'],
  outfile: 'js/vendor/firebase-client.bundle.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  legalComments: 'none',
  sourcemap: false,
  minify: true
});

console.log('Built js/vendor/firebase-client.bundle.js');
