import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {handleApi,type AppEnv} from "../lib/api";
import {sqliteDatabase,postgresParameters} from "../server/database";

type Actor={cookie:string;csrf:string};
async function call(env:AppEnv,url:string,method="GET",data?:any,actor?:Actor,overrides:Record<string,string>={}){
  const response=await handleApi(new Request("https://carrito.test/api"+url,{method,headers:{"Content-Type":"application/json",...(actor?{cookie:actor.cookie,"x-csrf-token":actor.csrf}:{}),...overrides},...(data===undefined?{}:{body:JSON.stringify(data)})}),env);
  return {status:response.status,data:await response.json() as any,response};
}
async function actor(env:AppEnv,userId:string){const r=await call(env,"/demo","POST",{userId});assert.equal(r.status,200);return {cookie:r.response.headers.get("set-cookie")!.split(";")[0],csrf:r.data.csrf}}
async function fixture(){const storage=sqliteDatabase(":memory:");const env:AppEnv={DB:storage.db,DEMO_MODE:"true"};return {env,close:storage.close,admin:await actor(env,"demo-admin"),lucia:await actor(env,"demo-lucia"),mateo:await actor(env,"demo-mateo")}}
const purchase=(title="Cambio del dueño")=>({title,status:"Contactado",data:{contact:"Cliente de prueba",currency:"USD",amount:12000}});

