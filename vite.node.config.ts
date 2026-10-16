import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({root:path.resolve("client"),publicDir:path.resolve("public"),plugins:[react()],resolve:{alias:{"@":path.resolve(".")}},build:{outDir:path.resolve("dist-node/client"),emptyOutDir:true}});
