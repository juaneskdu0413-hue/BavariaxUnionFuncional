/**
 * ════════════════════════════════════════════════════════
 * BAVARIA × UNIÓN ANDINA — Autenticación server-side (ACTIVA EN PRODUCCIÓN)
 * ════════════════════════════════════════════════════════
 * Este archivo está desplegado y activo desde el 15 de septiembre de 2026
 * (commit 1f1054f). Reemplazó la validación de login que antes se hacía
 * 100% en el navegador (en Logica.js/admin.html), que tenía 3 problemas:
 *   1) Las contraseñas (hasheadas o no) vivían en JavaScript público.
 *   2) Cualquiera podía saltarse el login por completo escribiendo una
 *      sesión falsa en localStorage desde la consola del navegador.
 *   3) doGet()/doPost() no pedían ningún token — cualquiera con la URL
 *      de Apps Script (que también es pública, está en el JS) podía leer
 *      TODOS los registros (GPS y notas de todos los conductores) con un
 *      simple curl, sin pasar por ningún login, real o falso.
 *
 * Este archivo resuelve las 3 cosas moviendo la verificación al único
 * lugar que el atacante no controla: este script de Apps Script.
 *
 * ESTADO CONFIRMADO — última verificación en vivo: 2026-10-03, con curl
 * directo contra la URL real de producción (sin pasar por ningún frontend):
 *   - doGet sin token, con token inválido y con token con firma falsa →
 *     los tres casos responden {"error":"No autorizado"}.
 *   - admin.html manda el token en cada llamada (admin.html:1599).
 *   - Los 3 pasos de activación que pedía este archivo —
 *     configurarCredencialesAuth() ejecutado, snippet pegado en el
 *     doGet/doPost real, frontend actualizado — ya están completos.
 *     La sección INTEGRACIÓN más abajo documenta lo que YA está pegado
 *     en Código.gs, no una tarea pendiente.
 *
 * Código.gs no vive en este repo (solo en el editor de Apps Script), así
 * que lo de arriba se confirmó probando el endpoint en vivo (caja negra),
 * no leyendo el archivo real. Si algo deja de cuadrar con lo que dice
 * aquí, repite esa prueba antes de asumir que algo cambió.
 */

// ════════════════════════════════════════════════════════
// CONFIGURACIÓN — un solo valor, guardado FUERA de cualquier archivo
// ════════════════════════════════════════════════════════
// El secreto HMAC vive en PropertiesService (Configuración del proyecto →
// Propiedades del script), NUNCA en este código ni en Git. Se genera una
// sola vez y no se vuelve a tocar salvo que quieras invalidar todas las
// sesiones activas de golpe (cambiarlo cierra la sesión de todo el mundo).
const AUTH_CONFIG = {
  PROPIEDAD_SECRETO: 'AUTH_HMAC_SECRET',
  PROPIEDAD_USUARIOS: 'AUTH_USUARIOS_JSON', // credenciales reales, solo aquí
  HORAS_VALIDEZ_TOKEN: 12, // sesión expira sola tras 12h, se relogea
};

