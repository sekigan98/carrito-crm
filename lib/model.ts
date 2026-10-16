export type Module = "purchases" | "sales" | "stock" | "expenses" | "offers" | "contracts";
export type Field = {key:string; label:string; type?:string; required?:boolean; options?:string[]; wide?:boolean};
export type User = {id:string; name:string; email:string; role:"admin"|"employee"; active:number; must_change_password?:number};
export type RecordItem = {
  id:string; module:Module; title:string; status:string; owner_id:string; data:Record<string,string|number>;
  version:number; created_at:string; updated_at:string; canEdit:boolean; lockedBy?:string|null; lockExpiresAt?:number;
};
export const MODULES: Record<Module,{label:string;singular:string;statuses:string[];fields:Field[]}> = {
  purchases:{label:"Leads de compras",singular:"lead de compra",statuses:["Nuevo","Contactado","Cotizado","Inspección","Comprado","Descartado"],fields:[
    {key:"contact",label:"Nombre y apellido",required:true},{key:"phone",label:"Teléfono"},{key:"email",label:"Email",type:"email"},
    {key:"source",label:"Canal",options:["Web","WhatsApp","Instagram","Facebook","Referido","Publicidad","Otro"]},
    {key:"year",label:"Año",type:"number"},{key:"km",label:"Kilometraje",type:"number"},{key:"plate",label:"Patente"},{key:"location",label:"Localidad"},
    {key:"fuel",label:"Combustible",options:["Nafta","Diésel","GNC","Híbrido","Eléctrico"]},{key:"transmission",label:"Transmisión",options:["Manual","Automática"]},
    {key:"amount",label:"Valor de referencia",type:"number"},{key:"currency",label:"Moneda",options:["ARS","USD"]},
    {key:"nextContact",label:"Próximo contacto",type:"datetime-local"},{key:"notes",label:"Notas",type:"textarea",wide:true}]},
  sales:{label:"CRM de ventas",singular:"lead de venta",statuses:["Nuevo","Contactado","Visita agendada","Negociación","Señado","Vendido","Descartado"],fields:[
    {key:"contact",label:"Nombre y apellido",required:true},{key:"phone",label:"Teléfono"},{key:"email",label:"Email",type:"email"},
    {key:"vehicleId",label:"Vehículo",type:"vehicle"},{key:"source",label:"Canal",options:["Web","WhatsApp","Instagram","Facebook","Referido","Publicidad","Otro"]},
    {key:"nextContact",label:"Próximo contacto",type:"datetime-local"},{key:"amount",label:"Importe negociado",type:"number"},
    {key:"currency",label:"Moneda",options:["ARS","USD"]},{key:"deposit",label:"Seña",type:"number"},{key:"notes",label:"Notas",type:"textarea",wide:true}]},
  stock:{label:"Stock de vehículos",singular:"vehículo",statuses:["Ingresado","En taller","Disponible","Reservado","Vendido"],fields:[
    {key:"plate",label:"Patente",required:true},{key:"year",label:"Año",type:"number"},{key:"km",label:"Kilometraje",type:"number"},
    {key:"fuel",label:"Combustible",options:["Nafta","Diésel","GNC","Híbrido","Eléctrico"]},{key:"transmission",label:"Transmisión",options:["Manual","Automática"]},
    {key:"operation",label:"Operación",options:["Compra","Consignación","Permuta"]},{key:"purchasePrice",label:"Costo de compra",type:"number"},
    {key:"amount",label:"Precio de publicación",type:"number"},{key:"currency",label:"Moneda",options:["ARS","USD"]},{key:"location",label:"Ubicación"},
    {key:"chassis",label:"Chasis"},{key:"engine",label:"Motor"},{key:"notes",label:"Documentación y observaciones",type:"textarea",wide:true}]},
  expenses:{label:"Gastos",singular:"gasto",statuses:["Pendiente","Pagado"],fields:[
    {key:"provider",label:"Proveedor",required:true},{key:"category",label:"Categoría",options:["Mecánica","Chapa y pintura","Lavado","Detailing","Gestoría","Publicidad","Oficina","Comisiones","Otro"]},
    {key:"vehicleId",label:"Vehículo (opcional)",type:"vehicle"},{key:"date",label:"Fecha",type:"date",required:true},
    {key:"amount",label:"Importe",type:"number",required:true},{key:"currency",label:"Moneda",options:["ARS","USD"],required:true},
    {key:"paymentMethod",label:"Medio de pago",options:["Transferencia","Efectivo","Mercado Pago","Tarjeta","Otro"]},{key:"notes",label:"Detalle",type:"textarea",wide:true}]},
  offers:{label:"Ofertas",singular:"oferta",statuses:["Borrador","Aprobada","Aceptada","Rechazada"],fields:[
    {key:"contact",label:"Cliente",required:true},{key:"email",label:"Email",type:"email",required:true},
    {key:"operation",label:"Modalidad",options:["Compra inmediata","Consignación"]},{key:"basePrice",label:"Valor de venta estimado",type:"number",required:true},
    {key:"marginPercent",label:"Margen (%)",type:"number",required:true},{key:"estimatedCosts",label:"Gastos estimados",type:"number"},
    {key:"currency",label:"Moneda",options:["ARS","USD"],required:true},{key:"expires",label:"Válida hasta",type:"date"},
    {key:"notes",label:"Condiciones de la oferta",type:"textarea",wide:true}]},
  contracts:{label:"Contratos",singular:"documento",statuses:["Borrador","Revisado","Firmado"],fields:[
    {key:"type",label:"Tipo de documento",options:["Compra","Venta","Consignación","Reserva","Recibo"],required:true},
    {key:"contact",label:"Cliente",required:true},{key:"document",label:"DNI / CUIT / CUIL"},{key:"address",label:"Domicilio"},
    {key:"vehicleId",label:"Vehículo",type:"vehicle"},{key:"date",label:"Fecha",type:"date"},{key:"amount",label:"Importe",type:"number"},
    {key:"currency",label:"Moneda",options:["ARS","USD"]},{key:"terms",label:"Texto del documento",type:"textarea",wide:true,required:true},
    {key:"notes",label:"Observaciones internas",type:"textarea",wide:true}]},
};
export function offerAmount(d:Record<string,string|number>) {
  return Math.max(0,Math.round((Number(d.basePrice||0)*(1-Number(d.marginPercent||0)/100)-Number(d.estimatedCosts||0))*100)/100);
}
export function money(amount:number,currency="ARS") { return new Intl.NumberFormat("es-AR",{style:"currency",currency,maximumFractionDigits:0}).format(amount); }
export function initials(name:string) { return name.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase(); }
