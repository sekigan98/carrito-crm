import { passwordHash,type AppEnv } from "./api";
import type { Module } from "./model";
function todayAt(hours:number,minutes:number){const d=new Date();d.setUTCHours(hours,minutes,0,0);return d.toISOString().slice(0,16)}
export async function ensureDemo(env:AppEnv){
  if(env.DEMO_MODE!=="true")return;
  if(await env.DB.prepare("SELECT id FROM records WHERE id='contract-001'").first())return;
  const now=new Date().toISOString(),pass=await passwordHash("CarritoDemo2026!");
  const users=[
    ["demo-admin","Administrador","admin@carrito.example","admin"],
    ["demo-lucia","Lucía Méndez","lucia@carrito.example","employee"],
    ["demo-mateo","Mateo Ruiz","mateo@carrito.example","employee"],
  ];
  await env.DB.batch(users.map(u=>env.DB.prepare("INSERT INTO users (id,name,email,role,password_hash,active,must_change_password,created_at) VALUES (?,?,?,?,?,1,0,?) ON CONFLICT (id) DO NOTHING").bind(...u,pass,now)));
  const sample:{id:string;module:Module;title:string;status:string;owner:string;data:any}[]=[
    {id:"lead-001",module:"purchases",title:"Volkswagen Golf 1.4 TSI",status:"Nuevo",owner:"demo-lucia",data:{contact:"Carolina Torres",phone:"223 555-0101",email:"carolina@example.com",year:2018,km:78000,source:"Web",currency:"USD",amount:16500,nextContact:todayAt(11,0),notes:"Busca una cotización de compra inmediata. Manual, único dueño."}},
    {id:"lead-002",module:"purchases",title:"Toyota Corolla XEI",status:"Nuevo",owner:"demo-mateo",data:{contact:"Julián Romero",phone:"223 555-0102",year:2020,km:52000,source:"WhatsApp",currency:"USD",amount:20500,nextContact:todayAt(12,30),notes:"Enviar propuesta después de revisar la documentación."}},
    {id:"lead-003",module:"purchases",title:"Ford Ranger XLT 4x4",status:"Contactado",owner:"demo-mateo",data:{contact:"Sofía Acosta",phone:"223 555-0103",year:2019,km:113000,source:"Referido",currency:"USD",amount:26000,nextContact:todayAt(15,0),notes:"Disponible para inspección el viernes."}},
    {id:"lead-004",module:"purchases",title:"Peugeot 208 Allure",status:"Contactado",owner:"demo-lucia",data:{contact:"Marcos Benítez",phone:"223 555-0104",year:2022,km:31000,source:"Instagram",currency:"ARS",amount:22500000,notes:"Evalúa consignación."}},
    {id:"lead-005",module:"purchases",title:"Renault Duster Privilege",status:"Cotizado",owner:"demo-mateo",data:{contact:"Valentina Díaz",phone:"223 555-0105",year:2017,km:96000,source:"Web",currency:"USD",amount:11500,notes:"Oferta preparada. Esperando respuesta."}},
    {id:"lead-006",module:"purchases",title:"Fiat Toro Freedom",status:"Inspección",owner:"demo-lucia",data:{contact:"Nicolás Paz",phone:"223 555-0106",year:2021,km:65000,source:"WhatsApp",currency:"USD",amount:24500,nextContact:todayAt(16,30),notes:"Revisar tren delantero y estado de cubiertas."}},
    {id:"stock-001",module:"stock",title:"Volkswagen Golf 1.4 Comfortline",status:"Disponible",owner:"demo-mateo",data:{plate:"AB123CD",year:2017,km:102000,purchasePrice:13000,amount:16500,currency:"USD",operation:"Compra",location:"Salón",transmission:"Automática",fuel:"Nafta"}},
    {id:"stock-002",module:"stock",title:"Toyota Yaris XLS CVT",status:"Reservado",owner:"demo-lucia",data:{plate:"AC456EF",year:2022,km:13000,purchasePrice:17000,amount:19900,currency:"USD",operation:"Compra",location:"Salón"}},
    {id:"stock-003",module:"stock",title:"Renault Duster 1.6",status:"En taller",owner:"demo-mateo",data:{plate:"AD789GH",year:2018,km:85000,purchasePrice:10200,amount:12500,currency:"USD",operation:"Consignación",location:"Taller"}},
    {id:"sale-001",module:"sales",title:"Consulta por Volkswagen Golf",status:"Visita agendada",owner:"demo-lucia",data:{contact:"Federico Salas",phone:"223 555-0107",vehicleId:"stock-001",currency:"USD",amount:16500,nextContact:todayAt(17,0),source:"Web"}},
    {id:"sale-002",module:"sales",title:"Reserva Toyota Yaris",status:"Señado",owner:"demo-mateo",data:{contact:"Paula Moreno",phone:"223 555-0108",vehicleId:"stock-002",currency:"USD",amount:19900,deposit:500,source:"Referido"}},
    {id:"expense-001",module:"expenses",title:"Service y cambio de filtros",status:"Pagado",owner:"demo-mateo",data:{provider:"Taller de ejemplo",category:"Mecánica",vehicleId:"stock-001",date:now.slice(0,10),amount:185000,currency:"ARS",paymentMethod:"Transferencia"}},
    {id:"expense-002",module:"expenses",title:"Detailing interior",status:"Pendiente",owner:"demo-lucia",data:{provider:"Detailing de ejemplo",category:"Detailing",vehicleId:"stock-002",date:now.slice(0,10),amount:120000,currency:"ARS",paymentMethod:"Transferencia"}},
    {id:"offer-001",module:"offers",title:"Propuesta Renault Duster",status:"Borrador",owner:"demo-mateo",data:{contact:"Valentina Díaz",email:"valentina@example.com",operation:"Compra inmediata",basePrice:11500,marginPercent:15,estimatedCosts:450,currency:"USD",notes:"Sujeta a inspección del vehículo y revisión de documentación."}},
    {id:"contract-001",module:"contracts",title:"Reserva Toyota Yaris",status:"Borrador",owner:"demo-lucia",data:{type:"Reserva",contact:"Paula Moreno",vehicleId:"stock-002",amount:500,currency:"USD",date:now.slice(0,10),terms:"Documento de ejemplo. Reemplazar este texto por el modelo de reserva utilizado por la empresa antes de emitirlo."}},
  ];
  await env.DB.batch(sample.map(r=>env.DB.prepare("INSERT INTO records (id,module,title,status,owner_id,data,version,archived,created_at,updated_at) VALUES (?,?,?,?,?,?,1,0,?,?) ON CONFLICT (id) DO NOTHING").bind(r.id,r.module,r.title,r.status,r.owner,JSON.stringify(r.data),now,now)));
  await env.DB.prepare("INSERT INTO grants (record_id,user_id,granted_by,expires_at,created_at) VALUES ('lead-005','demo-lucia','demo-admin',NULL,?) ON CONFLICT (record_id,user_id) DO NOTHING").bind(now).run();
}
