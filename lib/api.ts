import { MODULES,type Module,type User,type RecordItem,offerAmount,money } from "./model";
export interface Prepared {bind(...values:unknown[]):Prepared;first<T=any>():Promise<T|null>;all<T=any>():Promise<{results:T[]}>;run():Promise<any>}
export interface Database {prepare(sql:string):Prepared;batch(statements:Prepared[]):Promise<any[]>}
export interface AppEnv {DB:Database;DEMO_MODE?:string;SETUP_TOKEN?:string;RESEND_API_KEY?:string;MAIL_FROM?:string}
type Auth={user:User;csrf:string;tokenHash:string};
type RawRecord=Omit<RecordItem,"data"|"canEdit">&{data:string;archived:number};
const encoder=new TextEncoder(),SESSION_SECONDS=28800,LEASE_MS=120000;
const iso=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
const json=(data:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});
class ApiError extends Error {constructor(public status:number,message:string,public details?:unknown){super(message)}}
function fail(status:number,message:string,details?:unknown):never{throw new ApiError(status,message,details)}
export async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value))),x=>x.toString(16).padStart(2,"0")).join("")}
export async function passwordHash(password:string,salt=token().slice(0,32)){
  const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const bytes=await crypto.subtle.deriveBits({name:"PBKDF2",salt:encoder.encode(salt),iterations:100000,hash:"SHA-256"},key,256);
  return "pbkdf2$100000$"+salt+"$"+Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
}
async function verifyPassword(password:string,stored:string){
  const p=stored.split("$");if(p.length!==4||p[0]!=="pbkdf2"||p[1]!=="100000")return false;
  const c=await passwordHash(password,p[2]);if(c.length!==stored.length)return false;
  let diff=0;for(let i=0;i<stored.length;i++)diff|=stored.charCodeAt(i)^c.charCodeAt(i);return diff===0;
}
function strongPassword(p:unknown):string{if(typeof p!=="string"||p.length<12||p.length>128)fail(400,"La contraseña debe tener entre 12 y 128 caracteres.");return p}
function cleanText(v:unknown,max=160){return typeof v==="string"?v.trim().slice(0,max):""}
function validEmail(v:unknown){const e=cleanText(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))fail(400,"Ingresá un email válido.");return e}
async function body(req:Request){
  if(Number(req.headers.get("content-length")||0)>100000)fail(413,"El formulario supera el tamaño permitido.");
  const t=await req.text();if(t.length>100000)fail(413,"El formulario supera el tamaño permitido.");
  try{const d=JSON.parse(t);if(!d||typeof d!=="object"||Array.isArray(d))fail(400,"Formulario inválido.");return d}
  catch(e){if(e instanceof ApiError)throw e;fail(400,"Formulario inválido.")}
}
function admin(a:Auth){if(a.user.role!=="admin")fail(403,"Esta acción requiere un administrador.")}
async function auditEntry(db:Database,uid:string,rid:string|null,action:string,before:unknown=null,after:unknown=null){
  return db.prepare("INSERT INTO audit (id,user_id,record_id,action,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id(),uid,rid,action,before===null?null:JSON.stringify(before),after===null?null:JSON.stringify(after),iso());
}
function mutationAudit(db:Database,mutation:string,uid:string,rid:string,action:string,before:unknown,after:unknown){
  return db.prepare("INSERT INTO audit (id,user_id,record_id,action,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,? FROM records WHERE id=? AND mutation_token=?")
    .bind(id(),uid,rid,action,JSON.stringify(before),JSON.stringify(after),iso(),rid,mutation);
}
async function authFor(req:Request,env:AppEnv):Promise<Auth>{
  const raw=(req.headers.get("cookie")||"").match(/(?:^|;\s*)carrito_session=([a-f0-9]{64})/)?.[1];if(!raw)fail(401,"Iniciá sesión para continuar.");
  const tokenHash=await hash(raw);
  const r=await env.DB.prepare("SELECT u.id,u.name,u.email,u.role,u.active,u.must_change_password,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1").bind(tokenHash,Date.now()).first<User&{csrf:string}>();
  if(!r)fail(401,"Tu sesión venció. Volvé a ingresar.");
  const {csrf,...user}=r;if(req.method!=="GET"&&req.method!=="HEAD"&&req.headers.get("x-csrf-token")!==csrf)fail(403,"Recargá la página antes de guardar.");
  return {user,csrf,tokenHash};
}
async function loginResponse(req:Request,env:AppEnv,user:User){
  const raw=token(),csrf=token();await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?)").bind(await hash(raw),user.id,csrf,Date.now()+SESSION_SECONDS*1000).run();
  const secure=new URL(req.url).protocol==="https:"?"; Secure":"";
  return json({user,csrf,demo:env.DEMO_MODE==="true",mailConfigured:!!(env.RESEND_API_KEY&&env.MAIL_FROM)},200,{"Set-Cookie":"carrito_session="+raw+"; Path=/; HttpOnly; SameSite=Lax; Max-Age="+SESSION_SECONDS+secure});
}
async function recordFor(db:Database,rid:string):Promise<RawRecord>{const r=await db.prepare("SELECT * FROM records WHERE id=? AND archived=0").bind(rid).first<RawRecord>();if(!r)fail(404,"El registro ya no está disponible.");return r}
async function canEdit(db:Database,u:User,r:RawRecord){
  if(u.role==="admin"||r.owner_id===u.id)return true;
  return !!await db.prepare("SELECT user_id FROM grants WHERE record_id=? AND user_id=? AND (expires_at IS NULL OR expires_at>?)").bind(r.id,u.id,Date.now()).first();
}
async function requireEdit(db:Database,u:User,r:RawRecord){if(!await canEdit(db,u,r))fail(403,"Tenés acceso de lectura. Solicitá permiso para editar este registro.")}
function recordInput(input:any,module:Module){
  if(typeof module!=="string"||!Object.prototype.hasOwnProperty.call(MODULES,module))fail(400,"Módulo inválido.");
  const def=MODULES[module],title=cleanText(input.title),status=cleanText(input.status);
  if(!title)fail(400,"Completá el título del registro.");if(!def.statuses.includes(status))fail(400,"Estado inválido.");
  const data:Record<string,string|number>={};
  for(const f of def.fields){
    const v=input.data?.[f.key];if(f.required&&(v===undefined||v===null||v===""))fail(400,"Completá "+f.label.toLowerCase()+".");
    if(v===undefined||v===null||v===""){data[f.key]="";continue}
    if(f.type==="number"){
      const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e14)fail(400,"Revisá "+f.label.toLowerCase()+".");
      if(f.key==="marginPercent"&&n>100)fail(400,"El margen debe estar entre 0 y 100.");
      if(f.key==="year"&&(!Number.isInteger(n)||n<1900||n>new Date().getFullYear()+1))fail(400,"Año inválido.");
      data[f.key]=n;
    }else{
      const s=cleanText(v,f.type==="textarea"?20000:350);if(f.required&&!s)fail(400,"Completá "+f.label.toLowerCase()+".");if(f.options&&!f.options.includes(s))fail(400,"Revisá "+f.label.toLowerCase()+".");
      if(f.type==="email"&&s)validEmail(s);
      if((f.type==="date"||f.type==="datetime-local")&&s&&Number.isNaN(Date.parse(s)))fail(400,"Fecha inválida.");
      data[f.key]=s;
    }
  }return {title,status,data};
}
async function validateLinks(db:Database,d:Record<string,string|number>){
  if(d.vehicleId&&!await db.prepare("SELECT id FROM records WHERE id=? AND module='stock' AND archived=0").bind(d.vehicleId).first())fail(400,"El vehículo seleccionado ya no está disponible.");
}
const condition=()=> "(?='admin' OR owner_id=? OR EXISTS (SELECT 1 FROM grants g WHERE g.record_id=records.id AND g.user_id=? AND (g.expires_at IS NULL OR g.expires_at>?))) AND EXISTS (SELECT 1 FROM record_locks l WHERE l.record_id=records.id AND l.user_id=? AND l.lease_id=? AND l.expires_at>?)";
async function failedMutation(db:Database,u:User,rid:string,version:number,lease:string){
  const r=await recordFor(db,rid);await requireEdit(db,u,r);
  if(r.version!==version)fail(409,"El registro cambió desde que lo abriste. Revisá la versión actual antes de guardar.",{record:{...r,data:JSON.parse(r.data)}});
  if(!await db.prepare("SELECT * FROM record_locks WHERE record_id=? AND user_id=? AND lease_id=? AND expires_at>?").bind(rid,u.id,lease,Date.now()).first())fail(423,"La edición venció o está en uso. Tus cambios siguen en el formulario.");
  fail(409,"No se pudo guardar. Volvé a abrir el registro.");
}
export async function handleApi(req:Request,env:AppEnv):Promise<Response>{
  try{
    const url=new URL(req.url),path=url.pathname.replace(/^\/api/,""),method=req.method,db=env.DB;
    if(!db)fail(503,"La base de datos no está disponible.");
    if(method!=="GET"&&method!=="HEAD"){const origin=req.headers.get("origin");if(origin&&origin!==url.origin)fail(403,"Origen no permitido.")}
    if(path==="/health")return json({ok:true});
    if(path==="/config"&&method==="GET")return json({demo:env.DEMO_MODE==="true"});
    if(path==="/bootstrap"&&method==="POST"){
      const d=await body(req);if(!env.SETUP_TOKEN||d.setupToken!==env.SETUP_TOKEN)fail(403,"Código de instalación inválido.");
      const name=cleanText(d.name),email=validEmail(d.email),pass=strongPassword(d.password);if(!name)fail(400,"Ingresá el nombre.");
      const r=await db.prepare("INSERT INTO users (id,name,email,role,password_hash,active,must_change_password,created_at) SELECT 'initial-admin',?,?,'admin',?,1,0,? WHERE NOT EXISTS (SELECT 1 FROM users WHERE role='admin') RETURNING id").bind(name,email,await passwordHash(pass),iso()).first();
      if(!r)fail(409,"La instalación inicial ya se realizó.");return json({ok:true},201);
    }
    if(path==="/demo"&&method==="POST"){
      if(env.DEMO_MODE!=="true")fail(404,"Acción no disponible.");
      const {ensureDemo}=await import("./seed");await ensureDemo(env);const d=await body(req);
      const uid=["demo-admin","demo-lucia","demo-mateo"].includes(d.userId)?d.userId:"demo-admin";
      const u=await db.prepare("SELECT id,name,email,role,active,must_change_password FROM users WHERE id=? AND active=1").bind(uid).first<User>();
      if(!u)fail(403,"Cuenta de ejemplo desactivada.");return loginResponse(req,env,u);
    }
    if(path==="/login"&&method==="POST"){
      const d=await body(req),email=validEmail(d.email);if(typeof d.password!=="string"||d.password.length>128)fail(400,"Revisá la contraseña.");
      const attempt=await db.prepare("SELECT * FROM login_attempts WHERE email=?").bind(email).first();
      if(attempt&&attempt.window_until>Date.now()&&attempt.attempts>=8)fail(429,"Demasiados intentos. Probá en unos minutos.");
      const r=await db.prepare("SELECT * FROM users WHERE email=? AND active=1").bind(email).first();
      const stored=r?.password_hash||await passwordHash("not-a-user"),ok=await verifyPassword(d.password,stored);
      if(!r||!ok){await db.prepare("INSERT INTO login_attempts (email,attempts,window_until) VALUES (?,1,?) ON CONFLICT (email) DO UPDATE SET attempts=CASE WHEN login_attempts.window_until<? THEN 1 ELSE login_attempts.attempts+1 END,window_until=CASE WHEN login_attempts.window_until<? THEN ? ELSE login_attempts.window_until END").bind(email,Date.now()+900000,Date.now(),Date.now(),Date.now()+900000).run();fail(401,"Email o contraseña incorrectos.")}
      await db.prepare("DELETE FROM login_attempts WHERE email=?").bind(email).run();const {password_hash,...u}=r;return loginResponse(req,env,u);
    }
    const auth=await authFor(req,env),user=auth.user;
    if(path==="/session"&&method==="GET")return json({user,csrf:auth.csrf,demo:env.DEMO_MODE==="true",mailConfigured:!!(env.RESEND_API_KEY&&env.MAIL_FROM)});
    if(path==="/logout"&&method==="POST"){await db.batch([db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(auth.tokenHash),db.prepare("DELETE FROM record_locks WHERE user_id=?").bind(user.id)]);return json({ok:true},200,{"Set-Cookie":"carrito_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"})}
    if(path==="/password"&&method==="POST"){
      const d=await body(req),pass=strongPassword(d.newPassword),r=await db.prepare("SELECT password_hash FROM users WHERE id=?").bind(user.id).first();
      if(!await verifyPassword(String(d.currentPassword||""),r.password_hash))fail(400,"La contraseña actual no es correcta.");
      await db.batch([db.prepare("UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?").bind(await passwordHash(pass),user.id),db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(user.id,auth.tokenHash),await auditEntry(db,user.id,null,"Cambió su contraseña")]);return json({ok:true});
    }
    if(user.must_change_password&&method!=="GET")fail(403,"Cambiá tu contraseña temporal antes de trabajar.");
    if(path==="/state"&&method==="GET"){
      const [rs,us,gs,ls,requests,as]=await db.batch([
        db.prepare("SELECT * FROM records WHERE archived=0 ORDER BY updated_at DESC LIMIT 5000"),
        db.prepare("SELECT id,name,email,role,active,must_change_password FROM users ORDER BY name"),
        db.prepare("SELECT * FROM grants WHERE expires_at IS NULL OR expires_at>?").bind(Date.now()),
        db.prepare("SELECT * FROM record_locks WHERE expires_at>?").bind(Date.now()),
        user.role==="admin"?db.prepare("SELECT * FROM access_requests WHERE status='pending' ORDER BY created_at"):db.prepare("SELECT * FROM access_requests WHERE user_id=? AND status='pending' ORDER BY created_at").bind(user.id),
        db.prepare("SELECT a.*,u.name AS user_name,r.title AS record_title FROM audit a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN records r ON r.id=a.record_id ORDER BY a.created_at DESC LIMIT 100"),
      ]);
      const records=rs.results.map((r:RawRecord)=>{const lock=ls.results.find((l:any)=>l.record_id===r.id),grant=gs.results.find((g:any)=>g.record_id===r.id&&g.user_id===user.id);return {...r,data:JSON.parse(r.data),canEdit:user.role==="admin"||r.owner_id===user.id||!!grant,lockedBy:lock?.user_id||null,lockExpiresAt:lock?.expires_at||null}});
      return json({records,users:us.results,grants:gs.results,requests:requests.results,audit:as.results,demo:env.DEMO_MODE==="true",limit:5000});
    }
    if(path==="/records"&&method==="POST"){
      const d=await body(req),module=d.module as Module,clean=recordInput(d,module),rid=id(),now=iso();await validateLinks(db,clean.data);
      const owner=user.role==="admin"&&d.ownerId?String(d.ownerId):user.id;
      if(!await db.prepare("SELECT id FROM users WHERE id=? AND active=1").bind(owner).first())fail(400,"Responsable inválido.");
      await db.batch([db.prepare("INSERT INTO records (id,module,title,status,owner_id,data,version,archived,created_at,updated_at) VALUES (?,?,?,?,?,?,1,0,?,?)").bind(rid,module,clean.title,clean.status,owner,JSON.stringify(clean.data),now,now),await auditEntry(db,user.id,rid,"Creó el registro",null,{...clean,ownerId:owner})]);return json({id:rid,version:1},201);
    }
    const recordMatch=path.match(/^\/records\/([^/]+)(?:\/(lock|release|request|grant|owner|archive|send))?$/);
    if(recordMatch){
      const rid=decodeURIComponent(recordMatch[1]),action=recordMatch[2],row=await recordFor(db,rid);
      if(method==="GET"&&!action)return json({...row,data:JSON.parse(row.data),canEdit:await canEdit(db,user,row)});
      const d=await body(req);
      if(action==="request"&&method==="POST"){
        if(await canEdit(db,user,row))fail(400,"Ya tenés permiso de edición.");const reason=cleanText(d.reason,1000);if(!reason)fail(400,"Indicá el motivo.");
        await db.prepare("INSERT INTO access_requests (id,record_id,user_id,reason,status,created_at) VALUES (?,?,?,?,'pending',?) ON CONFLICT DO NOTHING").bind(id(),rid,user.id,reason,iso()).run();return json({ok:true});
      }
      if(action==="grant"&&method==="POST"){
        admin(auth);if(!await db.prepare("SELECT id FROM users WHERE id=? AND active=1").bind(d.userId).first())fail(400,"Empleado inválido.");
        if(d.revoke)await db.batch([db.prepare("DELETE FROM grants WHERE record_id=? AND user_id=?").bind(rid,d.userId),db.prepare("DELETE FROM record_locks WHERE record_id=? AND user_id=?").bind(rid,d.userId),await auditEntry(db,user.id,rid,"Revocó permiso de edición",null,{userId:d.userId})]);
        else{const hours=d.hours===null?null:Number(d.hours||24);if(hours!==null&&(!Number.isFinite(hours)||hours<=0||hours>8760))fail(400,"Duración inválida.");
          const expires=hours===null?null:Date.now()+hours*3600000;
          await db.batch([db.prepare("INSERT INTO grants (record_id,user_id,granted_by,expires_at,created_at) VALUES (?,?,?,?,?) ON CONFLICT (record_id,user_id) DO UPDATE SET granted_by=excluded.granted_by,expires_at=excluded.expires_at,created_at=excluded.created_at").bind(rid,d.userId,user.id,expires,iso()),await auditEntry(db,user.id,rid,"Otorgó permiso de edición",null,{userId:d.userId,expiresAt:expires})])}
        return json({ok:true});
      }
      await requireEdit(db,user,row);
      const lease=cleanText(d.leaseId,100);if(!lease&&action!=="owner")fail(400,"Identificador de edición inválido.");
      if(action==="lock"&&method==="POST"){
        if(d.force)admin(auth);
        const lock=await db.prepare("INSERT INTO record_locks (record_id,user_id,lease_id,expires_at) VALUES (?,?,?,?) ON CONFLICT (record_id) DO UPDATE SET user_id=excluded.user_id,lease_id=excluded.lease_id,expires_at=excluded.expires_at WHERE record_locks.expires_at<? OR (record_locks.lease_id=? AND record_locks.user_id=?) OR ?=1 RETURNING *").bind(rid,user.id,lease,Date.now()+LEASE_MS,Date.now(),lease,user.id,d.force?1:0).first();
        if(!lock){const c=await db.prepare("SELECT u.id,u.name FROM record_locks l JOIN users u ON u.id=l.user_id WHERE l.record_id=?").bind(rid).first();fail(423,(c?.name||"Otra persona")+" está editando este registro. Podés consultarlo mientras tanto.",{lockedBy:c?.id})}
        if(d.force)await(await auditEntry(db,user.id,rid,"Tomó el control de la edición")).run();
        return json({leaseId:lease,expiresAt:lock.expires_at});
      }
      if(action==="release"&&method==="POST"){await db.prepare("DELETE FROM record_locks WHERE record_id=? AND user_id=? AND lease_id=?").bind(rid,user.id,lease).run();return json({ok:true})}
      if(action==="owner"&&method==="POST"){
        admin(auth);if(!await db.prepare("SELECT id FROM users WHERE id=? AND active=1").bind(d.ownerId).first())fail(400,"Responsable inválido.");
        const mutation=id();
        const result=await db.batch([db.prepare("UPDATE records SET owner_id=?,version=version+1,updated_at=?,mutation_token=? WHERE id=? AND version=? AND archived=0 RETURNING version").bind(d.ownerId,iso(),mutation,rid,Number(d.version)),db.prepare("DELETE FROM record_locks WHERE record_id=? AND EXISTS (SELECT 1 FROM records WHERE id=? AND mutation_token=?)").bind(rid,rid,mutation),mutationAudit(db,mutation,user.id,rid,"Cambió el responsable",{ownerId:row.owner_id},{ownerId:d.ownerId})]);
        const updated=result[0].results[0];if(!updated)fail(409,"El registro cambió. Actualizá la ficha.");return json({ok:true,version:updated.version});
      }
      if((!action&&method==="PATCH")||(action==="archive"&&method==="POST")){
        if(action==="archive")admin(auth);const version=Number(d.version);if(!Number.isInteger(version)||version<1)fail(400,"Versión inválida.");
        const clean=action==="archive"?null:recordInput(d,row.module);if(clean)await validateLinks(db,clean.data);
        if(clean&&row.module==="offers"){
          const previous=JSON.parse(row.data);if(previous.emailSending)fail(409,"Hay un envío pendiente de confirmación. Conservá la oferta hasta revisar el correo.");
          for(const key of ["emailSentAt","emailProviderId"])if(previous[key]!==undefined)clean.data[key]=previous[key];
        }
        if(action==="archive"&&row.module==="stock"&&await db.prepare("SELECT id FROM records WHERE archived=0 AND id<>? AND data LIKE ?").bind(rid,"%"+rid+"%").first())fail(409,"Este vehículo tiene operaciones vinculadas. Conservá su ficha.");
        const now=Date.now(),mutation=id(),sql=clean?"UPDATE records SET title=?,status=?,data=?,version=version+1,updated_at=?,mutation_token=? WHERE id=? AND version=? AND archived=0 AND "+condition()+" RETURNING version":"UPDATE records SET archived=1,version=version+1,updated_at=?,mutation_token=? WHERE id=? AND version=? AND archived=0 AND "+condition()+" RETURNING version";
        const values=clean?[clean.title,clean.status,JSON.stringify(clean.data),iso(),mutation,rid,version]:[iso(),mutation,rid,version];
        const result=await db.batch([db.prepare(sql).bind(...values,user.role,user.id,user.id,now,user.id,lease,now),db.prepare("DELETE FROM record_locks WHERE record_id=? AND lease_id=? AND EXISTS (SELECT 1 FROM records WHERE id=? AND mutation_token=?)").bind(rid,lease,rid,mutation),mutationAudit(db,mutation,user.id,rid,clean?"Actualizó el registro":"Archivó el registro",{title:row.title,status:row.status,data:JSON.parse(row.data)},clean)]);
        const updated=result[0].results[0];if(!updated)await failedMutation(db,user,rid,version,lease);
        return json({ok:true,version:updated!.version});
      }
      if(action==="send"&&method==="POST"){
        if(row.module!=="offers"||row.status!=="Aprobada")fail(400,"Primero aprobá la oferta.");
        if(!env.RESEND_API_KEY||!env.MAIL_FROM)fail(503,"Configurá el servicio de correo para habilitar los envíos.");
        const data=JSON.parse(row.data);if(data.emailSentAt||data.emailSending)fail(409,"Revisá el estado del envío antes de reintentar.");
        const version=Number(d.version),now=Date.now();
        const reserved=await db.prepare("UPDATE records SET data=?,version=version+1,updated_at=? WHERE id=? AND version=? AND archived=0 AND "+condition()+" RETURNING version").bind(JSON.stringify({...data,emailSending:true}),iso(),rid,version,user.role,user.id,user.id,now,user.id,lease,now).first();
        if(!reserved)await failedMutation(db,user,rid,version,lease);
        const text="Hola "+data.contact+",\n\nNuestra propuesta para "+row.title+" es de "+money(offerAmount(data),data.currency)+".\n\n"+(data.notes||"")+"\n\nCarrito · Tienda de autos";
        const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"carrito-"+rid+"-"+version},body:JSON.stringify({from:env.MAIL_FROM,to:[validEmail(data.email)],subject:"Propuesta de Carrito: "+row.title,text})});
        if(!sent.ok){await db.prepare("UPDATE records SET data=? WHERE id=? AND version=?").bind(JSON.stringify(data),rid,reserved!.version).run();fail(502,"El servicio de correo no confirmó el envío. Revisá la oferta antes de reintentar.")}
        const result=await sent.json() as any;
        await db.batch([db.prepare("UPDATE records SET data=?,updated_at=? WHERE id=? AND version=?").bind(JSON.stringify({...data,emailSentAt:iso(),emailProviderId:result.id}),iso(),rid,reserved!.version),db.prepare("DELETE FROM record_locks WHERE record_id=? AND lease_id=?").bind(rid,lease),await auditEntry(db,user.id,rid,"Envió la oferta por email",null,{providerId:result.id})]);return json({ok:true});
      }
      fail(405,"Acción no disponible.");
    }
    if(path==="/users"&&method==="POST"){
      admin(auth);const d=await body(req),name=cleanText(d.name),email=validEmail(d.email),pass=strongPassword(d.password);
      if(!name)fail(400,"Ingresá el nombre.");if(!["employee","admin"].includes(d.role))fail(400,"Rol inválido.");
      if(await db.prepare("SELECT id FROM users WHERE email=?").bind(email).first())fail(409,"Ya existe una cuenta con ese email.");
      const uid=id();await db.batch([db.prepare("INSERT INTO users (id,name,email,role,password_hash,active,must_change_password,created_at) VALUES (?,?,?,?,?,1,1,?)").bind(uid,name,email,d.role,await passwordHash(pass),iso()),await auditEntry(db,user.id,null,"Creó una cuenta",null,{userId:uid,name,email,role:d.role})]);return json({id:uid},201);
    }
    const um=path.match(/^\/users\/([^/]+)$/);
    if(um&&method==="PATCH"){
      admin(auth);const uid=um[1],d=await body(req),target=await db.prepare("SELECT id,name,email,role,active FROM users WHERE id=?").bind(uid).first();if(!target)fail(404,"Cuenta no encontrada.");
      const role=d.role===undefined?target.role:d.role,active=d.active===undefined?target.active:(d.active?1:0);
      if(!["admin","employee"].includes(role))fail(400,"Rol inválido.");if(uid===user.id&&(!active||role!=="admin"))fail(400,"No podés quitar tu propio acceso de administrador.");
      const pass=d.password?await passwordHash(strongPassword(d.password)):null;
      await db.batch([db.prepare("UPDATE users SET name=?,role=?,active=?,password_hash=COALESCE(?,password_hash),must_change_password=CASE WHEN CAST(? AS TEXT) IS NULL THEN must_change_password ELSE 1 END WHERE id=?").bind(cleanText(d.name||target.name),role,active,pass,pass,uid),db.prepare("DELETE FROM sessions WHERE user_id=?").bind(uid),db.prepare("DELETE FROM record_locks WHERE user_id=?").bind(uid),await auditEntry(db,user.id,null,"Actualizó una cuenta",target,{userId:uid,role,active,passwordReset:!!pass})]);return json({ok:true});
    }
    const dm=path.match(/^\/requests\/([^/]+)$/);
    if(dm&&method==="POST"){
      admin(auth);const d=await body(req),pending=await db.prepare("SELECT * FROM access_requests WHERE id=? AND status='pending'").bind(dm[1]).first();if(!pending)fail(409,"La solicitud ya fue resuelta.");
      await recordFor(db,pending.record_id);if(!["approved","rejected"].includes(d.status))fail(400,"Decisión inválida.");
      const decision=id(),statements:Prepared[]=[db.prepare("UPDATE access_requests SET status=?,decided_by=?,decided_at=?,decision_token=? WHERE id=? AND status='pending' RETURNING id").bind(d.status,user.id,iso(),decision,pending.id)];
      if(d.status==="approved"){
        if(!await db.prepare("SELECT id FROM users WHERE id=? AND active=1").bind(pending.user_id).first())fail(400,"La cuenta solicitante está desactivada.");
        statements.push(db.prepare("INSERT INTO grants (record_id,user_id,granted_by,expires_at,created_at) SELECT ?,?,?,?,? FROM access_requests WHERE id=? AND decision_token=? ON CONFLICT (record_id,user_id) DO UPDATE SET granted_by=excluded.granted_by,expires_at=excluded.expires_at,created_at=excluded.created_at").bind(pending.record_id,pending.user_id,user.id,Date.now()+86400000,iso(),pending.id,decision));
      }
      statements.push(db.prepare("INSERT INTO audit (id,user_id,record_id,action,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,? FROM access_requests WHERE id=? AND decision_token=?").bind(id(),user.id,pending.record_id,d.status==="approved"?"Aprobó permiso de edición por 24 horas":"Rechazó solicitud de edición",null,JSON.stringify({userId:pending.user_id}),iso(),pending.id,decision));
      const result=await db.batch(statements);if(!result[0].results[0])fail(409,"La solicitud ya fue resuelta por otro administrador.");return json({ok:true});
    }
    fail(404,"Recurso no encontrado.");
  }catch(e){if(e instanceof ApiError)return json({error:e.message,details:e.details},e.status);console.error("Carrito API:",e instanceof Error?e.message:e);return json({error:"No se pudo completar la operación. Tus cambios no se descartaron."},500)}
}
