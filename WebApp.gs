/**
 * ================================================================
 * QUINIELA LIGA MX — API para la PWA (app instalable de celular)
 * ================================================================
 * Este es un SEGUNDO archivo de código dentro del MISMO proyecto de Apps
 * Script. No reemplaza a Code.gs (donde pegaste Codigo_AppsScript.gs) — ese
 * sigue ahí, generando el formulario semanal. Este archivo nada más agrega
 * una "puerta" (Web App) para que la app del celular pueda leer PARTIDOS y
 * RESPUESTAS (la tabla general de la app se calcula al vuelo desde RESPUESTAS,
 * no desde la hoja TABLA_GENERAL), y para que pueda mandar marcadores nuevos.
 *
 * Reutiliza las constantes y funciones ya definidas en Codigo_AppsScript.gs
 * (HOJA_PARTIDOS, HOJA_RESPUESTAS, HOJA_CONFIG, PRIMERA_FILA_RESPUESTAS,
 * SELECTOR_JORNADA_CELDA, findFirstEmptyRow) — ambos archivos comparten el
 * mismo proyecto, así que no hace falta repetir nada de eso aquí.
 *
 * INSTALACIÓN (una sola vez, ADEMÁS de lo que ya hiciste con Codigo_AppsScript.gs):
 *   1. Abre tu Google Sheet > Extensiones > Apps Script (el mismo proyecto
 *      donde ya está Code.gs con el generador de formularios).
 *   2. En el panel izquierdo, dale al "+" junto a "Archivos" > Script.
 *      Ponle de nombre exactamente: WebApp
 *   3. Borra el contenido de ejemplo que te ponga y pega TODO este archivo.
 *   4. Cambia ADMIN_PIN (ver más abajo) por uno que solo tú conozcas.
 *   5. Guarda (ícono de disco).
 *   6. Arriba a la derecha, botón azul "Implementar" > "Nueva implementación".
 *   7. Junto a "Seleccionar tipo", dale al engranaje ⚙️ y elige "Aplicación web".
 *   8. "Ejecutar como": Yo (tu cuenta). "Quién tiene acceso": Cualquier usuario.
 *   9. Dale "Implementar". Puede volver a pedir que autorices permisos — es tu
 *      propio script, es seguro, dale Permitir (si sale "app no verificada":
 *      Configuración avanzada > Ir a Quiniela [no seguro] > Permitir).
 *  10. Te da una URL que termina en "/exec". CÓPIALA COMPLETA — esa es la que
 *      va a usar la app del celular. Pégala en el archivo app.js de la PWA,
 *      en la constante WEBAPP_URL (ver la guía COMO_USAR_PWA.md).
 *
 * SI DESPUÉS CAMBIAS ALGO EN ESTE ARCHIVO:
 *   "Implementar" > "Gestionar implementaciones" > ícono de lápiz > en
 *   "Versión" elige "Nueva versión" > Implementar. Si no haces esto, la URL ya
 *   publicada sigue usando el código viejo aunque hayas guardado los cambios.
 */

// PIN del administrador (tú) para poder capturar el resultado real de los
// partidos desde el celular, sin entrar al Sheet. CÁMBIALO por uno que solo
// tú conozcas (puede ser el que quieras, letras y/o números) antes de
// implementar. Este archivo nunca se le manda al celular a nadie -- vive
// solo aquí en el servidor, así que aunque alguien viera el código de la
// app (app.js) no puede ver este valor.
const ADMIN_PIN = "CAMBIA_ESTE_PIN";