test("Sesiones individuales, cookies protegidas y consultas sin contraseñas",async()=>{
  const f=await fixture();try{
    assert.equal((await call(f.env,"/state")).status,401);
    const r=await call(f.env,"/state","GET",undefined,f.mateo);assert.equal(r.status,200);assert.equal(r.data.records.length,15);assert.equal(r.data.records.find((x:any)=>x.id==="lead-001").canEdit,false);
    assert.equal(r.data.records.find((x:any)=>x.id==="lead-002").canEdit,true);assert.ok(r.data.users.every((u:any)=>!u.password_hash));
    const login=await call(f.env,"/login","POST",{email:"lucia@carrito.example",password:"CarritoDemo2026!"});assert.equal(login.status,200);
    const cookie=login.response.headers.get("set-cookie")!;for(const flag of ["HttpOnly","Secure","SameSite=Lax"])assert.ok(cookie.includes(flag));
    assert.notEqual(f.lucia.cookie,f.mateo.cookie);
  }finally{f.close()}
});
test("Un empleado consulta fichas ajenas, pero el servidor bloquea editar y administrar",async()=>{
  const f=await fixture();try{
    assert.equal((await call(f.env,"/records/lead-001","GET",undefined,f.mateo)).status,200);
    assert.equal((await call(f.env,"/records/lead-001","PATCH",{...purchase(),version:1,leaseId:"invento"},f.mateo)).status,403);
    assert.equal((await call(f.env,"/records/lead-001/lock","POST",{leaseId:"invento",force:true},f.mateo)).status,403);
    assert.equal((await call(f.env,"/records/lead-001/grant","POST",{userId:"demo-mateo"},f.mateo)).status,403);
    assert.equal((await call(f.env,"/users","POST",{name:"Intruso"},f.lucia)).status,403);
    const row=await call(f.env,"/records/lead-001","GET",undefined,f.admin);assert.equal(row.data.version,1);assert.equal(row.data.title,"Volkswagen Golf 1.4 TSI");
  }finally{f.close()}
});
test("Crear asigna la propiedad al empleado y no permite inventar módulos",async()=>{
  const f=await fixture();try{
    const r=await call(f.env,"/records","POST",{...purchase("Ficha nueva"),module:"purchases",ownerId:"demo-admin"},f.lucia);assert.equal(r.status,201);
    const saved=await call(f.env,"/records/"+r.data.id,"GET",undefined,f.admin);assert.equal(saved.data.owner_id,"demo-lucia");
    assert.equal((await call(f.env,"/records","POST",{...purchase(),module:"__proto__"},f.lucia)).status,400);
    assert.equal((await call(f.env,"/records","POST",{...purchase(),module:"constructor"},f.lucia)).status,400);
  }finally{f.close()}
});
test("Solicitar, aprobar y revocar permiso afecta realmente al acceso de edición",async()=>{
  const f=await fixture();try{
    for(let i=0;i<2;i++)assert.equal((await call(f.env,"/records/lead-001/request","POST",{reason:"Cubrir el seguimiento"},f.mateo)).status,200);
    const state=await call(f.env,"/state","GET",undefined,f.admin);assert.equal(state.data.requests.length,1);
    assert.equal((await call(f.env,"/requests/"+state.data.requests[0].id,"POST",{status:"approved"},f.admin)).status,200);
    assert.equal((await call(f.env,"/records/lead-001/lock","POST",{leaseId:"permiso"},f.mateo)).status,200);
    assert.equal((await call(f.env,"/records/lead-001/grant","POST",{userId:"demo-mateo",revoke:true},f.admin)).status,200);
    assert.equal((await call(f.env,"/records/lead-001","PATCH",{...purchase(),version:1,leaseId:"permiso"},f.mateo)).status,403);
    assert.equal((await call(f.env,"/records/lead-001/lock","POST",{leaseId:"otro"},f.lucia)).status,200);
  }finally{f.close()}
});
test("Dos editores simultáneos obtienen un único bloqueo; solo admin puede tomar control",async()=>{
  const f=await fixture();try{
    const race=await Promise.all([call(f.env,"/records/lead-001/lock","POST",{leaseId:"a"},f.lucia),call(f.env,"/records/lead-001/lock","POST",{leaseId:"b"},f.admin)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,423]);
    assert.equal((await call(f.env,"/records/lead-001/lock","POST",{leaseId:"c",force:true},f.lucia)).status,403);
    assert.equal((await call(f.env,"/records/lead-001/lock","POST",{leaseId:"admin",force:true},f.admin)).status,200);
    assert.equal((await call(f.env,"/records/lead-001","PATCH",{...purchase(),version:1,leaseId:"a"},f.lucia)).status,423);
  }finally{f.close()}
});
test("Dos pestañas de la misma cuenta no se pisan y una renovación conserva la edición",async()=>{
  const f=await fixture();try{
    assert.equal((await call(f.env,"/records/lead-001/lock","POST",{leaseId:"pestana-1"},f.lucia)).status,200);
    assert.equal((await call(f.env,"/records/lead-001/lock","POST",{leaseId:"pestana-2"},f.lucia)).status,423);
    assert.equal((await call(f.env,"/records/lead-001/lock","POST",{leaseId:"pestana-1"},f.lucia)).status,200);
  }finally{f.close()}
});
test("Una versión desactualizada jamás sobrescribe un guardado y no agrega historial falso",async()=>{
  const f=await fixture();try{
    await call(f.env,"/records/lead-001/lock","POST",{leaseId:"original"},f.lucia);
    assert.equal((await call(f.env,"/records/lead-001","PATCH",{...purchase("Guardado válido"),version:1,leaseId:"original"},f.lucia)).status,200);
    await call(f.env,"/records/lead-001/lock","POST",{leaseId:"nuevo"},f.admin);
    const stale=await call(f.env,"/records/lead-001","PATCH",{...purchase("Intento viejo"),version:1,leaseId:"nuevo"},f.admin);assert.equal(stale.status,409);assert.equal(stale.data.details.record.title,"Guardado válido");
    const current=await call(f.env,"/records/lead-001","GET",undefined,f.admin);assert.equal(current.data.version,2);assert.equal(current.data.title,"Guardado válido");
    const audit=await f.env.DB.prepare("SELECT * FROM audit WHERE record_id=? AND action='Actualizó el registro'").bind("lead-001").all();assert.equal(audit.results.length,1);assert.equal(audit.results[0].user_id,"demo-lucia");
  }finally{f.close()}
});
test("Bloqueos y permisos vencidos se rechazan al guardar",async()=>{
  const f=await fixture();try{
    await call(f.env,"/records/lead-001/lock","POST",{leaseId:"vencido"},f.lucia);
    await f.env.DB.prepare("UPDATE record_locks SET expires_at=? WHERE record_id=?").bind(Date.now()-1,"lead-001").run();
    assert.equal((await call(f.env,"/records/lead-001","PATCH",{...purchase(),version:1,leaseId:"vencido"},f.lucia)).status,423);
    await f.env.DB.prepare("UPDATE grants SET expires_at=? WHERE record_id=? AND user_id=?").bind(Date.now()-1,"lead-005","demo-lucia").run();
    assert.equal((await call(f.env,"/records/lead-005/lock","POST",{leaseId:"vencido"},f.lucia)).status,403);
  }finally{f.close()}
});
test("Cambiar responsable invalida la edición previa y conserva la nueva propiedad",async()=>{
  const f=await fixture();try{
    await call(f.env,"/records/lead-001/lock","POST",{leaseId:"dueño"},f.lucia);
    assert.equal((await call(f.env,"/records/lead-001/owner","POST",{ownerId:"demo-mateo",version:1},f.admin)).status,200);
    assert.equal((await call(f.env,"/records/lead-001","PATCH",{...purchase(),version:1,leaseId:"dueño"},f.lucia)).status,403);
    const row=await call(f.env,"/records/lead-001","GET",undefined,f.mateo);assert.equal(row.data.canEdit,true);assert.equal(row.data.version,2);
  }finally{f.close()}
});
test("Decisiones simultáneas de permisos registran una única resolución",async()=>{
  const f=await fixture();try{
    await call(f.env,"/records/lead-001/request","POST",{reason:"Ayudar"},f.mateo);
    const request=(await call(f.env,"/state","GET",undefined,f.admin)).data.requests[0];
    const race=await Promise.all([call(f.env,"/requests/"+request.id,"POST",{status:"approved"},f.admin),call(f.env,"/requests/"+request.id,"POST",{status:"rejected"},f.admin)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
    const resolution=await f.env.DB.prepare("SELECT status FROM access_requests WHERE id=?").bind(request.id).first();
    const grant=await f.env.DB.prepare("SELECT * FROM grants WHERE record_id=? AND user_id=?").bind("lead-001","demo-mateo").first();assert.equal(!!grant,resolution.status==="approved");
  }finally{f.close()}
});
test("CSRF, origen externo y sesiones de cuentas desactivadas se rechazan",async()=>{
  const f=await fixture();try{
    assert.equal((await call(f.env,"/records","POST",{...purchase(),module:"purchases"},f.lucia,{"x-csrf-token":"incorrecto"})).status,403);
    assert.equal((await call(f.env,"/records","POST",{...purchase(),module:"purchases"},f.lucia,{origin:"https://otra-web.test"})).status,403);
    assert.equal((await call(f.env,"/users/demo-mateo","PATCH",{active:false},f.admin)).status,200);
    assert.equal((await call(f.env,"/state","GET",undefined,f.mateo)).status,401);
    assert.equal((await call(f.env,"/users/demo-admin","PATCH",{active:false},f.admin)).status,400);
  }finally{f.close()}
});
test("Cuentas nuevas exigen cambiar contraseña y la instalación real deshabilita demos",async()=>{
  const f=await fixture();try{
    const created=await call(f.env,"/users","POST",{name:"Nuevo empleado",email:"nuevo@example.com",role:"employee",password:"TemporalSegura2026!"},f.admin);assert.equal(created.status,201);
    const login=await call(f.env,"/login","POST",{email:"nuevo@example.com",password:"TemporalSegura2026!"});const newcomer={cookie:login.response.headers.get("set-cookie")!.split(";")[0],csrf:login.data.csrf};assert.equal(login.data.user.must_change_password,1);
    assert.equal((await call(f.env,"/records","POST",{...purchase(),module:"purchases"},newcomer)).status,403);
    assert.equal((await call(f.env,"/password","POST",{currentPassword:"TemporalSegura2026!",newPassword:"NuevaClavePersonal2026!"},newcomer)).status,200);
    assert.equal((await call(f.env,"/records","POST",{...purchase(),module:"purchases"},newcomer)).status,201);
    assert.equal((await call({...f.env,DEMO_MODE:"false"},"/demo","POST",{userId:"demo-admin"})).status,404);
  }finally{f.close()}
});
test("Los cambios persisten al cerrar y reabrir la base; el adaptador respeta literales SQL",async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"carrito-test-")),filename=path.join(directory,"db.sqlite");
  try{
    let storage=sqliteDatabase(filename);let env:AppEnv={DB:storage.db,SETUP_TOKEN:"test-only-setup"};
    assert.equal((await call(env,"/bootstrap","POST",{name:"Admin real",email:"admin@example.com",password:"PersonalSegura2026!",setupToken:"test-only-setup"})).status,201);storage.close();
    storage=sqliteDatabase(filename);env={DB:storage.db,SETUP_TOKEN:"test-only-setup"};try{assert.equal((await call(env,"/login","POST",{email:"admin@example.com",password:"PersonalSegura2026!"})).status,200);assert.equal((await call(env,"/bootstrap","POST",{name:"Otro",email:"otro@example.com",password:"PersonalSegura2026!",setupToken:"test-only-setup"})).status,409)}finally{storage.close()}
    assert.equal(postgresParameters("SELECT '?' AS a,? AS b,'it''s ?' AS c,? AS d"),"SELECT '?' AS a,$1 AS b,'it''s ?' AS c,$2 AS d");
  }finally{rmSync(directory,{recursive:true,force:true})}
});
