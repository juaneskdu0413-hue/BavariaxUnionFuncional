/**
 * ════════════════════════════════════════════════════════
 * BAVARIA × UNIÓN ANDINA — Alertas de jornadas abiertas
 * ════════════════════════════════════════════════════════
 * Este archivo es ADITIVO: no toca doGet(e) ni doPost(e) existentes
 * (esos viven en Código.gs, en este mismo proyecto de Apps Script).
 *
 * Qué hace:
 *  1) Lee los registros de HOY directo del Sheet (sin pasar por doGet).
 *  2) Reproduce la misma lógica de estado de jornada que usa admin.html
 *     (calcularEstadoJornada / datosCondutor), pero en Apps Script puro,
 *     sin DOM ni fetch de navegador.
 *  3) Si un conductor lleva "Inicio jornada" sin "Fin jornada" por más
 *     de UMBRAL_HORAS, envía email (y opcionalmente WhatsApp vía CallMeBot).
 *  4) Es idempotente: no re-envía la misma alerta antes de que pase
 *     HORAS_COOLDOWN_ALERTA, usando una hoja auxiliar "AlertasEnviadas".
 *
 * NOTA DE SINCRONIZACIÓN (clasp):
 *  Esta copia refleja el contenido acordado en el chat de diseño de esta
 *  automatización. Si en el editor de Apps Script (script.google.com) ya
 *  rellenaste CONFIG.EMAIL_DESTINO, CALLMEBOT_TELEFONO, CALLMEBOT_APIKEY
 *  o cambiaste NOMBRE_HOJA_REGISTROS con tus valores reales, ejecuta
 *  `clasp pull` ANTES de hacer cualquier `clasp push` para no
 *  sobrescribir esos valores reales con los placeholders de este archivo.
 */

// ════════════════════════════════════════════════════════
// CONFIGURACIÓN — edita estos valores antes de ejecutar nada
// ════════════════════════════════════════════════════════
const CONFIG = {

  // Nombre EXACTO de la pestaña del Sheet donde se guardan los check-ins
  // (la misma que lee/escribe tu doGet/doPost actual).
  // ⚠️ VERIFICA este nombre contra tu Sheet real — no puedo confirmarlo
  // porque no tengo acceso al Code.gs original. Si tu pestaña se llama
  // distinto (ej. "Hoja 1", "Registros_JVK"), cámbialo aquí.
  NOMBRE_HOJA_REGISTROS: 'Registros',

  // Nombre de la hoja auxiliar de control de alertas ya enviadas.
  // Si no existe, el script la crea sola la primera vez que corre.
  NOMBRE_HOJA_ALERTAS: 'AlertasEnviadas',

  // A quién avisar por email cuando hay una jornada abierta.
  // Puede ser una lista separada por comas: 'correo1@x.com,correo2@x.com'
  EMAIL_DESTINO: 'coordinacion@ejemplo.com', // ← CAMBIAR

  // Umbral de horas sin "Fin jornada" para considerar la alerta.
  UMBRAL_HORAS: 10,

  // Zona horaria de la operación (usada para calcular "hoy" y formatear horas).
  ZONA_HORARIA: 'America/Bogota',

  // ── WhatsApp vía CallMeBot (opcional) ──
  // CallMeBot es gratuito para volumen bajo (ideal para notificar a 1-3
  // coordinadores). Para activarlo:
  //   1. Desde el WhatsApp del número que recibirá las alertas, envía
  //      "I allow callmebot to send me messages" al contacto +34 644 51 95 23.
  //   2. CallMeBot responde con tu apikey personal.
  //   3. Pon ese número (con código de país, sin "+", ej "573001234567")
  //      y el apikey abajo, y pon WHATSAPP_ACTIVO en true.
  WHATSAPP_ACTIVO: false,
  CALLMEBOT_TELEFONO: '',   // ej: '573001234567'
  CALLMEBOT_APIKEY: '',     // el que te da CallMeBot por WhatsApp

  // No re-enviar alerta del mismo conductor antes de que pasen estas horas
  // desde la última alerta enviada por ese conductor en el mismo día.
  HORAS_COOLDOWN_ALERTA: 2,
};