function doGet(e) {
  try {
    var accion = e.parameter.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (accion === "activa") return salidaJson(apiJornadaActiva(ss));
    if (accion === "partidos") return salidaJson(apiPartidos(ss, e.parameter.jornada));
    if (accion === "tabla") return salidaJson(apiTabla(ss));
    if (accion === "registros") return salidaJson(apiRegistros(ss, e.parameter.jornada));
    if (accion === "miquiniela") return salidaJson(apiMiQuiniela(ss, e.parameter.nombre, e.parameter.jornada));
    if (accion === "quinielas") return salidaJson(apiQuinielasJornada(ss, e.parameter.jornada));

    return salidaJson({ ok: false, error: "Acción desconocida: " + accion });
  } catch (err) {
    return salidaJson({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.action === "submit") return salidaJson(apiSubmit(ss, body));
    if (body.action === "guardarResultados") return salidaJson(apiGuardarResultados(ss, body));

    return salidaJson({ ok: false, error: "Acción desconocida: " + body.action });
  } catch (err) {
    return salidaJson({ ok: false, error: String(err) });
  }
}

function salidaJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- endpoints ----------

function apiJornadaActiva(ss) {
  return { ok: true, jornada: jornadaActivaCalculada(ss) };
}

// La jornada "activa" para la app YA NO depende de la celda AK1 (esa celda
// sigue existiendo nada más para el encabezado/banner que se usa al tomarle
// captura de pantalla a RESPUESTAS). En vez de eso, la app detecta sola cuál
// es la jornada más reciente que ya tiene equipos cargados en PARTIDOS -- así
// no hace falta acordarse de actualizar nada a mano cada semana, ni depender
// de que se haya generado un Google Form para esa jornada.
function jornadaActivaCalculada(ss) {
  var sheet = ss.getSheetByName(HOJA_PARTIDOS);
  var data = sheet.getDataRange().getValues();
  var jornadasConEquipos = {};
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var j = Number(row[0]);
    if (!j) continue;
    if (row[2] && row[3]) jornadasConEquipos[j] = true; // Local y Visita capturados
  }
  var jornadas = Object.keys(jornadasConEquipos).map(Number);
  if (!jornadas.length) return 1;
  return Math.max.apply(null, jornadas);
}

function apiPartidos(ss, jornadaParam) {
  var jornada = Number(jornadaParam) || jornadaActivaCalculada(ss);
  var partidos = getPartidosConResultado(ss, jornada);
  if (partidos.length !== 9) {
    return { ok: false, error: "La Jornada " + jornada + " todavía no tiene los 9 partidos capturados en PARTIDOS." };
  }
  var faltanEquipos = partidos.some(function (p) { return !p.local || !p.visita; });
  if (faltanEquipos) {
    return { ok: false, error: "Faltan equipos por capturar en PARTIDOS para la Jornada " + jornada + "." };
  }
  var resultadosCompletos = partidos.every(function (p) { return p.local_goles !== "" && p.visita_goles !== ""; });
  var control = obtenerControlJornada(ss, jornada);
  // "capturasAbiertas" (lo que de verdad decide si se puede mandar una
  // quiniela) combina el interruptor manual del admin con un seguro
  // automático: aunque se le olvide cerrar las capturas a mano, en cuanto
  // los 9 resultados reales ya están capturados, de todas formas ya no se
  // aceptan quinielas nuevas -- nadie puede mandar una sabiendo el resultado.
  var capturasAbiertas = control.capturasManual && !resultadosCompletos;
  var costo = ss.getSheetByName(HOJA_CONFIG).getRange("C5").getValue();
  return {
    ok: true,
    jornada: jornada,
    cerrada: !capturasAbiertas, // se mantiene por compatibilidad
    resultadosCompletos: resultadosCompletos,
    capturasManual: control.capturasManual,
    capturasAbiertas: capturasAbiertas,
    quinielasVisibles: control.quinielasVisibles,
    costo: costo,
    partidos: partidos
  };
}

// ---------- CONTROL_JORNADAS: los dos interruptores manuales del admin ----------
//
// Antes, "¿se siguen aceptando capturas?" y "¿ya se pueden ver las quinielas
// de todos?" se decidían solas, automáticamente, en cuanto capturabas los 9
// resultados reales de los partidos. A petición tuya, ahora son DOS
// interruptores independientes que tú prendes/apagas a mano desde la pestaña
// Admin, sin importar si ya hay resultados reales o no -- así puedes, por
// ejemplo, cerrar las capturas en cuanto arranca la jornada y enseñar las
// quinielas de todos desde ese momento, para que la gente especule, aunque
// los partidos todavía no se jueguen.
//
// Esto vive en su propia hoja, "CONTROL_JORNADAS" (una fila por jornada), que
// esta función crea sola la primera vez que hace falta -- no tienes que
// crear nada a mano en el Sheet.
var HOJA_CONTROL = "CONTROL_JORNADAS";

