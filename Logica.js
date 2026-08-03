// ════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ════════════════════════════════════════════════════════
// Cuando conectemos Google Apps Script, esta es la ÚNICA línea
// que cambiará: pondremos la URL del script publicado aquí.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbybeK--ANSECbaOHO4sspV3111fnO5ya5xCi5qiqhpx8K_8nI6W1xZloBToZhTDbOkAEQ/exec';

const STORAGE_KEY = 'jvk_checkins_registros';
const SESION_KEY = 'jvk_sesion_actual';

// Misma clave que usa admin.html (pestaña "Conductores") para guardar la lista
// de conductores activos. Si el panel de admin agrega/elimina conductores,
// el login los refleja automáticamente al recargar esta página.
const CONDUCTORES_KEY = 'bxua_conductores';

// Lista de respaldo: se usa solo si no hay nada guardado todavía en localStorage
// (primera carga, o navegador/dispositivo distinto al que usó el admin).
const CONDUCTORES_DEFAULT = [
  { nombre: 'CARLOS MARIO GÁMEZ',            cedula: '1003376142', placa: 'JVK031' },
  { nombre: 'DEIBIS RAFAEL PADILLA',         cedula: '8498966',    placa: 'JVK142' },
  { nombre: 'YESID GUERRERO SERNA',          cedula: '1051589874', placa: 'JVK595' },
  { nombre: 'FREDY SANTANA ACUÑA',           cedula: '1024483571', placa: 'JVK594' },
  { nombre: 'JOSE EDGARDO HERNANDEZ CRUZ',   cedula: '79750999',   placa: 'JVK129' },
  { nombre: 'WALTER YESID PACHON RODRIGUEZ', cedula: '1104698940', placa: 'JVK128' },
];

// ════════════════════════════════════════════════════════
// ESTADO
// ════════════════════════════════════════════════════════
let conductorSel = null;
let placaSel = null;
let tipoSel = null;
let gpsLat = null;
let gpsLng = null;
let gpsPrecision = null;
let filtroActivo = 'todos';
let sesion = null; // { rol: 'conductor', nombre, placa }

// ════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  inicializarLogin();
  inicializarBotones();
  inicializarTabs();
  restaurarSesion();
});

function restaurarSesion() {
  try {
    const raw = sessionStorage.getItem(SESION_KEY);
    if (raw) {
      const datos = JSON.parse(raw);
      // Validar que el rol sea uno de los permitidos
      if (datos.rol === 'conductor') {
        sesion = datos;
        entrarConSesion();
      } else {
        sessionStorage.removeItem(SESION_KEY);
      }
    }
  } catch (e) {
    sessionStorage.removeItem(SESION_KEY);
  }
}

