# Carrito · Demo para presentar al cliente

Muestra navegable del panel con la identidad de Carrito. Funciona completamente en el navegador. No necesita Render, una base de datos ni claves de acceso.

## Publicar ahora en Netlify

1. Descomprimir este ZIP.
2. Entrar a https://app.netlify.com/drop para crear el sitio de muestra.
3. Arrastrar la carpeta **dist**, que contiene el index.html ya compilado, a la zona de publicación manual.

Si el proyecto anterior está conectado a GitHub, este método crea una muestra independiente; no hace falta desconectar ese repositorio.

No es necesario compilar ni configurar variables para este método. Se incluyen el logo, el ícono y las fuentes.

## Publicar desde GitHub

Subir el contenido de esta carpeta al repositorio: package.json y netlify.toml deben quedar en la raíz. Este proyecto reemplaza la carpeta de demostración anterior; no mezclarlo con los archivos Next.js o Cloudflare del proyecto completo.

En Netlify usar base directory vacía, build command `pnpm build` y publish directory `dist`. No usar Next.js Runtime. Si el proyecto anterior de Netlify conserva esa detección, desactivar su runtime o mantener la variable `NETLIFY_NEXT_PLUGIN_SKIP=true` para esa configuración anterior. Este código utiliza React y Vite y no incluye Next.js.

El archivo netlify.toml ya contiene el comando y la carpeta correctos. La carpeta app/api no forma parte de esta muestra.

## Qué puede mostrarse

Los botones de acceso permiten entrar como Administrador, Lucía o Mateo. Se pueden recorrer compras, CRM de ventas, stock, gastos, ofertas, contratos, equipo, solicitudes e historial. Las fichas y los importes son ficticios.

Se pueden probar ediciones y el recorrido de permisos: entrar como Mateo, pedir editar una ficha de Lucía, cambiar a Administrador para aprobar y volver a Mateo. Las acciones se simulan dentro de esa pestaña y no se envían a ningún servidor.

Los cambios desaparecen al recargar o al pulsar Reiniciar muestra. No se crean cuentas reales ni se envían correos. Los permisos ilustran el flujo de la versión final y no constituyen un control de acceso de producción. No se deben ingresar datos reales de clientes.

## Código incluido

Además de dist, se incluye el código de la demo. Para editarlo usar Node 24 y pnpm 11.25.0:

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
```

La versión con servidor y base de datos se conserva en el código completo entregado anteriormente; este paquete es la muestra independiente para la presentación.
