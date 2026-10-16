import {createInterface} from "node:readline/promises";
import {stdin,stdout} from "node:process";
const cli=createInterface({input:stdin,output:stdout});
try{
  const name=await cli.question("Nombre del administrador: "),email=await cli.question("Email: ");
  // Se pide por entorno para evitar que el terminal registre contraseñas.
  const setupToken=process.env.SETUP_TOKEN,password=process.env.INITIAL_ADMIN_PASSWORD;
  if(!setupToken||!password)throw new Error("Definí SETUP_TOKEN e INITIAL_ADMIN_PASSWORD en el entorno antes de ejecutar. No se guardan en el repositorio.");
  const response=await fetch((process.env.APP_ORIGIN||"http://localhost:3000")+"/api/bootstrap",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,password,setupToken})});
  const result=await response.json();if(!response.ok)throw new Error(result.error);stdout.write("Administrador creado. Ingresá desde la pantalla de acceso. Quitá SETUP_TOKEN e INITIAL_ADMIN_PASSWORD del entorno.\n");
}catch(error){stdout.write((error instanceof Error?error.message:"No se pudo crear el administrador")+"\n");process.exitCode=1}finally{cli.close()}