// ════════════════════════════════════════════════════════
// PUNTO DE ENTRADA — esta es la función que corre el trigger
// ════════════════════════════════════════════════════════
function revisarJornadasAbiertas() {
  const hojaRegistros = obtenerHojaRegistros_();
  const registrosHoy = leerRegistrosDeHoy_(hojaRegistros);

  if (registrosHoy.length === 0) {
    Logger.log('revisarJornadasAbiertas: sin registros hoy, nada que revisar.');
    return;
  }

  const porConductor = agruparPorConductor_(registrosHoy);
  const hojaAlertas = obtenerOCrearHojaAlertas_();
  const ahora = new Date();
  const hoyKey = formatearFecha_(ahora);

  let alertasEnviadas = 0;

  Object.keys(porConductor).forEach(function (nombreConductor) {
    const registrosOrdenados = porConductor[nombreConductor]
      .slice()
      .sort(function (a, b) { return a.timestamp.getTime() - b.timestamp.getTime(); });

    const estado = calcularEstadoJornada_(registrosOrdenados);

    // Solo nos interesan los que están "en ruta": Inicio sin Fin
    if (estado.estadoKey !== 'ruta') return;

    const horasTranscurridas = (ahora.getTime() - estado.inicio.timestamp.getTime()) / (1000 * 60 * 60);
    if (horasTranscurridas < CONFIG.UMBRAL_HORAS) return;

    // ── Control de idempotencia ──
    if (yaSeAlertoRecientemente_(hojaAlertas, nombreConductor, hoyKey)) {
      Logger.log('Alerta omitida (cooldown activo): ' + nombreConductor);
      return;
    }

    const datosAlerta = {
      conductor: nombreConductor,
      placa: estado.inicio.placa || '(sin placa registrada)',
      horaInicio: formatearHora_(estado.inicio.timestamp),
      horasTranscurridas: horasTranscurridas.toFixed(1),
    };

    enviarEmailAlerta_(datosAlerta);
    if (CONFIG.WHATSAPP_ACTIVO) enviarWhatsAppAlerta_(datosAlerta);

    registrarAlertaEnviada_(hojaAlertas, nombreConductor, datosAlerta.placa, hoyKey, ahora);
    alertasEnviadas++;
  });

  Logger.log('revisarJornadasAbiertas: ' + alertasEnviadas + ' alerta(s) enviada(s).');
}

// ════════════════════════════════════════════════════════
// LECTURA DE DATOS — Sheet → objetos JS (sin fetch, sin DOM)
// ════════════════════════════════════════════════════════

// Obtiene la pestaña de registros. Si tu Apps Script está "contenedor-ligado"
// al Sheet (lo normal si lo creaste desde Extensiones → Apps Script dentro
// del Sheet), getActiveSpreadsheet() ya apunta al Sheet correcto.
// Si en cambio es un script independiente, reemplaza la línea de abajo por:
//   SpreadsheetApp.openById('TU_SHEET_ID_AQUI')
function obtenerHojaRegistros_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(CONFIG.NOMBRE_HOJA_REGISTROS);
  if (!hoja) {
    throw new Error(
      'No se encontró la pestaña "' + CONFIG.NOMBRE_HOJA_REGISTROS + '". ' +
      'Pestañas disponibles: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', ')
    );
  }
  return hoja;
}

