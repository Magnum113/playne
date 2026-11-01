import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve(process.argv[2] || '.ai/telegram-preview/gateway-dist');
await mkdir(`${out}/api`, {recursive:true});
await mkdir(`${out}/lib`, {recursive:true});
await mkdir(`${out}/server/assets`, {recursive:true});
for (const file of ['api/index.mjs', 'package.json', 'vercel.json']) {
  await copyFile(`ops/share-gateway/${file}`, `${out}/${file}`);
}
for (const file of ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf', 'OFL.txt']) {
  await copyFile(`server/assets/${file}`, `${out}/server/assets/${file}`);
}
await build({
  entryPoints:['ops/share-gateway/renderer.ts'], bundle:true, platform:'node',
  format:'cjs', target:'node24', outfile:`${out}/lib/preview.cjs`,
  external:['@resvg/resvg-wasm'],
  banner:{js:`/* Noto Sans Regular/Bold: see server/assets/OFL.txt. Renderer @resvg/resvg-wasm 2.6.2 (MPL-2.0). */`},
});
console.log(`Share gateway prepared: ${out}`);
