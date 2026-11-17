// Empacota main e preload com esbuild e o renderer (React) com o Vite; tudo vai para dist/.
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2023' };

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.js', platform: 'node', format: 'esm', external: ['electron'] }),
  build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload.cjs', platform: 'node', format: 'cjs', external: ['electron'] }),
]);
await viteBuild({ logLevel: 'warn' });

console.log('build ok');