// Lee TODA la hoja, mapea columnas por nombre de encabezado (fila 1) —
// así no importa el orden real de tus columnas — y filtra solo las filas
// cuya "fecha" sea la de hoy en zona horaria Colombia.
function leerRegistrosDeHoy_(hoja) {
  const valores = hoja.getDataRange().getValues();
  if (valores.length < 2) return []; // solo encabezados, sin datos

  const encabezados = valores[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const idx = {
    conductor: encabezados.indexOf('conductor'),
    placa: encabezados.indexOf('placa'),
    tipo: encabezados.indexOf('tipo'),
    timestamp: encabezados.indexOf('timestamp'),
    fecha: encabezados.indexOf('fecha'),
  };

  const faltantes = Object.keys(idx).filter(function (k) { return idx[k] === -1; });
  if (faltantes.length) {
    throw new Error(
      'Faltan columnas obligatorias en "' + CONFIG.NOMBRE_HOJA_REGISTROS + '": ' + faltantes.join(', ') +
      '. Encabezados encontrados: ' + encabezados.join(', ')
    );
  }

  const hoyKey = formatearFecha_(new Date());
  const filas = valores.slice(1);
  const registros = [];

  filas.forEach(function (fila) {
    const tipo = fila[idx.tipo];
    const conductor = fila[idx.conductor];
    const timestampRaw = fila[idx.timestamp];
    if (!tipo || !conductor || !timestampRaw) return; // fila vacía o incompleta, se ignora

    const fechaFila = normalizarFecha_(fila[idx.fecha]);
    if (fechaFila !== hoyKey) return; // no es de hoy

    registros.push({
      conductor: String(conductor).trim(),
      placa: idx.placa > -1 ? String(fila[idx.placa]).trim() : '',
      tipo: String(tipo).trim(),
      timestamp: normalizarTimestamp_(timestampRaw),
    });
  });

  return registros;
}

// El Sheet puede devolver la fecha como texto ("2026-09-15") o, si la columna
// tiene formato de fecha aplicado, como objeto Date — este helper cubre ambos casos.
function normalizarFecha_(valor) {
  if (valor instanceof Date) {
    return formatearFecha_(valor);
  }
  return String(valor).slice(0, 10);
}

// Igual que arriba pero para el timestamp ISO completo: puede llegar como
// string ISO o como Date, según cómo lo haya guardado tu doPost.
function normalizarTimestamp_(valor) {
  if (valor instanceof Date) return valor;
  return new Date(valor);
}

function formatearFecha_(fecha) {
  return Utilities.formatDate(fecha, CONFIG.ZONA_HORARIA, 'yyyy-MM-dd');
}

function formatearHora_(fecha) {
  return Utilities.formatDate(fecha, CONFIG.ZONA_HORARIA, 'HH:mm');
}

// ════════════════════════════════════════════════════════
// LÓGICA DE ESTADO DE JORNADA
// (Puerto directo de calcularEstadoJornada() en admin.html línea 1762 —
//  misma definición de "ruta" = tiene Inicio jornada pero no Fin jornada,
//  tomando el PRIMER "Inicio jornada" y el PRIMER "Fin jornada" del día,
//  igual que hace el dashboard, para que esta alerta sea consistente con
//  lo que el coordinador ve en pantalla.)
// ════════════════════════════════════════════════════════
function agruparPorConductor_(registros) {
  const grupos = {};
  registros.forEach(function (r) {
    if (!grupos[r.conductor]) grupos[r.conductor] = [];
    grupos[r.conductor].push(r);
  });
  return grupos;
}

function calcularEstadoJornada_(registrosOrdenados) {
  let inicio = null, fin = null;
  for (let i = 0; i < registrosOrdenados.length; i++) {
    const r = registrosOrdenados[i];
    if (r.tipo === 'Inicio jornada' && !inicio) inicio = r;
    if (r.tipo === 'Fin jornada' && !fin) fin = r;
  }

  let estadoKey = 'sin';
  if (inicio && fin) estadoKey = 'completa';
  else if (inicio) estadoKey = 'ruta';
  else if (registrosOrdenados.length) estadoKey = 'parcial';

  return { inicio: inicio, fin: fin, estadoKey: estadoKey };
}

// ════════════════════════════════════════════════════════
// IDEMPOTENCIA — hoja "AlertasEnviadas"
// ════════════════════════════════════════════════════════
// Estructura de esta hoja auxiliar (se crea sola si no existe):
//   conductor | placa | fecha | horasAlerta | ultimaAlertaEnviada

function obtenerOCrearHojaAlertas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(CONFIG.NOMBRE_HOJA_ALERTAS);
  if (!hoja) {
    hoja = ss.insertSheet(CONFIG.NOMBRE_HOJA_ALERTAS);
    hoja.appendRow(['conductor', 'placa', 'fecha', 'horasAlerta', 'ultimaAlertaEnviada']);
    hoja.setFrozenRows(1);
    Logger.log('Hoja "' + CONFIG.NOMBRE_HOJA_ALERTAS + '" creada automáticamente.');
  }
  return hoja;
}

// Busca si ya se envió una alerta para este conductor HOY dentro de la
// ventana de cooldown. Si la encuentra pero ya expiró el cooldown, la deja
// pasar (para que se pueda re-alertar si sigue sin cerrar jornada).
function yaSeAlertoRecientemente_(hojaAlertas, conductor, fechaHoy) {
  const fila = buscarFilaAlerta_(hojaAlertas, conductor, fechaHoy);
  if (!fila) return false;

  const ultimaAlerta = fila.valores[4]; // columna "ultimaAlertaEnviada"
  const ultimaAlertaDate = ultimaAlerta instanceof Date ? ultimaAlerta : new Date(ultimaAlerta);
  const horasDesdeUltima = (new Date().getTime() - ultimaAlertaDate.getTime()) / (1000 * 60 * 60);

  return horasDesdeUltima < CONFIG.HORAS_COOLDOWN_ALERTA;
}