function obtenerHojaControl(ss) {
  var sheet = ss.getSheetByName(HOJA_CONTROL);
  if (!sheet) {
    sheet = ss.insertSheet(HOJA_CONTROL);
    sheet.getRange(1, 1, 1, 3).setValues([["Jornada", "CapturasAbiertas", "QuinielasVisibles"]]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
  }
  return sheet;
}

// Valores por default para una jornada que el admin todavía no ha tocado:
// capturas abiertas (como siempre ha funcionado) y quinielas OCULTAS (para
// no arriesgar nada hasta que decidas mostrarlas a propósito).
function obtenerControlJornada(ss, jornada) {
  var sheet = obtenerHojaControl(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    for (var i = 0; i < data.length; i++) {
      if (Number(data[i][0]) === jornada) {
        return {
          capturasManual: data[i][1] !== false,
          quinielasVisibles: data[i][2] === true
        };
      }
    }
  }
  return { capturasManual: true, quinielasVisibles: false };
}

function guardarControlJornada(ss, jornada, capturasAbiertas, quinielasVisibles) {
  var sheet = obtenerHojaControl(ss);
  var lastRow = sheet.getLastRow();
  var fila = null;
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < data.length; i++) {
      if (Number(data[i][0]) === jornada) { fila = i + 2; break; }
    }
  }
  if (!fila) {
    fila = sheet.getLastRow() + 1;
    sheet.getRange(fila, 1).setValue(jornada);
  }
  sheet.getRange(fila, 2).setValue(!!capturasAbiertas);
  sheet.getRange(fila, 3).setValue(!!quinielasVisibles);
}

function getPartidosConResultado(ss, jornada) {
  var sheet = ss.getSheetByName(HOJA_PARTIDOS);
  var data = sheet.getDataRange().getValues();
  var partidos = [];
  for (var i = 2; i < data.length; i++) { // fila 3 en adelante
    var row = data[i];
    if (Number(row[0]) === jornada) {
      partidos.push({
        num: row[1],
        local: row[2],
        visita: row[3],
        fecha: row[4] ? String(row[4]) : "",
        local_goles: (row[5] === "" || row[5] === null || row[5] === undefined) ? "" : row[5],
        visita_goles: (row[6] === "" || row[6] === null || row[6] === undefined) ? "" : row[6]
      });
    }
  }
  return partidos;
}

// OJO: esta tabla se arma directo desde RESPUESTAS, NO desde la hoja
// TABLA_GENERAL del Sheet (esa se queda igual, es para tu control interno,
// y ahí sí puedes ver el acumulado de toda la temporada si algún día lo
// necesitas). La razón de leer RESPUESTAS directo: TABLA_GENERAL solo tiene
// fila para quien ya está dado de alta en PARTICIPANTES, así que alguien que
// contestó por el link abierto pero todavía no agregaste al roster
// desaparecía de la tabla aunque hubiera ganado -- eso pasó con Jesús Treviño.
//
// Además, esta tabla muestra SOLO la jornada en curso, no el acumulado de
// varias semanas: como cada jornada tiene su propio cobro y su propia bolsa
// (hoja PAGOS/CONFIG), el "primer lugar" que le importa a la gente cada
// semana es quién sacó más puntos ESA jornada, no la suma histórica. El
// acumulado de toda la temporada sigue disponible en TABLA_GENERAL si lo
// quieres consultar tú.
function apiTabla(ss) {
  var jornada = jornadaActivaCalculada(ss);
  var sheet = ss.getSheetByName(HOJA_RESPUESTAS);
  var lastRow = sheet.getLastRow();
  var filas = [];

  if (lastRow >= PRIMERA_FILA_RESPUESTAS) {
    var numRows = lastRow - PRIMERA_FILA_RESPUESTAS + 1;
    var nombres = sheet.getRange(PRIMERA_FILA_RESPUESTAS, 4, numRows, 1).getValues();  // D
    var jornadas = sheet.getRange(PRIMERA_FILA_RESPUESTAS, 5, numRows, 1).getValues(); // E
    var totales = sheet.getRange(PRIMERA_FILA_RESPUESTAS, 33, numRows, 1).getValues(); // AG

    for (var i = 0; i < numRows; i++) {
      var nombre = String(nombres[i][0] || "").trim();
      var jor = Number(jornadas[i][0]);
      var total = totales[i][0];
      if (!nombre || jor !== jornada) continue;
      if (total === "" || total === null || total === undefined) continue; // esta jornada aún no se califica

      filas.push({ nombre: nombre, total: Number(total) });
    }
  }

  filas.sort(function (a, b) { return b.total - a.total; });
  return { ok: true, jornada: jornada, filas: filas };
}