// ════════════════════════════════════════════════════════
// SETUP — ejecutar UNA SOLA VEZ desde el editor de Apps Script
// ════════════════════════════════════════════════════════
// Antes de ejecutar: reemplaza los 4 claveHash de abajo por los mismos
// que ya están en Logica.js/admin.html (SHA-256 de las contraseñas reales)
// — así no tienes que inventar contraseñas nuevas, solo mover dónde vive
// la verificación.
//
// ⚠️ A diferencia del secreto HMAC (que si ya existe no se toca), la
// lista de usuarios de abajo SÍ se sobrescribe por completo cada vez que
// esta función corre, sin preguntar. NO la vuelvas a ejecutar para
// agregar/cambiar un solo usuario — eso resetea a todos los demás a lo
// que diga este archivo, que puede estar desactualizado respecto a lo
// que de verdad hay en Script Properties. Para cambios puntuales usa
// reemplazarUsuario_() más abajo.
function configurarCredencialesAuth() {
  const props = PropertiesService.getScriptProperties();

  // Si ya existe un secreto, no lo pisa (evita invalidar sesiones sin querer
  // si alguien vuelve a correr esta función por error).
  if (!props.getProperty(AUTH_CONFIG.PROPIEDAD_SECRETO)) {
    const secreto = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Math.random() + '' + Date.now())
    );
    props.setProperty(AUTH_CONFIG.PROPIEDAD_SECRETO, secreto);
    Logger.log('Secreto HMAC generado y guardado en Script Properties.');
  } else {
    Logger.log('Ya existe un secreto guardado — no se sobrescribe.');
  }

  const usuarios = [
    { usuario: 'juaneskdu', claveHash: 'de355d443082c1608e3e565aac0a9c85d4dcb2b9ab2585fdae7698e8daae27fe', rol: 'admin' },
    { usuario: 'NelsonC',   claveHash: 'ff1873b60679c72b83aca49cba82fd4c43a5ae1739d508595a99dccaff6c981e', rol: 'admin' },
    { usuario: 'MariaR',    claveHash: 'a552c4e4bbc62c80c8e8626da66314184270fd1d840af10c50041c431d97aefa', rol: 'admin' },
    { usuario: 'andresfp',  claveHash: 'f6af6e4d6c9315f6a693f27a4868f405edf15d97cbf661d8ac29071b2b6b5961', rol: 'admin' },
  ];
  props.setProperty(AUTH_CONFIG.PROPIEDAD_USUARIOS, JSON.stringify(usuarios));
  Logger.log('Credenciales guardadas en Script Properties (' + usuarios.length + ' usuarios).');
  Logger.log('IMPORTANTE: después de correr esto, USUARIOS_ADMIN puede borrarse por completo de Logica.js y admin.html — ya no necesita vivir en el cliente.');
}

// ════════════════════════════════════════════════════════
// REEMPLAZAR UN SOLO USUARIO — seguro para producción
// ════════════════════════════════════════════════════════
// A diferencia de configurarCredencialesAuth() (que pisa TODA la lista),
// esta función lee la lista tal como está HOY en Script Properties y
// reemplaza solo la fila indicada por usuarioViejo. El rol se pide
// explícito (rolNuevo) en vez de heredar el del usuario reemplazado —
// reemplazar a alguien no implica querer el mismo nivel de acceso.
// Cualquier otro usuario que exista en producción (aunque no coincida
// con lo que dice este archivo) queda intacto.
function reemplazarUsuario_(usuarioViejo, usuarioNuevo, claveHashNueva, rolNuevo) {
  const props = PropertiesService.getScriptProperties();
  const usuarios = JSON.parse(props.getProperty(AUTH_CONFIG.PROPIEDAD_USUARIOS) || '[]');

  const idx = usuarios.findIndex(function (u) { return u.usuario === usuarioViejo; });
  if (idx === -1) {
    Logger.log('No se encontró "' + usuarioViejo + '" en la lista actual. Usuarios existentes: ' +
      usuarios.map(function (u) { return u.usuario; }).join(', '));
    return;
  }

  usuarios[idx] = { usuario: usuarioNuevo, claveHash: claveHashNueva, rol: rolNuevo };
  props.setProperty(AUTH_CONFIG.PROPIEDAD_USUARIOS, JSON.stringify(usuarios));
  Logger.log('"' + usuarioViejo + '" reemplazado por "' + usuarioNuevo + '" con rol "' + rolNuevo + '".');
}

// Para aplicar el cambio de hoy (UnionA → MariaR): selecciona esta función
// en el desplegable del editor de Apps Script y ejecútala UNA SOLA VEZ.
function aplicarReemplazoUnionAPorMariaR_HOY() {
  reemplazarUsuario_('UnionA', 'MariaR', 'a552c4e4bbc62c80c8e8626da66314184270fd1d840af10c50041c431d97aefa', 'admin');
}