// Actualiza la fila existente del conductor+fecha, o crea una nueva si es
// la primera alerta del día para ese conductor.
function registrarAlertaEnviada_(hojaAlertas, conductor, placa, fechaHoy, momento) {
  const fila = buscarFilaAlerta_(hojaAlertas, conductor, fechaHoy);
  if (fila) {
    hojaAlertas.getRange(fila.numeroFila, 5).setValue(momento); // solo actualiza ultimaAlertaEnviada
  } else {
    hojaAlertas.appendRow([conductor, placa, fechaHoy, CONFIG.UMBRAL_HORAS, momento]);
  }
}

function buscarFilaAlerta_(hojaAlertas, conductor, fechaHoy) {
  const valores = hojaAlertas.getDataRange().getValues();
  for (let i = 1; i < valores.length; i++) {
    const filaConductor = String(valores[i][0]).trim();
    const filaFecha = normalizarFecha_(valores[i][2]);
    if (filaConductor === conductor && filaFecha === fechaHoy) {
      return { numeroFila: i + 1, valores: valores[i] };
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════
// ENVÍO DE ALERTAS
// ════════════════════════════════════════════════════════
function enviarEmailAlerta_(datos) {
  const asunto = '⚠️ Jornada abierta hace ' + datos.horasTranscurridas + 'h — ' + datos.conductor;
  const cuerpo =
    'Alerta automática — BavariaxUnionAndina\n\n' +
    'Conductor: ' + datos.conductor + '\n' +
    'Placa: ' + datos.placa + '\n' +
    'Inicio de jornada: ' + datos.horaInicio + '\n' +
    'Horas transcurridas sin registrar "Fin jornada": ' + datos.horasTranscurridas + '\n\n' +
    'Verifica en el panel de administración o contacta al conductor.\n' +
    '(Este correo se generó automáticamente desde Apps Script cada ' +
    '20 minutos mientras la condición se mantenga.)';

  MailApp.sendEmail(CONFIG.EMAIL_DESTINO, asunto, cuerpo);
}

function enviarWhatsAppAlerta_(datos) {
  if (!CONFIG.CALLMEBOT_TELEFONO || !CONFIG.CALLMEBOT_APIKEY) {
    Logger.log('WhatsApp activo pero falta CALLMEBOT_TELEFONO o CALLMEBOT_APIKEY en CONFIG.');
    return;
  }
  const texto =
    '⚠️ *Jornada abierta* — ' + datos.conductor + ' (' + datos.placa + ')\n' +
    'Inicio: ' + datos.horaInicio + ' · Lleva ' + datos.horasTranscurridas + 'h sin Fin de jornada';

  const url = 'https://api.callmebot.com/whatsapp.php'
    + '?phone=' + encodeURIComponent(CONFIG.CALLMEBOT_TELEFONO)
    + '&text=' + encodeURIComponent(texto)
    + '&apikey=' + encodeURIComponent(CONFIG.CALLMEBOT_APIKEY);

  try {
    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {
    Logger.log('Error enviando WhatsApp vía CallMeBot: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════
// CONFIGURACIÓN DEL TRIGGER — ejecutar UNA SOLA VEZ manualmente
// ════════════════════════════════════════════════════════
// Corre esta función una vez desde el editor (botón ▶ Ejecutar, con
// "configurarTrigger" seleccionado en el desplegable de funciones).
// Elimina cualquier trigger anterior de revisarJornadasAbiertas para
// evitar duplicados si la ejecutas más de una vez.
function configurarTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarJornadasAbiertas') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('revisarJornadasAbiertas')
    .timeBased()
    .everyMinutes(20)
    .create();

  Logger.log('Trigger creado: revisarJornadasAbiertas correrá cada 20 minutos.');
}

// ════════════════════════════════════════════════════════
// PRUEBA MANUAL (opcional) — verifica que email/WhatsApp funcionan
// antes de confiar en el trigger automático.
// ════════════════════════════════════════════════════════
function probarConfiguracion() {
  const datosFalsos = {
    conductor: 'PRUEBA — CONDUCTOR DE PRUEBA',
    placa: 'TEST00',
    horaInicio: formatearHora_(new Date()),
    horasTranscurridas: '99.9',
  };
  enviarEmailAlerta_(datosFalsos);
  if (CONFIG.WHATSAPP_ACTIVO) enviarWhatsAppAlerta_(datosFalsos);
  Logger.log('Prueba enviada. Revisa tu correo' + (CONFIG.WHATSAPP_ACTIVO ? ' y WhatsApp' : '') + '.');
}