function apiRegistros(ss, jornadaParam) {
  var jornada = Number(jornadaParam) || jornadaActivaCalculada(ss);
  var sheet = ss.getSheetByName(HOJA_RESPUESTAS);
  var lastRow = sheet.getLastRow();
  var nombres = [];
  if (lastRow >= PRIMERA_FILA_RESPUESTAS) {
    var data = sheet.getRange(PRIMERA_FILA_RESPUESTAS, 4, lastRow - PRIMERA_FILA_RESPUESTAS + 1, 2).getValues(); // D=Nombre, E=Jornada
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] !== "" && Number(data[i][1]) === jornada) nombres.push(data[i][0]);
    }
  }
  return { ok: true, jornada: jornada, total: nombres.length, nombres: nombres };
}

// Le permite a un participante ver EXACTAMENTE lo que registró para una
// jornada (para que ya no tenga que preguntarte por WhatsApp "¿qué le puse
// al Tigres-América?"). Es de solo lectura -- no se puede editar desde aquí,
// eso sigue siendo a propósito (ver el comentario en apiSubmit).
function apiMiQuiniela(ss, nombreParam, jornadaParam) {
  var nombre = String(nombreParam || "").trim();
  var jornada = Number(jornadaParam);
  if (!nombre) return { ok: false, error: "Falta el nombre." };
  if (!jornada) return { ok: false, error: "Falta la jornada." };

  var sheet = ss.getSheetByName(HOJA_RESPUESTAS);
  var fila = buscarFilaExistente(sheet, nombre, jornada);
  if (!fila) return { ok: true, registrada: false };

  var valores = sheet.getRange(fila, 6, 1, 18).getValues()[0]; // F:W = 9 partidos x (local, visita)
  var marcadores = [];
  for (var i = 0; i < 9; i++) {
    marcadores.push({ local: valores[i * 2], visita: valores[i * 2 + 1] });
  }
  return { ok: true, registrada: true, marcadores: marcadores };
}

// Devuelve la quiniela de TODOS los que se registraron en una jornada --
// solo cuando TÚ prendiste el interruptor "mostrar las quinielas" para esa
// jornada desde la pestaña Admin (ver CONTROL_JORNADAS arriba). Mientras ese
// interruptor siga apagado se regresa vacío a propósito (aunque alguien
// llame el endpoint directo), así que esto es decisión tuya, no automática.
function apiQuinielasJornada(ss, jornadaParam) {
  var jornada = Number(jornadaParam);
  if (!jornada) return { ok: false, error: "Falta la jornada." };

  var control = obtenerControlJornada(ss, jornada);
  if (!control.quinielasVisibles) {
    return { ok: true, jornada: jornada, quinielasVisibles: false, filas: [] };
  }

  var sheet = ss.getSheetByName(HOJA_RESPUESTAS);
  var lastRow = sheet.getLastRow();
  if (lastRow < PRIMERA_FILA_RESPUESTAS) return { ok: true, jornada: jornada, quinielasVisibles: true, filas: [] };

  var data = sheet.getRange(PRIMERA_FILA_RESPUESTAS, 4, lastRow - PRIMERA_FILA_RESPUESTAS + 1, 20).getValues(); // D:W
  var filas = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (Number(row[1]) !== jornada) continue;
    var nombre = String(row[0] || "").trim();
    if (!nombre) continue;
    var marcadores = [];
    for (var j = 0; j < 9; j++) {
      marcadores.push({ local: row[2 + j * 2], visita: row[3 + j * 2] });
    }
    filas.push({ nombre: nombre, marcadores: marcadores });
  }
  return { ok: true, jornada: jornada, quinielasVisibles: true, filas: filas };
}

