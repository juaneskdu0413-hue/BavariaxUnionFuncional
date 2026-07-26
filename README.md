# Check-in de Conductores — Operación JVK

## Estructura del proyecto

```
checkin-conductores/
├── index.html          ← Estructura de la página (igual al diseño original)
├── style.css           ← Todos los estilos (colores, tipografía, layout)
├── script.js            ← Lógica: chips, GPS, envío, panel
└── apps-script/
    └── (aquí irá Code.gs cuando conectemos Google Sheets)
```

## Cómo abrirlo en VS Code

1. Abre VS Code
2. `Archivo → Abrir carpeta` → selecciona la carpeta `checkin-conductores`
3. Instala la extensión **"Live Server"** de Ritwick Dey (búscala en el panel de Extensiones, ícono de cuadritos en la barra lateral izquierda)
4. Clic derecho sobre `index.html` → **"Open with Live Server"**
5. Se abre automáticamente en tu navegador en `http://127.0.0.1:5500` (o similar)

Esto te permite ver cambios en vivo cada vez que guardas un archivo — no necesitas refrescar manualmente.

## Estado actual

- ✅ Diseño idéntico al HTML original (mismos colores, tipografía IBM Plex, mismo layout)
- ✅ Captura de GPS funcional (nativo del navegador, sin API externa)
- ✅ Formulario con chips de selección (conductor, placa, tipo de registro)
- ✅ Auto-selección de placa al elegir conductor
- ✅ Panel de coordinación con resumen y filtros
- ⚠️ **Almacenamiento: modo local de prueba** — usa `localStorage`, lo que significa que cada navegador/dispositivo tiene su propia copia de los datos. Todavía NO está centralizado.

## Próximo paso: conectar Google Apps Script

En `script.js`, busca esta línea al inicio del archivo:

```javascript
const APPS_SCRIPT_URL = null;
```

Cuando creemos el Google Apps Script y lo publiquemos, esa línea cambiará a:

```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/TU_ID_AQUI/exec';
```

Esa es la **única línea que hay que tocar** para pasar de modo local a modo centralizado — toda la lógica de `guardarRegistro()` y `obtenerRegistros()` en `script.js` ya está preparada para detectar automáticamente cuál modo usar.

## Cómo probarlo ahora mismo

1. Abre la página con Live Server
2. Ve a la pestaña "Conductor"
3. Selecciona un conductor (la placa se autocompleta)
4. Selecciona el tipo de registro
5. Toca "Capturar ubicación" (el navegador pedirá permiso de geolocalización — acéptalo)
6. Escribe una nota
7. Confirma el registro
8. Ve a la pestaña "Panel Coordinación" para verlo reflejado

## Publicar para que los conductores lo usen (mientras no esté centralizado)

Opciones gratuitas para subir esta carpeta y obtener un link público:

- **Netlify Drop**: arrastra la carpeta completa a `app.netlify.com/drop`
- **GitHub Pages**: subes la carpeta a un repositorio y activas Pages en la configuración
- **Vercel**: conectas el repositorio o arrastras la carpeta desde su web

Cualquiera de estas te da un link tipo `https://tu-proyecto.netlify.app` que puedes compartir por WhatsApp.

**Recuerda:** hasta que conectemos Google Apps Script, cada conductor que abra el link desde su propio celular tendrá su historial aislado — tú no verás todo centralizado todavía.
