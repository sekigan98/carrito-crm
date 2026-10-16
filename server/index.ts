import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {handleApi} from "../lib/api";
import {sqliteDatabase,postgresDatabase} from "./database";

const port=Number(process.env.PORT||3000),origin=process.env.APP_ORIGIN||"http://localhost:"+port;
const storage=process.env.DATABASE_URL?await postgresDatabase(process.env.DATABASE_URL):sqliteDatabase(path.resolve(process.env.SQLITE_PATH||".data/carrito.sqlite"));
const env={DB:storage.db,DEMO_MODE:process.env.DEMO_MODE,SETUP_TOKEN:process.env.SETUP_TOKEN,RESEND_API_KEY:process.env.RESEND_API_KEY,MAIL_FROM:process.env.MAIL_FROM};
const root=path.resolve("dist-node/client");
const mime:Record<string,string>={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon",".woff2":"font/woff2",".ttf":"font/ttf"};
async function respond(request:IncomingMessage,response:ServerResponse){
  response.setHeader("X-Content-Type-Options","nosniff");response.setHeader("X-Frame-Options","DENY");response.setHeader("Referrer-Policy","same-origin");
  response.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  if(new URL(origin).protocol==="https:")response.setHeader("Strict-Transport-Security","max-age=31536000");
  const url=new URL(request.url||"/",origin);
  if(url.pathname.startsWith("/api/")){
    const chunks:Buffer[]=[];let bytes=0;
    for await(const chunk of request){const b=Buffer.from(chunk);bytes+=b.length;if(bytes>100000){response.writeHead(413,{"Content-Type":"application/json"});response.end(JSON.stringify({error:"El formulario supera el tamaño permitido."}));return}chunks.push(b)}
    const headers=new Headers();for(const [key,value]of Object.entries(request.headers)){if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(","):value)}
    const method=request.method||"GET";
    const result=await handleApi(new Request(url,{method,headers,...(method!=="GET"&&method!=="HEAD"?{body:Buffer.concat(chunks)}:{})}),env);
    result.headers.forEach((value,key)=>response.setHeader(key,value));response.writeHead(result.status);response.end(Buffer.from(await result.arrayBuffer()));return;
  }
  if(request.method!=="GET"&&request.method!=="HEAD"){response.writeHead(405);response.end();return}
  const candidate=path.resolve(root,"."+decodeURIComponent(url.pathname));
  if(candidate!==root&&!candidate.startsWith(root+path.sep)){response.writeHead(404);response.end();return}
  let filename=candidate;try{if(!(await stat(filename)).isFile())filename=path.join(root,"index.html")}catch{filename=path.join(root,"index.html")}
  const content=await readFile(filename);response.setHeader("Content-Type",mime[path.extname(filename)]||"application/octet-stream");response.setHeader("Cache-Control",filename.includes(path.sep+"assets"+path.sep)?"public,max-age=31536000,immutable":"no-cache");response.writeHead(200);response.end(request.method==="HEAD"?undefined:content);
}
const server=createServer((req,res)=>{void respond(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"No se pudo completar la operación."}))})});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(port,"0.0.0.0",()=>console.log("Carrito disponible en "+origin));
for(const signal of ["SIGINT","SIGTERM"]){process.once(signal,()=>server.close(()=>{void Promise.resolve(storage.close()).then(()=>process.exit(0))}))}