// Le permite SOLO al admin (dueño del PIN) capturar el resultado real de los
// partidos desde el celular -- escribe directo en PARTIDOS, columnas
// GolesLocal/GolesVisita (F y G), exactamente como si lo hicieras a mano en
// el Sheet. body.resultados es un arreglo de 9 {num, local_goles, visita_goles}
// (num = el número de partido, 1 a 9, tal como está en PARTIDOS). Un valor
// "" en local_goles/visita_goles significa "todavía no termina ese partido".
function apiGuardarResultados(ss, body) {
  if (String(body.pin || "") !== ADMIN_PIN) {
    return { ok: false, error: "PIN incorrecto." };
  }

  var jornada = Number(body.jornada);
  var resultados = body.resultados;
  if (!jornada) return { ok: false, error: "Falta la jornada." };
  if (!Array.isArray(resultados) || resultados.length !== 9) return { ok: false, error: "Faltan resultados de partidos." };

  var sheet = ss.getSheetByName(HOJA_PARTIDOS);
  var data = sheet.getDataRange().getValues();
  var filaPorNum = {};
  for (var i = 2; i < data.length; i++) {
    if (Number(data[i][0]) === jornada) filaPorNum[Number(data[i][1])] = i + 1; // +1 porque data es 0-index y la hoja es 1-index
  }

  for (var k = 0; k < resultados.length; k++) {
    var r = resultados[k];
    var fila = filaPorNum[Number(r.num)];
    if (!fila) continue; // ese número de partido no existe para esta jornada, se ignora

    var lg = (r.local_goles === "" || r.local_goles === null || r.local_goles === undefined) ? "" : Number(r.local_goles);
    var vg = (r.visita_goles === "" || r.visita_goles === null || r.visita_goles === undefined) ? "" : Number(r.visita_goles);
    if (lg !== "" && (isNaN(lg) || lg < 0 || lg > 30)) return { ok: false, error: "Marcador inválido en el partido " + r.num + "." };
    if (vg !== "" && (isNaN(vg) || vg < 0 || vg > 30)) return { ok: false, error: "Marcador inválido en el partido " + r.num + "." };

    sheet.getRange(fila, 6, 1, 2).setValues([[lg, vg]]); // F=GolesLocal, G=GolesVisita
  }

  // Guarda también los dos interruptores manuales de esta jornada (vienen
  // del checkbox de la pestaña Admin, junto con los resultados).
  guardarControlJornada(ss, jornada, body.capturasAbiertas, body.quinielasVisibles);

  var partidosActualizados = getPartidosConResultado(ss, jornada);
  var resultadosCompletos = partidosActualizados.length === 9 && partidosActualizados.every(function (p) { return p.local_goles !== "" && p.visita_goles !== ""; });
  var control = obtenerControlJornada(ss, jornada);
  var capturasAbiertas = control.capturasManual && !resultadosCompletos;

  return {
    ok: true,
    mensaje: "Resultados guardados en el Sheet.",
    cerrada: !capturasAbiertas, // compatibilidad
    resultadosCompletos: resultadosCompletos,
    capturasAbiertas: capturasAbiertas,
    quinielasVisibles: control.quinielasVisibles
  };
}

