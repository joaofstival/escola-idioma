// Empacota main e preload com esbuild e o renderer (React) com o Vite; tudo vai para dist/.
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2023' };

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.js', platform: 'node', format: 'esm', external: ['electron', 'sql.js'] }),
  build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload.cjs', platform: 'node', format: 'cjs', external: ['electron'] }),
]);
await viteBuild({ logLevel: 'warn' });

cpSync(join(dirname(require.resolve('sql.js')), 'sql-wasm.wasm'), 'dist/sql-wasm.wasm');
console.log('build ok');
