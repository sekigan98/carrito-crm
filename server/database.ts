import {DatabaseSync,type SQLInputValue} from "node:sqlite";
import {mkdirSync,readFileSync,readdirSync} from "node:fs";
import path from "node:path";
import type {Database,Prepared} from "../lib/api";

type QueryResult={results:any[];meta:{changes:number}};
export function sqliteDatabase(filename:string,migrations=path.resolve("drizzle")){
  if(filename!==":memory:")mkdirSync(path.dirname(filename),{recursive:true});
  const connection=new DatabaseSync(filename);
  connection.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  if(filename!==":memory:")connection.exec("PRAGMA journal_mode=WAL;");
  connection.exec("CREATE TABLE IF NOT EXISTS carrito_migrations (name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)");
  for(const name of readdirSync(migrations).filter(n=>n.endsWith(".sql")).sort()){
    if(connection.prepare("SELECT name FROM carrito_migrations WHERE name=?").get(name))continue;
    connection.exec("BEGIN IMMEDIATE");
    try{connection.exec(readFileSync(path.join(migrations,name),"utf8"));connection.prepare("INSERT INTO carrito_migrations VALUES (?,?)").run(name,new Date().toISOString());connection.exec("COMMIT")}
    catch(e){connection.exec("ROLLBACK");throw e}
  }
  class Statement implements Prepared{
    constructor(readonly sql:string,readonly values:unknown[]=[]){ }
    bind(...values:unknown[]){return new Statement(this.sql,values)}
    execute():QueryResult{
      const statement=connection.prepare(this.sql),values=this.values as SQLInputValue[];
      if(statement.columns().length)return {results:statement.all(...values),meta:{changes:0}};
      const result=statement.run(...values);return {results:[],meta:{changes:Number(result.changes)}};
    }
    async first<T=any>():Promise<T|null>{return (this.execute().results[0] as T)||null}
    async all<T=any>():Promise<{results:T[]}>{return this.execute()}
    async run(){return this.execute()}
  }
  const db:Database={prepare:sql=>new Statement(sql),async batch(statements){
    connection.exec("BEGIN IMMEDIATE");
    try{const results=statements.map(s=>{if(!(s instanceof Statement))throw new Error("Invalid database statement");return s.execute()});connection.exec("COMMIT");return results}
    catch(e){connection.exec("ROLLBACK");throw e}
  }};
  return {db,close:()=>connection.close()};
}

export function postgresParameters(sql:string){
  let output="",quoted=false,count=0;
  for(let i=0;i<sql.length;i++){
    const c=sql[i];
    if(c==="'"){output+=c;if(quoted&&sql[i+1]==="'"){output+="'";i++}else quoted=!quoted}
    else output+=c==="?"&&!quoted?"$"+(++count):c;
  }return output;
}
export async function postgresDatabase(url:string,migrations=path.resolve("drizzle")){
  const {Pool,types}=await import("pg");
  types.setTypeParser(20,value=>{const number=Number(value);if(!Number.isSafeInteger(number))throw new Error("Unsafe database integer");return number});
  const pool=new Pool({connectionString:url,max:10,...(process.env.PGSSL==="true"?{ssl:{rejectUnauthorized:true}}:{})});
  const client=await pool.connect();
  try{
    await client.query("SELECT pg_advisory_lock(784235123)");
    await client.query("CREATE TABLE IF NOT EXISTS carrito_migrations (name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)");
    const order=["users","records","sessions","grants","record_locks","access_requests","audit","login_attempts"];
    for(const name of readdirSync(migrations).filter(n=>n.endsWith(".sql")).sort()){
      if((await client.query("SELECT name FROM carrito_migrations WHERE name=$1",[name])).rowCount)continue;
      const statements=readFileSync(path.join(migrations,name),"utf8").split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean).map(s=>s.replace(/`([^`]+)`/g,'"$1"').replace(/\binteger\b/gi,"BIGINT"));
      const tableName=(s:string)=>s.match(/^CREATE TABLE "([^"]+)"/)?.[1];
      const creates=statements.filter(tableName).sort((a,b)=>order.indexOf(tableName(a)!)-order.indexOf(tableName(b)!));
      await client.query("BEGIN");
      try{for(const sql of [...creates,...statements.filter(s=>!tableName(s))])await client.query(sql);await client.query("INSERT INTO carrito_migrations VALUES ($1,$2)",[name,new Date().toISOString()]);await client.query("COMMIT")}
      catch(e){await client.query("ROLLBACK");throw e}
    }
  }finally{await client.query("SELECT pg_advisory_unlock(784235123)");client.release()}
  class Statement implements Prepared{
    constructor(readonly sql:string,readonly values:unknown[]=[]){ }
    bind(...values:unknown[]){return new Statement(this.sql,values)}
    async execute(connection=pool):Promise<QueryResult>{const r=await connection.query(postgresParameters(this.sql),this.values);return {results:r.rows,meta:{changes:r.rowCount||0}}}
    async first<T=any>():Promise<T|null>{return (await this.execute()).results[0]||null}
    async all<T=any>():Promise<{results:T[]}>{return this.execute()}
    async run(){return this.execute()}
  }
  const db:Database={prepare:sql=>new Statement(sql),async batch(statements){
    const connection=await pool.connect();await connection.query("BEGIN");
    try{const results=[];for(const s of statements){if(!(s instanceof Statement))throw new Error("Invalid database statement");const r=await connection.query(postgresParameters(s.sql),s.values);results.push({results:r.rows,meta:{changes:r.rowCount||0}})}await connection.query("COMMIT");return results}
    catch(e){await connection.query("ROLLBACK");throw e}finally{connection.release()}
  }};
  return {db,close:()=>pool.end()};
}