// Lee la lista de conductores activos desde localStorage (misma clave que admin.html).
// Si no hay nada guardado o el dato está corrupto, usa la lista de respaldo.
function obtenerConductoresGuardados() {
  try {
    const raw = localStorage.getItem(CONDUCTORES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch (e) {}
  return CONDUCTORES_DEFAULT.slice();
}

// Dibuja un chip de conductor con el mismo marcado que usaban los chips fijos
// (data-rol, data-val, data-placa, chip-sub). Si el conductor no tiene cédula
// registrada (ej. uno agregado desde el panel de admin, que no la pide), el
// chip-sub solo muestra la placa.
function crearChipConductor(c) {
  const div = document.createElement('div');
  div.className = 'chip-opcion';
  div.dataset.rol = 'conductor';
  div.dataset.val = c.nombre;
  div.dataset.placa = c.placa;

  const nombreTxt = document.createTextNode(c.nombre);
  const sub = document.createElement('div');
  sub.className = 'chip-sub';
  sub.textContent = c.cedula ? `CC ${c.cedula} · Placa ${c.placa}` : `Placa ${c.placa}`;

  div.appendChild(nombreTxt);
  div.appendChild(sub);
  return div;
}

// Inserta los chips de conductores (desde localStorage) en #chips-identidad.
// El acceso de Coordinación/Admin ya no vive en este archivo (ver admin.html).
function renderChipsConductores() {
  const contenedor = document.getElementById('chips-identidad');
  if (!contenedor) return;

  contenedor.querySelectorAll('.chip-opcion[data-rol="conductor"]').forEach(el => el.remove());

  const conductores = obtenerConductoresGuardados();
  conductores.forEach(c => contenedor.appendChild(crearChipConductor(c)));
}

function inicializarLogin() {
  renderChipsConductores();

  let rolElegido = null;
  let datosElegidos = null;

  document.querySelectorAll('#chips-identidad .chip-opcion').forEach(c => {
    c.addEventListener('click', () => {
      seleccionarChip('#chips-identidad', c);
      rolElegido = c.dataset.rol;
      datosElegidos = { nombre: c.dataset.val, placa: c.dataset.placa || null };
    });
  });

  document.getElementById('btn-login').addEventListener('click', () => {
    if (!rolElegido) { alert('Selecciona quién eres.'); return; }

    sesion = { rol: 'conductor', nombre: datosElegidos.nombre, placa: datosElegidos.placa };
    sessionStorage.setItem(SESION_KEY, JSON.stringify(sesion));
    entrarConSesion();
  });
}

function entrarConSesion() {
  document.getElementById('vista-login').classList.remove('activa');
  document.getElementById('tabs-nav').style.display = 'flex';

  // Solo hay un rol posible aquí: conductor. El acceso de admin vive en admin.html.
  document.getElementById('tab-conductor').style.display = 'inline-block';
  document.getElementById('tab-panel').style.display = 'none';
  conductorSel = sesion.nombre;
  placaSel = sesion.placa;
  document.getElementById('conductor-fijo').textContent = sesion.nombre;
  document.getElementById('placa-fija').textContent = sesion.placa;
  cambiarVista('conductor');
}

function cerrarSesion() {
  sessionStorage.removeItem(SESION_KEY);
  sesion = null;
  conductorSel = null;
  placaSel = null;
  document.getElementById('tabs-nav').style.display = 'none';
  document.querySelectorAll('.vista').forEach(el => el.classList.remove('activa'));
  document.getElementById('vista-login').classList.add('activa');
  document.querySelectorAll('#chips-identidad .chip-opcion').forEach(x => x.classList.remove('sel'));
}

function seleccionarChip(grupoSelector, elementoSeleccionado) {
  document.querySelectorAll(grupoSelector + ' .chip-opcion').forEach(x => x.classList.remove('sel'));
  elementoSeleccionado.classList.add('sel');
}

function inicializarBotones() {
  document.getElementById('btn-gps').addEventListener('click', capturarGPS);
  document.getElementById('btn-enviar').addEventListener('click', enviarCheckin);
  document.getElementById('btn-refrescar').addEventListener('click', cargarYRenderPanel);
  document.getElementById('btn-limpiar').addEventListener('click', limpiarTodo);
  document.getElementById('tab-salir').addEventListener('click', cerrarSesion);

  document.querySelectorAll('#chips-tipo .chip-opcion').forEach(c => {
    c.addEventListener('click', () => {
      seleccionarChip('#chips-tipo', c);
      tipoSel = c.dataset.val;
      // "Novedad del día" solo aplica a check-in (Inicio jornada) y checkout (Fin jornada)
      const mostrarNovedad = tipoSel === 'Inicio jornada' || tipoSel === 'Fin jornada';
      document.getElementById('novedad-box').style.display = mostrarNovedad ? 'block' : 'none';
      if (!mostrarNovedad) document.getElementById('novedad').value = '';
    });
  });
}

function inicializarTabs() {
  document.getElementById('tab-conductor').addEventListener('click', () => cambiarVista('conductor'));
  document.getElementById('tab-panel').addEventListener('click', () => cambiarVista('panel'));
}

// ════════════════════════════════════════════════════════
// CAPTURA DE GPS (nativo del navegador, sin API externa)
// ════════════════════════════════════════════════════════
function capturarGPS() {
  const btn = document.getElementById('btn-gps');
  const estado = document.getElementById('gps-estado');
  const err = document.getElementById('gps-err');
  const coordsEl = document.getElementById('gps-coords');

  err.classList.remove('vis');
  coordsEl.classList.remove('vis');

  if (!navigator.geolocation) {
    err.textContent = 'Tu navegador no soporta geolocalización.';
    err.classList.add('vis');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Capturando...';
  estado.textContent = 'Esperando permiso de ubicación...';

  navigator.geolocation.getCurrentPosition(
    onGPSExito,
    onGPSError,
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function onGPSExito(pos) {
  gpsLat = pos.coords.latitude;
  gpsLng = pos.coords.longitude;
  gpsPrecision = Math.round(pos.coords.accuracy);

  const estado = document.getElementById('gps-estado');
  const coordsEl = document.getElementById('gps-coords');
  const btn = document.getElementById('btn-gps');

  estado.textContent = '✓ Ubicación capturada';
  coordsEl.textContent = `${gpsLat.toFixed(5)}, ${gpsLng.toFixed(5)} (±${gpsPrecision}m)`;
  coordsEl.classList.add('vis');
  btn.disabled = false;
  btn.textContent = 'Capturar de nuevo';
}

function onGPSError(error) {
  let msg = 'No se pudo obtener tu ubicación.';
  if (error.code === 1) msg = 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.';
  if (error.code === 2) msg = 'Ubicación no disponible en este momento.';
  if (error.code === 3) msg = 'Se agotó el tiempo de espera. Intenta de nuevo.';

  const err = document.getElementById('gps-err');
  const estado = document.getElementById('gps-estado');
  const btn = document.getElementById('btn-gps');

  err.textContent = msg;
  err.classList.add('vis');
  estado.textContent = 'Toca el botón para capturar tu ubicación';
  btn.disabled = false;
  btn.textContent = 'Capturar ubicación';
}

// ════════════════════════════════════════════════════════
// ENVÍO DE CHECK-IN
// ════════════════════════════════════════════════════════
async function enviarCheckin() {
  const nota = document.getElementById('nota').value.trim();
  const novedad = document.getElementById('novedad').value.trim();

  if (!conductorSel) { alert('Selecciona el conductor.'); return; }
  if (!placaSel)     { alert('Selecciona el vehículo.'); return; }
  if (!tipoSel)      { alert('Selecciona el tipo de registro.'); return; }
  if (!nota)         { alert('Escribe una nota o el lugar donde estás.'); return; }

  const btnEnviar = document.getElementById('btn-enviar');
  btnEnviar.disabled = true;
  btnEnviar.textContent = 'Guardando...';

  const ahora = new Date();
  const registro = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    conductor: conductorSel,
    placa: placaSel,
    tipo: tipoSel,
    nota: nota,
    novedad: novedad,
    lat: gpsLat,
    lng: gpsLng,
    precision: gpsPrecision,
    timestamp: ahora.toISOString(),
    fecha: `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`
  };

  try {
    await guardarRegistro(registro);
    mostrarConfirmacion(registro, ahora);
    resetearFormularioParcial();
  } catch (e) {
    alert('No se pudo guardar el registro. Verifica tu conexión e intenta de nuevo.');
    console.error(e);
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.textContent = 'Confirmar registro';
  }
}

function mostrarConfirmacion(registro, ahora) {
  const horaTxt = `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
  document.getElementById('confirmacion-detalle').textContent =
    `${registro.conductor} — ${registro.placa} — ${registro.tipo} — ${horaTxt}` +
    (registro.lat ? ' — GPS capturado' : ' — sin GPS');

  const conf = document.getElementById('confirmacion');
  conf.classList.add('vis');
  setTimeout(() => conf.classList.remove('vis'), 4000);
}

function resetearFormularioParcial() {
  document.getElementById('nota').value = '';
  document.getElementById('novedad').value = '';
  document.getElementById('novedad-box').style.display = 'none';
  document.querySelectorAll('#chips-tipo .chip-opcion').forEach(x => x.classList.remove('sel'));
  tipoSel = null;
  gpsLat = null; gpsLng = null; gpsPrecision = null;
  document.getElementById('gps-estado').textContent = 'Toca el botón para capturar tu ubicación';
  document.getElementById('gps-coords').classList.remove('vis');
  document.getElementById('btn-gps').textContent = 'Capturar ubicación';
}

// ════════════════════════════════════════════════════════
// CAPA DE ALMACENAMIENTO
// ════════════════════════════════════════════════════════
// IMPORTANTE: estas son las únicas dos funciones que cambiarán
// cuando conectemos Google Apps Script. Por ahora usan localStorage
// (solo guarda en este navegador/dispositivo).
//
// Cuando tengamos la URL del Apps Script, estas funciones harán
// fetch() hacia ese endpoint en vez de tocar localStorage.
// ════════════════════════════════════════════════════════

async function guardarRegistro(registro) {
  if (APPS_SCRIPT_URL) {
    // ── Modo centralizado (Google Sheets) ──
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(registro)
    });
  } else {
    // ── Modo local de prueba (localStorage) ──
    const registros = obtenerRegistrosLocal();
    registros.push(registro);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
  }
}

async function obtenerRegistros() {
  if (APPS_SCRIPT_URL) {
    // ── Modo centralizado (Google Sheets) ──
    const res = await fetch(APPS_SCRIPT_URL);
    const data = await res.json();
    return data;
  } else {
    // ── Modo local de prueba (localStorage) ──
    return obtenerRegistrosLocal();
  }
}

function obtenerRegistrosLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function limpiarTodo() {
  if (!confirm('¿Borrar todos los registros guardados? Esta acción no se puede deshacer.')) return;

  if (APPS_SCRIPT_URL) {
    alert('Borrar registros centralizados debe hacerse directamente en la hoja de Google Sheets, por seguridad.');
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  cargarYRenderPanel();
}

// ════════════════════════════════════════════════════════
// NAVEGACIÓN ENTRE VISTAS
// ════════════════════════════════════════════════════════
function cambiarVista(vista) {
  // Seguridad: conductores nunca pueden llegar al panel
  if (vista === 'panel' && sesion && sesion.rol !== 'admin') return;

  document.querySelectorAll('.vista').forEach(el => el.classList.remove('activa'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('activo'));

  const vistaEl = document.getElementById('vista-' + vista);
  const tabEl   = document.getElementById('tab-' + vista);

  if (vistaEl) vistaEl.classList.add('activa');
  if (tabEl)   tabEl.classList.add('activo');

  if (vista === 'panel') cargarYRenderPanel();
}

async function cargarYRenderPanel() {
  const registros = await obtenerRegistros();
  renderPanel(registros);
}

// ════════════════════════════════════════════════════════
// RENDER DEL PANEL DE COORDINACIÓN
// ════════════════════════════════════════════════════════
function renderPanel(todosRegistros) {
  const hoy = new Date();
  document.getElementById('panel-fecha').textContent =
    `${pad(hoy.getDate())}/${pad(hoy.getMonth() + 1)}/${hoy.getFullYear()} — ${pad(hoy.getHours())}:${pad(hoy.getMinutes())}`;

  const hoyKey = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
  let registros = todosRegistros.filter(r => String(r.fecha).slice(0, 10) === hoyKey);

  actualizarResumen(registros);
  actualizarFiltros(registros);

  if (filtroActivo !== 'todos') {
    registros = registros.filter(r => r.conductor === filtroActivo);
  }
  registros = [...registros].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  renderListaRegistros(registros);
}

function actualizarResumen(registros) {
  const conGps = registros.filter(r => r.lat).length;
  const sinGps = registros.length - conGps;
  const conductoresUnicos = new Set(registros.map(r => r.conductor)).size;

  document.getElementById('r-total').textContent = registros.length;
  document.getElementById('r-gps').textContent = conGps;
  document.getElementById('r-sin-gps').textContent = sinGps;
  document.getElementById('r-conductores').textContent = conductoresUnicos;
}

function actualizarFiltros(registros) {
  const conductores = ['todos', ...new Set(registros.map(r => r.conductor))];
  const filtrosEl = document.getElementById('filtros');
  filtrosEl.innerHTML = '';

  conductores.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'filtro-btn' + (c === filtroActivo ? ' activo' : '');
    btn.textContent = c === 'todos' ? 'Todos' : c;
    btn.addEventListener('click', () => {
      filtroActivo = c;
      cargarYRenderPanel();
    });
    filtrosEl.appendChild(btn);
  });
}

function renderListaRegistros(registros) {
  const lista = document.getElementById('reg-lista');
  lista.innerHTML = '';

  if (registros.length === 0) {
    lista.innerHTML = `<div class="vacio"><div class="vacio-icono">📭</div>Sin registros todavía hoy.</div>`;
    return;
  }

  registros.forEach(r => lista.appendChild(crearTarjetaRegistro(r)));
}

function crearTarjetaRegistro(r) {
  const d = new Date(r.timestamp);
  const horaTxt = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const tieneGps = !!r.lat;

  const card = document.createElement('div');
  card.className = 'reg-card' + (tieneGps ? ' con-gps' : '');
  card.innerHTML = `
    <div>
      <div class="reg-hora">${horaTxt}</div>
      <div class="reg-tipo">${r.tipo}</div>
    </div>
    <div>
      <div class="reg-conductor">${r.conductor}</div>
      <div class="reg-placa">${r.placa}</div>
    </div>
    <div>
      <div class="reg-nota">${escapeHtml(r.nota)}</div>
      ${tieneGps
        ? `<div class="reg-gps">📍 <a href="https://www.google.com/maps?q=${r.lat},${r.lng}" target="_blank">${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</a> (±${r.precision}m)</div>`
        : `<div class="reg-gps" style="color:var(--amarillo)">Sin ubicación GPS</div>`}
    </div>
    <div style="text-align:right">
      <span class="reg-badge ${tieneGps ? 'gps' : 'sin-gps'}">${tieneGps ? 'Con GPS' : 'Sin GPS'}</span>
    </div>`;
  return card;
}

// ════════════════════════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════════════════════════
function pad(n) { return String(n).padStart(2, '0'); }

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}