function apiSubmit(ss, body) {
  var nombre = String(body.nombre || "").trim();
  var jornada = Number(body.jornada);
  var marcadores = body.marcadores;

  if (!nombre) return { ok: false, error: "Falta el nombre." };
  if (!jornada || jornada < 1 || jornada > 17) return { ok: false, error: "Jornada inválida." };
  if (!Array.isArray(marcadores) || marcadores.length !== 9) return { ok: false, error: "Faltan marcadores de partidos." };

  var partidos = getPartidosConResultado(ss, jornada);
  if (partidos.length !== 9) return { ok: false, error: "Esa jornada no tiene los 9 partidos cargados todavía." };
  var resultadosCompletos = partidos.every(function (p) { return p.local_goles !== "" && p.visita_goles !== ""; });
  var control = obtenerControlJornada(ss, jornada);
  var capturasAbiertas = control.capturasManual && !resultadosCompletos;
  if (!capturasAbiertas) return { ok: false, error: "Ya no se aceptan capturas para esta jornada. Contacta al admin si necesitas corregir algo." };

  var scores = [];
  for (var i = 0; i < 9; i++) {
    var m = marcadores[i] || {};
    var local = Number(m.local);
    var visita = Number(m.visita);
    if (isNaN(local) || local < 0 || local > 15 || isNaN(visita) || visita < 0 || visita > 15) {
      return { ok: false, error: "Marcador inválido en el partido " + (i + 1) + " (usa números de 0 a 15)." };
    }
    scores.push(local, visita);
  }

  var sheet = ss.getSheetByName(HOJA_RESPUESTAS);

  // A propósito NO se permite reenviar para "corregir": una vez que alguien
  // registró su quiniela para esta jornada, queda fija -- si se pudiera
  // sobrescribir después de mandada, alguien podría cambiar su marcador tras
  // ver resultados parciales o lo que pusieron los demás, y eso sería trampa.
  // Solo el admin puede corregir algo, editando la fila directo en el Sheet.
  if (buscarFilaExistente(sheet, nombre, jornada)) {
    return { ok: false, error: "Ya registraste tu quiniela para la Jornada " + jornada + ". No se puede modificar desde aquí -- si te equivocaste, pídele al admin que lo corrija directo en el Sheet." };
  }

  var targetRow = findFirstEmptyRow(sheet);
  var filaCompleta = [new Date(), "", nombre, jornada].concat(scores); // empieza en columna B
  sheet.getRange(targetRow, 2, 1, filaCompleta.length).setValues([filaCompleta]);

  return { ok: true, mensaje: "¡Quiniela recibida! Mucha suerte esta jornada ⚽" };
}

// Detecta si esta persona ya tiene una quiniela registrada para esta jornada
// (desde la PWA o desde el Form -- ambos caen en la misma hoja), para no
// dejar que la sobrescriba. Ver el comentario en apiSubmit.
// Normaliza un nombre para comparar: sin mayúsculas/minúsculas, sin espacios
// de sobra ni acentos -- así "Héctor  Puente" y "hector puente" se
// reconocen como la misma persona sin importar cómo lo haya escrito cada
// quien en su celular. Esto es clave para que "ya registré mi quiniela" y
// "aquí está lo que capturaste" siempre encuentren la fila correcta.
function normalizarNombre(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function buscarFilaExistente(sheet, nombre, jornada) {
  var lastRow = sheet.getLastRow();
  if (lastRow < PRIMERA_FILA_RESPUESTAS) return null;
  var data = sheet.getRange(PRIMERA_FILA_RESPUESTAS, 4, lastRow - PRIMERA_FILA_RESPUESTAS + 1, 2).getValues(); // D=Nombre, E=Jornada
  var nombreBuscado = normalizarNombre(nombre);
  for (var i = 0; i < data.length; i++) {
    if (normalizarNombre(data[i][0]) === nombreBuscado && Number(data[i][1]) === jornada) {
      return i + PRIMERA_FILA_RESPUESTAS;
    }
  }
  return null;
}