// ════════════════════════════════════════════════════════
// LOGIN — se llama desde el nuevo doPost cuando payload.action === 'login'
// ════════════════════════════════════════════════════════
// Recibe { usuario, claveHash } (el frontend sigue calculando el SHA-256
// en el navegador con sha256Hex(), igual que ahora — solo que la
// COMPARACIÓN pasa a hacerse aquí, no en el navegador del usuario).
function manejarLogin_(payload) {
  const props = PropertiesService.getScriptProperties();
  const usuarios = JSON.parse(props.getProperty(AUTH_CONFIG.PROPIEDAD_USUARIOS) || '[]');

  const encontrado = usuarios.find(function (u) {
    return u.usuario === payload.usuario && u.claveHash === payload.claveHash;
  });

  if (!encontrado) {
    return { ok: false, error: 'Usuario o contraseña incorrectos' };
  }

  const token = generarToken_(encontrado.usuario, encontrado.rol);
  return { ok: true, rol: encontrado.rol, usuario: encontrado.usuario, token: token };
}

// ════════════════════════════════════════════════════════
// TOKEN — firmado con HMAC-SHA256, el navegador nunca ve el secreto
// ════════════════════════════════════════════════════════
// Formato del token: base64(payload) + "." + base64(firma)
// El payload incluye una fecha de expiración — pasado ese tiempo, el
// token deja de ser válido aunque nadie lo haya "cerrado" explícitamente.
function generarToken_(usuario, rol) {
  const props = PropertiesService.getScriptProperties();
  const secreto = props.getProperty(AUTH_CONFIG.PROPIEDAD_SECRETO);

  const payload = {
    usuario: usuario,
    rol: rol,
    exp: Date.now() + AUTH_CONFIG.HORAS_VALIDEZ_TOKEN * 60 * 60 * 1000,
  };
  const payloadB64 = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  const firma = Utilities.computeHmacSha256Signature(payloadB64, secreto);
  const firmaB64 = Utilities.base64EncodeWebSafe(firma);

  return payloadB64 + '.' + firmaB64;
}

// Valida un token recibido en cualquier llamada protegida. Devuelve el
// payload ({usuario, rol}) si es válido y no expiró, o null si es falso,
// fue alterado, o ya venció.
function validarToken_(token) {
  if (!token || token.indexOf('.') === -1) return null;

  const props = PropertiesService.getScriptProperties();
  const secreto = props.getProperty(AUTH_CONFIG.PROPIEDAD_SECRETO);

  const partes = token.split('.');
  const payloadB64 = partes[0];
  const firmaRecibida = partes[1];

  const firmaEsperada = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payloadB64, secreto)
  );

  // Comparación de firma: si no coinciden, alguien alteró el token o no
  // lo generó este script (no tiene el secreto) — se rechaza sin más.
  if (firmaRecibida !== firmaEsperada) return null;

  let payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString());
  } catch (e) {
    return null;
  }

  if (!payload.exp || Date.now() > payload.exp) return null; // expirado

  return payload; // { usuario, rol, exp }
}

// ════════════════════════════════════════════════════════
// INTEGRACIÓN — esto YA ESTÁ pegado en tu doPost(e)/doGet(e) reales
// (en Código.gs, que no vive en este repo — se documenta aquí como
// referencia de lo que hay en producción, confirmado en vivo el
// 2026-10-03, no como una tarea pendiente)
// ════════════════════════════════════════════════════════
/*
  Al INICIO de tu doPost(e) actual, antes de la lógica que ya tienes que
  guarda el check-in, agrega:

    const payload = JSON.parse(e.postData.contents);
    if (payload.action === 'login') {
      const resultado = manejarLogin_(payload);
      return ContentService.createTextOutput(JSON.stringify(resultado))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ... a partir de aquí sigue exactamente tu lógica actual de guardar
    // el registro de check-in, sin ningún cambio.

  Al INICIO de tu doGet(e) actual, antes de leer y devolver los registros:

    const token = e.parameter.token;
    const sesion = validarToken_(token);
    if (!sesion) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'No autorizado' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ... a partir de aquí sigue tu lógica actual de leer la hoja y
    // devolver el array de registros, sin cambios.

  Nota: esto asume que doGet(e) es de uso EXCLUSIVO de admin.html (que sí
  necesita ver todos los registros). Si Logica.js también usa doGet en
  algún flujo del conductor, revisa ese caso aparte antes de exigir token
  ahí — no quiero romper el flujo de check-in del conductor, que hoy es
  intencionalmente sin login (ver PRODUCT.md, principio de "cero fricción
  para el conductor").
*/
