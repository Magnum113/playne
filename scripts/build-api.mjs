import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const bytes=(path)=>JSON.stringify(readFileSync(path).toString('base64'));
const define={
  __PLAYNE_PREVIEW_WASM_B64__:bytes(require.resolve('@resvg/resvg-wasm/index_bg.wasm')),
  __PLAYNE_PREVIEW_FONT_B64__:bytes('server/assets/NotoSans-Regular.ttf'),
  __PLAYNE_PREVIEW_BOLD_B64__:bytes('server/assets/NotoSans-Bold.ttf'),
};
const notice='/*\nNoto Sans Regular and Bold — '+readFileSync('server/assets/OFL.txt','utf8')+'\nRenderer: @resvg/resvg-wasm 2.6.2 (MPL-2.0). Source: https://github.com/thx/resvg-js\n*/';
await mkdir('api-dist',{recursive:true});
await build({entryPoints:['server/index.ts'],bundle:true,platform:'node',format:'cjs',target:'node22',outfile:'api-dist/server.cjs',logLevel:'info',external:['pg-native'],define,banner:{js:notice}});
await copyFile('server/schema.sql','api-dist/schema.sql');
