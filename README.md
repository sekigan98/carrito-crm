# Carrito · Gestión del equipo

Versión 1.0.1 · Identidad oficial de Carrito

Primera versión funcional del panel interno de una tienda de autos. Incluye cuentas individuales, administración del equipo, CRM de compras y ventas, stock, gastos, cotizaciones y documentos. Los datos se guardan en una base de datos, con permisos comprobados por la API.

Este repositorio contiene el frontend y el backend completos. La web pública y la migración de WordPress se harán en una etapa posterior, cuando esté disponible el backup. Esta versión utiliza datos ficticios; no importa automáticamente el Excel del cliente.

## Cómo funcionan los accesos

| Acción | Empleado | Administrador |
|---|---|---|
| Consultar registros del equipo | Sí | Sí |
| Crear registros | Sí, quedan a su cargo | Sí, puede elegir responsable |
| Editar registros propios | Sí | Sí |
| Editar registros de otra persona | Con autorización vigente | Sí |
| Solicitar permiso de edición | Sí | Puede autorizar o rechazar |
| Otorgar o revocar permisos | No | Sí |
| Cambiar responsable | No | Sí |
| Crear, desactivar o restablecer cuentas | No | Sí |
| Consultar el historial | Sí | Sí |

Las autorizaciones se conceden por ficha, por 24 horas, por 7 días o hasta revocación. Aprobar una solicitud concede 24 horas. Un empleado autorizado sigue siendo empleado: ese permiso no le permite administrar cuentas ni conceder permisos.

Al iniciar una edición se reserva la ficha durante 120 segundos, con renovación cada 40 segundos. Otra cuenta o pestaña puede leerla mientras espera. Solo un administrador puede tomar control de una edición ocupada y la acción queda registrada.

Cada registro tiene una versión. El guardado verifica en una operación de base de datos la versión, el permiso y la reserva. Una versión vieja recibe un conflicto y no sobrescribe los cambios de otro usuario. El formulario conserva el borrador y permite descargarlo antes de cargar la versión actual. El guardado y su historial se confirman en la misma transacción.

## Probar localmente

Requisitos: Node 22.16 o posterior (se recomienda una versión LTS compatible) y pnpm 11.25.0, indicado en `package.json`.

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm build:node
pnpm start:node
```

Abrir `http://localhost:3000`. La ejecución Node usa SQLite en `.data/carrito.sqlite` si no se define `DATABASE_URL`. Los datos sobreviven a reinicios mientras se conserve ese archivo.

Para probar con ejemplos, establecer `DEMO_MODE=true` en `.env` y reiniciar. Aparecen botones para entrar como Administrador, Lucía y Mateo. Las cuentas de demostración usan dominios `.example`, incluyen operaciones inventadas y permiten experimentar con permisos. No activar este modo en el entorno del cliente ni poner datos reales en una instalación que lo tenga habilitado: los botones permiten entrar sin contraseña a esas cuentas.

`pnpm dev:node` ejecuta la API de Node contra el cliente ya construido. Si cambiás la interfaz, ejecutá de nuevo `pnpm build:node`. El comando `pnpm dev` pertenece al entorno de Sites/Vinext y no es necesario para desplegar en Node.

## Crear el administrador real

En una base vacía, mantener `DEMO_MODE=false`. Definir temporalmente un `SETUP_TOKEN` aleatorio y una contraseña de al menos 12 caracteres mediante `INITIAL_ADMIN_PASSWORD` en el entorno privado. Iniciar el servidor con el mismo `SETUP_TOKEN` y ejecutar en otra terminal:

```bash
pnpm admin:create
```

El script pide nombre y email, y envía las credenciales al endpoint de instalación. Solo se puede crear así el primer administrador. Después quitar `SETUP_TOKEN` e `INITIAL_ADMIN_PASSWORD` del entorno y reiniciar el servidor. No incluir claves ni archivos `.env` en GitHub.

El administrador crea las demás cuentas en **Equipo y accesos**. Cada empleado cambia su contraseña temporal antes de guardar operaciones. Restablecer una contraseña o desactivar una cuenta invalida sus sesiones. Las contraseñas se guardan con sal aleatoria y PBKDF2-SHA256 (100.000 iteraciones); las sesiones duran 8 horas y usan cookies HttpOnly, SameSite y Secure cuando `APP_ORIGIN` utiliza HTTPS. Las escrituras autenticadas requieren un token CSRF.

## Subir el código a GitHub

Crear un repositorio privado y subir esta carpeta con su estructura completa, incluyendo `pnpm-lock.yaml`, `drizzle/`, `.env.example` y los archivos de configuración. No subir `node_modules/`, `.data/`, `.env`, `dist/` ni `dist-node/`; están excluidos por `.gitignore`. El archivo `.openai/hosting.json` identifica la vista privada de Sites y no contiene contraseñas.

La copia entregada no configura un repositorio GitHub ni accede a ninguna cuenta de GitHub. Se puede crear y conectar el repositorio elegido por el propietario.

