# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Conductores**: choferes de camión de la operación Bavaria×UnionAndina. Usan su propio celular (gama media/baja) en ruta — carretera, puertos, bodegas, talleres — con conectividad intermitente. Su trabajo es registrar en el momento cada evento de su jornada (inicio, llegada/salida de parada, fin, entrada/salida de taller) con ubicación GPS, con la menor fricción posible porque lo hacen mientras trabajan o en paradas breves.
- **Coordinación / Admin**: rol `admin`, acceso completo al panel (`admin.html`): ve registros del día en vivo, historial, checkout pendiente, gestiona el roster de conductores/placas y usuarios, exporta a Excel.
- **Cliente**: rol `cliente`, mismo panel de admin pero de solo lectura / acceso limitado (ver `aplicarRestriccionesPorRol` en `admin.html`).

## Product Purpose

Reemplaza el reporte informal de jornada por WhatsApp/llamadas telefónicas entre conductores y coordinación. Antes, un conductor avisaba por WhatsApp o llamada cuándo iniciaba jornada, llegaba/salía de una parada, entraba o salía de mantenimiento, o terminaba el día — sin ubicación verificable y disperso en conversaciones individuales. Esta app centraliza esos mismos eventos en un formulario de un toque con captura de GPS nativo del navegador, y los vuelve visibles en tiempo real para coordinación en un panel único.

## Positioning

No es una plataforma de logística/flotas de mercado (tipo TMS); es una herramienta interna a medida para esta operación conjunta Bavaria×UnionAndina, construida sobre lo que el equipo ya usaba (WhatsApp) pero con evento estructurado + GPS + registro centralizado, sin exigir a los conductores instalar una app nativa ni aprender una herramienta compleja.

## Operating Context

- Conductores: en carretera o en el sitio (puerto, bodega, taller), a menudo con una sola mano libre y ventanas cortas de tiempo entre tareas; conectividad variable.
- Coordinación: uso de escritorio/oficina para supervisar el panel, revisar historial, cerrar jornadas pendientes manualmente y exportar reportes.
- Datos maestros (roster de conductores, placas, usuarios admin) se editan desde `admin.html` y se reflejan tanto ahí como en el login de `index.html` vía `localStorage` (clave `bxua_conductores`), con una lista de respaldo embebida en el código (`CONDUCTORES_DEFAULT`) para primera carga o dispositivo distinto.

## Capabilities and Constraints

- Sitio estático (HTML/CSS/JS vanilla, sin framework ni build step), desplegado en GitHub Pages.
- Captura de ubicación con la Geolocation API nativa del navegador — sin dependencia de mapas ni SDKs externos.
- **Google Sheets vía Google Apps Script es el backend permanente** (no un paso intermedio hacia otra base de datos) — todo registro (`guardarRegistro`) y lectura (`obtenerRegistros`) pasa por `APPS_SCRIPT_URL`; el diseño y cualquier feature nueva debe asumir esta limitación (sin transacciones, sin backend propio, borrado de registros centralizados debe hacerse directo en la hoja).
- Tipos de evento actuales: Inicio jornada, Llegada a parada, Salida de parada, Fin jornada, Entrada taller, Salida taller — cada uno con nota obligatoria de lugar y, en taller, un campo "Novedad / motivo" (obligatorio en Entrada taller, opcional en Salida taller y en jornada).
- Roles: `conductor` (solo `index.html`, sin acceso a panel), `admin` (acceso completo a `admin.html`), `cliente` (acceso limitado/solo lectura al mismo panel).
- Roster de conductores y usuarios admin están hardcodeados como listas de respaldo en `Logica.js`/`admin.html`/`resumen.html`; cambios de placa, alta/baja de conductor o nuevo usuario admin se hacen editando esas listas (o desde el panel, que persiste en `localStorage` del navegador del admin).
- Todo el texto de la interfaz está en español.

## Brand Commitments

- Marca conjunta "Bavaria × UnionAndina" con logos de ambas empresas en la topbar (`images/BavariaImagen.png`, `images/UnionAndina_images.jpg`) y tagline "Operación · Registro de Jornada".
- Tipografía IBM Plex (heredada del diseño original, ver README histórico).

## Evidence on Hand

- Roster real de conductores con nombre, cédula y placa (`CONDUCTORES_DEFAULT` en `Logica.js`).
- Usuarios de coordinación/admin reales con roles asignados (`USUARIOS_ADMIN`).
- URL real de Apps Script conectado y en uso (`APPS_SCRIPT_URL`).
- No hay datos de negocio (pricing, testimonios, métricas de uso) documentados — no inventar ninguno.

## Product Principles

1. Cero fricción para el conductor: un evento se registra en pocos toques, sin login complejo, optimizado para uso con una mano y conexión intermitente.
2. GPS y nota de lugar son la fuente de verdad — priorizar que ese dato quede capturado por encima de cualquier otro adorno visual.
3. Coordinación necesita visibilidad inmediata y accionable (registros de hoy, checkout pendiente, filtros por conductor) más que reportes elaborados.
4. Preservar la limitación de Google Sheets como backend: nunca diseñar asumiendo transacciones, backend propio o borrado centralizado desde la app.
5. Todo cambio de UI debe mantenerse coherente en español y con la identidad Bavaria×UnionAndina ya establecida.

## Accessibility & Inclusion

Conductores usan celulares propios de gama media/baja en movimiento, a menudo con una mano y señal intermitente — priorizar objetivos táctiles grandes, poco texto, carga liviana (sin dependencias externas pesadas) y tolerancia a reintentos de red.
