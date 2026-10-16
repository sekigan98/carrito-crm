import {build} from "esbuild";
await build({entryPoints:["server/index.ts"],outdir:"dist-node/server",bundle:true,platform:"node",format:"esm",target:"node22",external:["pg","node:sqlite"],sourcemap:false});