## Ejecutar en Render o en otro servicio Node

El frontend portátil usa React y Vite. El servidor Node sirve esos archivos y la misma API de permisos que la vista de Sites. No depende de WordPress.

En un servicio conectado al repositorio, configurar:

| Ajuste | Valor |
|---|---|
| Build | `pnpm install --frozen-lockfile && pnpm build:node` |
| Start | `pnpm start:node` |
| `APP_ORIGIN` | URL HTTPS final del panel, sin barra al final |
| `DEMO_MODE` | `false` |
| `DATABASE_URL` | URL privada de la base PostgreSQL |
| `PORT` | Puerto provisto por el servicio |

Usar PostgreSQL para una instalación de varios empleados alojada en un servicio cuyo disco sea temporal. El adaptador `server/database.ts` aplica las migraciones versionadas al arrancar y usa transacciones para las operaciones agrupadas. Configurar backups de esa base y comprobar una restauración antes de cargar datos reales. Para una URL PostgreSQL externa que requiera TLS verificado se puede establecer `PGSSL=true`; respetar la configuración TLS del proveedor.

La suite de permisos se ejecutó con SQLite. El adaptador PostgreSQL está incluido y compila, pero aún debe probarse contra la base elegida para la instalación final. No se ha desplegado una instancia en Render ni conectado una base del cliente.

Si se usa SQLite en un servidor propio, conservar un volumen persistente y realizar backups consistentes con la herramienta de SQLite; no copiar solo el archivo principal mientras existan escrituras WAL. No usar varios servidores con archivos SQLite independientes.

## Ofertas y contratos

La oferta calcula `valor estimado × (1 − margen / 100) − gastos estimados`, con mínimo cero. Su ficha permite descargar un correo `.eml`. El envío por API requiere `RESEND_API_KEY`, `MAIL_FROM` y un remitente verificado en Resend. Solo una oferta aprobada puede enviarse, y el usuario debe tener permiso. La clave de idempotencia y el estado del envío impiden repetirlo accidentalmente.

El servicio de correo no está conectado en la demostración y no se enviaron correos. No hay campañas, envíos masivos ni automatizaciones programadas en esta versión. Si el proveedor deja un envío sin confirmación, revisar su estado antes de reintentar; el registro queda protegido para evitar duplicados.

Los contratos permiten guardar texto, datos, estado e imprimir o guardar como PDF desde el navegador. El documento de ejemplo debe reemplazarse por los modelos de la empresa antes de utilizarse. No se implementó firma electrónica ni generación de modelos legales automáticos.

Los importes ARS y USD se mantienen separados. El costo de un vehículo suma la compra y los gastos en su misma moneda; los gastos de otra moneda aparecen aparte y no se convierten sin una cotización definida.

## Estructura y validación

```text
components/carrito-app.tsx   Interfaz del equipo y administración
lib/model.ts                Módulos y campos
lib/api.ts                  Autenticación, permisos, reservas y guardados
lib/seed.ts                 Ejemplos habilitados únicamente en DEMO_MODE
db/schema.ts                Esquema versionado
drizzle/                    Migraciones SQL
server/                     API y archivos estáticos en Node
client/                     Entrada React para despliegue Node
app/                        Entrada Vinext para la vista de Sites
tests/permissions.test.ts   Pruebas de acceso, conflictos y persistencia
```

```bash
pnpm check
pnpm test
pnpm build:node
pnpm build
```

Las 13 pruebas cubren sesiones individuales, acceso de lectura, permisos rechazados, propiedad al crear, solicitudes y revocación, ediciones concurrentes, pestañas de una misma cuenta, versiones antiguas, vencimientos, cambio de responsable, decisiones simultáneas, CSRF, desactivación, cambio obligatorio de contraseña y persistencia al reiniciar.

La lista de operaciones carga hasta 5.000 fichas y el historial visible muestra los últimos 100 eventos, aunque los eventos anteriores quedan guardados en la base. Para un volumen mayor se deberá añadir paginación y consulta de historial por ficha. La interfaz registra una herramienta WebMCP de búsqueda de solo lectura cuando el navegador la soporta; no es un requisito para utilizar el panel.

La vista publicada de Sites conserva acceso privado del propietario y una base D1 persistente. Los accesos de ejemplo dentro del panel sirven para probar los roles. Para que el personal entre desde sus equipos se debe instalar el entorno del cliente y crear sus cuentas reales. El backup de WordPress, la web pública, sus fotografías, las URLs anteriores y la conexión de formularios se realizarán en la siguiente etapa.

## Identidad de la empresa

El acceso, el menú, la pantalla de carga, el favicon y los documentos impresos utilizan el logo y el ícono recuperados de carritoautos.com. Las imágenes se incluyen sin modificar en public/; las familias Lato y Teko se sirven localmente con sus licencias. Los colores de marca provienen de los estilos del sitio actual. La referencia y los archivos de origen están documentados en public/brand/README.md.
