import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('api-dist',{recursive:true});
await build({entryPoints:['server/index.ts'],bundle:true,platform:'node',format:'cjs',target:'node22',outfile:'api-dist/server.cjs',logLevel:'info',external:['pg-native']});
await copyFile('server/schema.sql','api-dist/schema.sql');
