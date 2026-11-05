/**
 * Quiniela Liga MX — lógica de la PWA
 * -----------------------------------
 * ÚNICA LÍNEA QUE TIENES QUE CAMBIAR: WEBAPP_URL de aquí abajo. Pega ahí la
 * URL que te dio Apps Script al implementar WebApp.gs como "Aplicación web"
 * (termina en /exec). Ver COMO_USAR_PWA.md para el paso a paso.
 */
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxIsPOivqqh4bKGsGFkkFrLvU1NpEEk71Xv0n2e6UgV6luGfJWaUU_LWFfinhMyuuG0Aw/exec";

// ---------- tokens de participante (Vulnerabilidad A de la auditoría) ----------
//
// Antes, "ver mi quiniela ya registrada" confiaba nada más en el nombre --
// cualquiera que supiera el nombre de otro participante podía ver su
// quiniela. Ahora, cuando el backend acepta un registro nuevo (apiSubmit),
// regresa un token aleatorio que SOLO ese celular guarda; de ahí en
// adelante, para volver a leer esa quiniela hay que mandar el nombre Y ese
// token -- el nombre solo ya no basta. Esto vive en un mapa guardado en
// localStorage, igual de simple que lo que ya existía para "quiniela_nombre".
function normalizarNombreCliente(s) {
  // Debe coincidir exactamente con normalizarNombre() del backend (mismo
  // algoritmo: sin mayúsculas/minúsculas, sin acentos, sin espacios de
  // sobra) para que las llaves del mapa de tokens siempre calcen con lo que
  // el servidor espera.
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function leerMapaTokens() {
  try {
    return JSON.parse(localStorage.getItem("quiniela_tokens") || "{}");
  } catch (err) {
    return {};
  }
}

function guardarTokenParticipante(jornada, nombre, token) {
  try {
    const mapa = leerMapaTokens();
    mapa[jornada + ":" + normalizarNombreCliente(nombre)] = token;
    localStorage.setItem("quiniela_tokens", JSON.stringify(mapa));
  } catch (err) {
    // si localStorage falla (modo privado, cuota llena) no hay nada más que
    // hacer -- esa persona nada más no podrá consultar su quiniela después
    // desde este mismo celular, pero su registro en el Sheet sigue intacto.
  }
}

function obtenerTokenParticipante(jornada, nombre) {
  const mapa = leerMapaTokens();
  return mapa[jornada + ":" + normalizarNombreCliente(nombre)] || "";
}

// ---------- sesión de administrador (Vulnerabilidad D de la auditoría) ----------
//
// Antes, el PIN se guardaba para siempre en localStorage y se mandaba crudo
// en cada acción de admin. Ahora se manda una sola vez a "adminLogin"; si es
// correcto, el backend entrega un TOKEN DE SESIÓN con vencimiento (24 horas)
// -- es ese token, no el PIN, lo que se guarda y se manda de ahí en
// adelante. Si el token se filtrara, caduca solo.
function leerSesionAdmin() {
  try {
    return JSON.parse(localStorage.getItem("quiniela_admin_sesion") || "null");
  } catch (err) {
    return null;
  }
}

function guardarSesionAdmin(token, expiraEn) {
  try {
    localStorage.setItem("quiniela_admin_sesion", JSON.stringify({ token: token, expiraEn: expiraEn }));
  } catch (err) {
    // sin localStorage, el admin tendrá que volver a dar el PIN cada vez que recargue
  }
}

function borrarSesionAdmin() {
  try { localStorage.removeItem("quiniela_admin_sesion"); } catch (err) { /* nada que hacer */ }
}

function tokenSesionAdminVigente() {
  const sesion = leerSesionAdmin();
  if (!sesion || !sesion.token || !sesion.expiraEn) return "";
  if (Date.now() > sesion.expiraEn) return "";
  return sesion.token;
}

const estado = {
  jornada: null,
  partidos: [],
  marcadores: [],
};

// Estado de la pestaña oculta "Resultados" (solo para el admin) -- separado
// de "estado" a propósito, para no cruzar datos con la pestaña Capturar.
const estadoAdmin = {
  jornada: null,
  partidos: [],
};

// Estado de la pestaña "Quinielas" (capturas de todos, solo lectura).
const estadoQuinielas = {
  jornada: null,
};

document.addEventListener("DOMContentLoaded", function () {
  if (!WEBAPP_URL || WEBAPP_URL.indexOf("PEGA_AQUI") !== -1) {
    mostrarErrorConfiguracion();
    return;
  }

  const nombreGuardado = localStorage.getItem("quiniela_nombre") || "";
  document.getElementById("nombre").value = nombreGuardado;

  document.getElementById("tab-capturar").addEventListener("click", function () { cambiarVista("capturar"); });
  document.getElementById("tab-tabla").addEventListener("click", function () { cambiarVista("tabla"); cargarTabla(); });
  document.getElementById("tab-quinielas").addEventListener("click", function () { cambiarVista("quinielas"); cargarQuinielas(estadoQuinielas.jornada); });
  document.getElementById("form-quiniela").addEventListener("submit", enviarQuiniela);

  iniciarAdmin();
  iniciarCapturar();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () { /* sin service worker no pasa nada grave */ });
  }
});

function mostrarErrorConfiguracion() {
  document.getElementById("app").innerHTML =
    '<div class="aviso error" style="margin:16px;">' +
    "Falta conectar esta app con tu Google Sheet: edita <code>app.js</code> y pega tu URL de " +
    "Apps Script en la constante <code>WEBAPP_URL</code>. Instrucciones en COMO_USAR_PWA.md." +
    "</div>";
}

function cambiarVista(nombre) {
  document.querySelectorAll(".vista").forEach(function (v) { v.classList.remove("activa"); });
  document.querySelectorAll("nav.tabs button").forEach(function (b) { b.classList.remove("activo"); });
  document.getElementById("vista-" + nombre).classList.add("activa");
  document.getElementById("tab-" + nombre).classList.add("activo");
}

async function apiGet(accion, params) {
  let url = WEBAPP_URL + "?action=" + accion;
  if (params) {
    Object.keys(params).forEach(function (k) {
      const v = params[k];
      // Si no hay valor, el parámetro ni se manda -- así el backend puede
      // resolver solo cosas como "cuál es la jornada activa" en vez de que
      // el celular tenga que pedirlo aparte primero (ver fetchConReintento).
      if (v === undefined || v === null || v === "") return;
      url += "&" + k + "=" + encodeURIComponent(v);
    });
  }
  return fetchConReintento(url, {});
}

async function apiPost(body) {
  // OJO: content-type "text/plain" a propósito -- evita que el navegador mande
  // una petición OPTIONS de preflight, que Apps Script Web Apps no responde.
  return fetchConReintento(WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
}

// Google Apps Script tarda uno o varios segundos CADA VEZ que arranca para
// contestar, y si varios participantes abren la app casi al mismo tiempo
// (por ejemplo antes de que cierren las capturas) a veces de plano no
// alcanza a responder -- eso es lo que se veía como "no se pudo conectar
// con el Sheet" aunque el internet estuviera perfecto. Para que eso se
// arregle solo la mayoría de las veces sin que el participante tenga que
// darse cuenta ni volver a tocar nada: cada petición espera hasta 18
// segundos, y si no contesta a tiempo (o falla por un problema de red
// pasajero), se reintenta una sola vez más antes de rendirse de verdad.
// Reintentar es seguro incluso para guardar cosas (submit/guardarResultados/
// actualizarAprobacion): si la primera ya se había guardado pero la
// respuesta se perdió en el camino, repetirla nada más vuelve a guardar lo
// mismo -- y en el caso de "submit" en particular, el propio Sheet detecta
// que ya existe esa quiniela y avisa en vez de duplicar la fila.
async function fetchConReintento(url, opts) {
  let ultimoError;
  for (let intento = 1; intento <= 2; intento++) {
    const controlador = new AbortController();
    const timeoutId = setTimeout(function () { controlador.abort(); }, 18000);
    try {
      const resp = await fetch(url, Object.assign({}, opts, { signal: controlador.signal }));
      clearTimeout(timeoutId);
      return await resp.json();
    } catch (err) {
      clearTimeout(timeoutId);
      ultimoError = err;
      if (intento < 2) {
        await new Promise(function (r) { setTimeout(r, 700); });
      }
    }
  }
  throw ultimoError;
}

async function iniciarCapturar() {
  // Antes esto pedía "activa" aparte, nada más para saber qué jornada pedir
  // después con "partidos" -- dos idas y vueltas completas a Apps Script, una
  // detrás de otra, solo para la primera pantalla que ve cualquiera al abrir
  // la app. Ahora "partidos" sabe resolver sola cuál es la jornada activa
  // cuando no se le manda ninguna, así que de una vez se pide directo.
  await cargarJornada(null);
}

// Pide y muestra una jornada específica (la usa tanto la carga inicial como
// las flechitas de "< Jornada N >" para moverse entre semanas). jornada=null
// significa "la que esté activa ahorita", y el backend la resuelve solo.
async function cargarJornada(jornada) {
  const cont = document.getElementById("contenido-capturar");
  cont.innerHTML = '<p class="centro">Cargando partidos…</p>';
  estado.jornada = jornada;
  try {
    // Esto, lo que antes era mi quiniela aparte ("miquiniela") y la lista de
    // registrados ("registros") se piden TODO junto en esta sola llamada --
    // antes eran hasta 3 idas y vueltas distintas a Apps Script (cada una con
    // su propio arranque lento) solo para mostrar esta pestaña.
    const nombreGuardado = (localStorage.getItem("quiniela_nombre") || "").trim();
    // El token de un participante se guarda POR JORNADA (cada registro tiene
    // el suyo) -- así que para mandar el correcto hace falta saber ya el
    // número real de la jornada, no basta con "la que esté activa". Si esta
    // llamada no trae un número de jornada explícito (jornada=null, el caso
    // de la primera pantalla al abrir la app) y hay un nombre guardado, se
    // resuelve primero cuál es la jornada activa con una llamada aparte --
    // barata y sin datos sensibles -- antes de buscar el token en el celular.
    // En cualquier otra llamada (las flechitas "< Jornada N >") ya se manda
    // un número concreto y este paso extra ni se activa.
    let jornadaParaToken = jornada;
    if (!jornadaParaToken && nombreGuardado) {
      const activa = await apiGet("activa");
      if (activa && activa.ok) jornadaParaToken = activa.jornada;
    }
    const tokenGuardado = (jornadaParaToken && nombreGuardado) ? obtenerTokenParticipante(jornadaParaToken, nombreGuardado) : "";
    const datos = await apiGet("partidos", { jornada: jornada, nombre: nombreGuardado, token: tokenGuardado });
    if (!datos.ok) {
      estado.jornada = datos.jornada || jornada;
      cont.innerHTML = navJornadaHtml(datos.jornada || jornada || "") + '<div class="aviso info">' + escaparHtml(datos.error) + "</div>";
      activarNavJornada();
      document.getElementById("form-quiniela").style.display = "none";
      document.getElementById("registrados").innerHTML = "";
      return;
    }
    estado.jornada = datos.jornada;
    estado.partidos = datos.partidos;
    estado.marcadores = datos.partidos.map(function () { return { local: 0, visita: 0 }; });

    // Si esta persona ya mandó su quiniela para esta jornada, en vez del
    // formulario vacío se le muestra lo que ya registró (de solo lectura) --
    // así puede consultarlo sin tener que pedírtelo a ti. Esto se pide
    // SIEMPRE que haya un nombre guardado, sin importar si la jornada ya
    // cerró o no -- si solo se pidiera cuando sigue abierta, al refrescar la
    // pestaña Capturar después de que ya se capturaron los resultados reales,
    // parecería que "no habías registrado nada" aunque sí lo hubieras hecho.
    let miQuiniela = null;
    let miEstado = null;
    if (datos.miQuiniela && datos.miQuiniela.ok && datos.miQuiniela.registrada) {
      miQuiniela = datos.miQuiniela.marcadores;
      miEstado = datos.miQuiniela.estado;
    }

    renderPartidos(datos, miQuiniela, miEstado);
    renderRegistros(datos.registros);
  } catch (err) {
    cont.innerHTML = '<div class="aviso error">Sin conexión con el Sheet ahorita.<br><small>' + escaparHtml(String(err.message || err)) + "</small></div>";
  }
}

function navJornadaHtml(jornada) {
  return (
    '<div class="jornada-nav">' +
    '<button type="button" id="jornada-prev" class="nav-flecha" aria-label="Jornada anterior">‹</button>' +
    '<span class="chip">Jornada ' + jornada + "</span>" +
    '<button type="button" id="jornada-next" class="nav-flecha" aria-label="Jornada siguiente">›</button>' +
    "</div>"
  );
}

function activarNavJornada() {
  document.getElementById("jornada-prev").addEventListener("click", function () { cambiarJornadaMostrada(-1); });
  document.getElementById("jornada-next").addEventListener("click", function () { cambiarJornadaMostrada(1); });
}

function cambiarJornadaMostrada(delta) {
  const nueva = Math.min(17, Math.max(1, estado.jornada + delta));
  if (nueva === estado.jornada) return;
  cargarJornada(nueva);
}

// miQuiniela: null si todavía puede capturar, o un arreglo [{local,visita}, ...]
// (uno por partido, en el mismo orden que datos.partidos) si ya la registró
// -- en ese caso se muestra de solo lectura, ya no editable.
function renderPartidos(datos, miQuiniela, miEstado) {
  const cont = document.getElementById("contenido-capturar");
  const yaRegistrada = !!miQuiniela;
  // "cerrada" aquí significa "ya no se aceptan capturas" -- puede ser porque
  // tú lo cerraste a mano desde Admin, o porque ya se capturaron los 9
  // resultados reales (ese seguro automático sigue existiendo pase lo que
  // pase con el interruptor manual).
  const cerrada = !datos.capturasAbiertas;
  // Si la jornada ya cerró y esta persona nunca registró su quiniela, ya no
  // tiene caso enseñarle un formulario vacío (ya no se puede mandar) -- mejor
  // se le enseña de una vez el resultado real de cada partido (si ya se sabe),
  // de solo lectura.
  const sinCapturaYCerrada = cerrada && !yaRegistrada;
  const bloques = datos.partidos.map(function (p, i) {
    let marcadorHtml;
    if (yaRegistrada) {
      marcadorHtml = marcadorFijoHtml(miQuiniela[i].local, miQuiniela[i].visita);
    } else if (sinCapturaYCerrada) {
      marcadorHtml = marcadorFijoHtml(
        p.local_goles === "" ? "—" : p.local_goles,
        p.visita_goles === "" ? "—" : p.visita_goles
      );
    } else {
      marcadorHtml =
        '<div class="marcador">' +
        '<input type="number" inputmode="numeric" min="0" max="15" class="input-resultado" data-lado="local" value="" placeholder="0">' +
        '<span class="vs">-</span>' +
        '<input type="number" inputmode="numeric" min="0" max="15" class="input-resultado" data-lado="visita" value="" placeholder="0">' +
        "</div>";
    }
    return (
      '<div class="partido" data-i="' + i + '">' +
      '<div class="equipo local">' + escudoHtml(p.local) + '<span class="nombre-equipo">' + escaparHtml(p.local) + "</span></div>" +
      marcadorHtml +
      '<div class="equipo visita">' + escudoHtml(p.visita) + '<span class="nombre-equipo">' + escaparHtml(p.visita) + "</span></div>" +
      "</div>"
    );
  }).join("");

  const detalleCierre = datos.resultadosCompletos ? " (ya se capturaron los resultados reales)" : "";
  // El admin ahora aprueba cada quiniela a mano -- se lo hacemos saber a la
  // persona para que no se quede con la duda de por qué no sale en la tabla.
  let notaEstado = "";
  let claseEstado = "exito";
  if (miEstado === "aprobada") {
    notaEstado = " Tu quiniela ya fue aprobada por el admin.";
    claseEstado = "exito";
  } else if (miEstado === "rechazada") {
    notaEstado = " Tu quiniela fue rechazada por el admin -- contáctalo si crees que es un error.";
    claseEstado = "error";
  } else if (yaRegistrada) {
    notaEstado = " Está pendiente de aprobación del admin.";
    claseEstado = "info";
  }

  let aviso = "";
  if (cerrada && yaRegistrada) {
    aviso = '<div class="aviso ' + claseEstado + '">Ya no se aceptan capturas para esta jornada' + detalleCierre + '. Aquí abajo está lo que registraste.' + notaEstado + "</div>";
  } else if (sinCapturaYCerrada) {
    aviso = '<div class="aviso info">Ya no se aceptan capturas para esta jornada' + detalleCierre + ' y no alcanzaste a registrar la tuya. Aquí abajo puedes ver cómo van los resultados.</div>';
  } else if (yaRegistrada) {
    aviso = '<div class="aviso ' + claseEstado + '">Ya enviaste tu quiniela para esta jornada ⚽ Aquí abajo está lo que registraste — ya no se puede cambiar.' + notaEstado + ' Si te equivocaste, pídele al admin que lo corrija directo en el Sheet.</div>';
  }

  cont.innerHTML =
    '<div class="tarjeta">' +
    navJornadaHtml(datos.jornada) +
    aviso +
    '<div id="lista-partidos">' + bloques + "</div>" +
    "</div>";

  activarNavJornada();

  document.getElementById("form-quiniela").style.display = (cerrada || yaRegistrada) ? "none" : "";

  if (!cerrada && !yaRegistrada) {
    cont.querySelectorAll(".input-resultado").forEach(function (input) {
      input.addEventListener("input", function () {
        const i = Number(input.closest(".partido").dataset.i);
        const lado = input.dataset.lado;
        const val = parseInt(input.value, 10);
        estado.marcadores[i][lado] = isNaN(val) ? 0 : Math.max(0, Math.min(15, val));
      });
    });
  }
}

function marcadorFijoHtml(local, visita) {
  return (
    '<div class="marcador marcador-fijo">' +
    '<span class="valor-fijo">' + escaparHtml(local) + "</span>" +
    '<span class="vs">-</span>' +
    '<span class="valor-fijo">' + escaparHtml(visita) + "</span>" +
    "</div>"
  );
}

// Busca el logo en logos/<NOMBRE-TAL-CUAL-EN-PARTIDOS>.png -- por ejemplo
// "CRUZ AZUL" busca logos/CRUZ AZUL.png. Así el archivo se llama exactamente
// igual que el equipo en tu hoja PARTIDOS, sin tener que renombrar nada.
// Si el archivo no existe, el onerror lo oculta solo -- el partido se sigue
// viendo bien nada más con el nombre en texto.
function escudoHtml(nombreEquipo) {
  const nombre = String(nombreEquipo || "").trim();
  if (!nombre) return "";
  return '<img class="escudo" src="./logos/' + encodeURIComponent(nombre) + '.png" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
}

// Usada después de mandar una quiniela nueva (ahí sí hace falta pedirlo
// aparte, porque lo que se acaba de registrar no venía en ninguna respuesta
// previa). Para la carga normal de la pestaña, "registros" ya viene incluido
// dentro de la respuesta de "partidos" -- ver renderRegistros más abajo.
async function cargarRegistros(jornada) {
  try {
    const datos = await apiGet("registros", { jornada: jornada });
    renderRegistros(datos);
  } catch (err) {
    document.getElementById("registrados").innerHTML = "";
  }
}

function renderRegistros(datos) {
  const cont = document.getElementById("registrados");
  if (!datos || !datos.ok) { cont.innerHTML = ""; return; }
  const chips = datos.nombres.map(function (n, idx) {
    return '<span class="chip-nombre"><span class="chip-nombre-num">' + (idx + 1) + '</span>' + escaparHtml(n) + "</span>";
  }).join("");
  cont.innerHTML =
    '<div class="tarjeta">' +
    '<div class="registrados-header">' +
    '<span class="registrados-titulo">Registrados — Jornada ' + datos.jornada + "</span>" +
    '<span class="chip chip-conteo">' + datos.total + "</span>" +
    "</div>" +
    (datos.nombres.length
      ? '<div class="chips-nombres">' + chips + "</div>"
      : '<p class="lista-nombres">Todavía nadie se ha registrado.</p>') +
    "</div>";
}

async function enviarQuiniela(ev) {
  ev.preventDefault();
  const nombre = document.getElementById("nombre").value.trim();
  const msg = document.getElementById("mensaje-envio");
  if (!nombre) {
    msg.innerHTML = '<div class="aviso error">Escribe tu nombre.</div>';
    return;
  }
  localStorage.setItem("quiniela_nombre", nombre);

  const boton = document.getElementById("btn-enviar");
  boton.disabled = true;
  boton.textContent = "Enviando…";
  msg.innerHTML = "";

  try {
    const resp = await apiPost({
      action: "submit",
      nombre: nombre,
      jornada: estado.jornada,
      marcadores: estado.marcadores,
    });
    if (resp.ok) {
      msg.innerHTML = '<div class="aviso exito">' + escaparHtml(resp.mensaje) + "</div>";
      // Guarda el token que acompaña a este registro -- es lo que de ahora
      // en adelante prueba que ESTE celular es el que mandó esta quiniela
      // (ver Vulnerabilidad A de la auditoría). Sin esto, "ver mi quiniela"
      // dejaría de funcionar para lo que se acaba de mandar.
      if (resp.token) guardarTokenParticipante(estado.jornada, nombre, resp.token);
      // Muestra de inmediato lo que se acaba de mandar, de solo lectura --
      // así el participante ve confirmado exactamente lo que quedó guardado.
      // Toda quiniela recién mandada empieza "pendiente" de aprobación.
      renderPartidos({ jornada: estado.jornada, capturasAbiertas: true, partidos: estado.partidos }, estado.marcadores, "pendiente");
      cargarRegistros(estado.jornada);
    } else {
      msg.innerHTML = '<div class="aviso error">' + escaparHtml(resp.error) + "</div>";
    }
  } catch (err) {
    msg.innerHTML = '<div class="aviso error">No se pudo enviar (revisa tu conexión) e intenta de nuevo.</div>';
  } finally {
    boton.disabled = false;
    boton.textContent = "Enviar mi quiniela";
  }
}

async function cargarTabla() {
  const cont = document.getElementById("contenido-tabla");
  cont.innerHTML = '<p class="centro">Cargando tabla…</p>';
  try {
    const datos = await apiGet("tabla");
    if (!datos.ok) throw new Error(datos.error || "Error al leer la tabla.");
    renderTabla(datos);
  } catch (err) {
    cont.innerHTML = '<div class="aviso error">Sin conexión con el Sheet ahorita.<br><small>' + escaparHtml(String(err.message || err)) + "</small></div>";
  }
}

function renderTabla(datos) {
  const miNombre = (localStorage.getItem("quiniela_nombre") || "").trim().toLowerCase();
  const cont = document.getElementById("contenido-tabla");
  const medallas = { 1: "🥇", 2: "🥈", 3: "🥉" };

  // A petición tuya: cuando dos o más quedan con los mismos puntos, el
  // desempate es quien haya capturado el total de goles de la jornada más
  // cerca del total real (columna "Goles" de abajo) -- se enseña esa columna
  // siempre, no solo cuando hay empate, para que nadie se quede con la duda
  // de por qué alguien quedó arriba con los mismos puntos.
  let huboEmpate = false;
  for (let i = 1; i < datos.filas.length; i++) {
    if (datos.filas[i].total === datos.filas[i - 1].total) { huboEmpate = true; break; }
  }
  const notaDesempate = huboEmpate
    ? '<p class="nota-control">Hay empate en puntos esta jornada -- desempata quien haya quedado más cerca del total real de goles (' + datos.totalGolesJornada + ' goles en toda la jornada), sin importar si se pasó o se quedó corto.</p>'
    : "";

  const filas = datos.filas.map(function (fila, idx) {
    const puesto = idx + 1;
    const esYo = fila.nombre.trim().toLowerCase() === miNombre;
    const clasesFila = [];
    if (puesto <= 3) clasesFila.push("puesto-" + puesto);
    if (esYo) clasesFila.push("fila-yo");
    const badge = medallas[puesto]
      ? '<span class="badge-puesto badge-medalla">' + medallas[puesto] + "</span>"
      : '<span class="badge-puesto">' + puesto + "</span>";
    return (
      "<tr" + (clasesFila.length ? ' class="' + clasesFila.join(" ") + '"' : "") + ">" +
      '<td class="celda-puesto">' + badge + "</td>" +
      '<td class="celda-nombre">' + escaparHtml(fila.nombre) + (esYo ? ' <span class="chip-tu">tú</span>' : "") + "</td>" +
      '<td class="total">' + fila.total + "</td>" +
      '<td class="celda-goles">' + fila.golesQuiniela + "</td>" +
      "</tr>"
    );
  }).join("");

  cont.innerHTML =
    '<div class="tarjeta tabla-scroll">' +
    notaDesempate +
    '<table class="tabla-general">' +
    "<thead><tr><th></th><th>Nombre</th><th>Jornada " + datos.jornada + '</th><th title="Suma de los 9 marcadores que capturó (local + visita) -- se usa para desempatar">Goles</th></tr></thead>' +
    "<tbody>" + (filas || '<tr><td colspan="4" class="centro">Todavía nadie se ha registrado.</td></tr>') + "</tbody>" +
    "</table>" +
    "</div>";
}

// ---------- pestaña "Quinielas" (capturas de todos, solo lectura) ----------
//
// Le enseña a cualquiera lo que registró cada participante en una jornada --
// pero SOLO cuando tú prendiste el interruptor "Mostrar las quinielas
// capturadas a todos" para esa jornada, desde la pestaña Admin. Es decisión
// tuya, no depende de si la jornada ya cerró ni de si ya hay resultados
// reales -- puedes mostrarlas desde que arranca la jornada, para que la
// gente especule. Antes de que lo prendas, el backend regresa la lista vacía
// a propósito (aunque alguien llame el endpoint directo).
async function cargarQuinielas(jornadaParam) {
  const cont = document.getElementById("contenido-quinielas");
  cont.innerHTML = '<p class="centro">Cargando…</p>';
  try {
    // "partidos" y "quinielas" se piden AL MISMO TIEMPO (en paralelo) en vez
    // de uno después del otro -- antes había que esperar primero la
    // respuesta de "activa" y luego la de "partidos" nada más para saber si
    // tocaba pedir "quinielas", una idas-y-vueltas detrás de otra. El backend
    // ahora resuelve solo la jornada activa si no se le manda ninguna, así
    // que se lanzan las dos peticiones de una vez; si al final resulta que
    // las quinielas no están visibles, el resultado de esa llamada paralela
    // simplemente no se usa.
    const [datos, quinielas] = await Promise.all([
      apiGet("partidos", { jornada: jornadaParam }),
      apiGet("quinielas", { jornada: jornadaParam }),
    ]);

    if (!datos.ok) {
      estadoQuinielas.jornada = datos.jornada || jornadaParam;
      cont.innerHTML = navJornadaQuinielasHtml(datos.jornada || jornadaParam || "") + '<div class="aviso info">' + escaparHtml(datos.error) + "</div>";
      activarNavJornadaQuinielas();
      return;
    }
    estadoQuinielas.jornada = datos.jornada;

    if (!datos.quinielasVisibles) {
      cont.innerHTML =
        navJornadaQuinielasHtml(datos.jornada) +
        '<div class="aviso info">El admin todavía no habilita ver las quinielas de todos para esta jornada.</div>';
      activarNavJornadaQuinielas();
      return;
    }

    if (!quinielas.ok) throw new Error(quinielas.error || "No se pudieron leer las quinielas.");
    renderQuinielas(datos, quinielas.filas);
  } catch (err) {
    cont.innerHTML = '<div class="aviso error">Sin conexión con el Sheet ahorita.<br><small>' + escaparHtml(String(err.message || err)) + "</small></div>";
  }
}

function navJornadaQuinielasHtml(jornada) {
  return (
    '<div class="jornada-nav">' +
    '<button type="button" id="jornada-prev-quinielas" class="nav-flecha" aria-label="Jornada anterior">‹</button>' +
    '<span class="chip">Jornada ' + jornada + "</span>" +
    '<button type="button" id="jornada-next-quinielas" class="nav-flecha" aria-label="Jornada siguiente">›</button>' +
    "</div>"
  );
}

function activarNavJornadaQuinielas() {
  document.getElementById("jornada-prev-quinielas").addEventListener("click", function () { cambiarJornadaQuinielas(-1); });
  document.getElementById("jornada-next-quinielas").addEventListener("click", function () { cambiarJornadaQuinielas(1); });
}

function cambiarJornadaQuinielas(delta) {
  const nueva = Math.min(17, Math.max(1, estadoQuinielas.jornada + delta));
  if (nueva === estadoQuinielas.jornada) return;
  cargarQuinielas(nueva);
}

// Cada participante se enseña como una tarjeta plegable (con <details>, sin
// necesitar JS aparte para abrir/cerrar): el encabezado trae su nombre y
// cuántos marcadores exactos acertó; al abrirla se ve partido por partido lo
// que puso, comparado contra el resultado real (con 🎯 si le atinó exacto).
// "L" (ganó el local), "V" (ganó el visitante) o "E" (empate) -- se usa para
// saber si alguien le atinó al RESULTADO aunque no al marcador exacto.
function resultadoDe(local, visita) {
  local = Number(local);
  visita = Number(visita);
  if (local > visita) return "L";
  if (visita > local) return "V";
  return "E";
}

function renderQuinielas(datos, filas) {
  const cont = document.getElementById("contenido-quinielas");
  const miNombre = (localStorage.getItem("quiniela_nombre") || "").trim().toLowerCase();

  if (!filas.length) {
    cont.innerHTML = navJornadaQuinielasHtml(datos.jornada) + '<p class="centro">Todavía no hay quinielas aprobadas para mostrar en esta jornada.</p>';
    activarNavJornadaQuinielas();
    return;
  }

  const personas = filas.map(function (fila) {
    const filasPartidos = datos.partidos.map(function (p, i) {
      const m = fila.marcadores[i] || {};
      const realL = p.local_goles === "" ? null : Number(p.local_goles);
      const realV = p.visita_goles === "" ? null : Number(p.visita_goles);
      // Verde = acertó el marcador exacto. Amarillo/naranja = acertó quién
      // ganaba (o el empate) pero no el marcador. Rojo = ni eso. Sin color =
      // ese partido todavía no tiene resultado real, no se puede juzgar.
      let clase = "";
      let real = "—";
      if (realL !== null) {
        real = realL + "-" + realV;
        const exacto = Number(m.local) === realL && Number(m.visita) === realV;
        if (exacto) {
          clase = "qp-exacto";
          real += " 🎯";
        } else if (resultadoDe(m.local, m.visita) === resultadoDe(realL, realV)) {
          clase = "qp-resultado";
        } else {
          clase = "qp-fallo";
        }
      }
      return (
        "<tr" + (clase ? ' class="' + clase + '"' : "") + ">" +
        '<td class="qp-partido">' + escaparHtml(p.local) + " vs " + escaparHtml(p.visita) + "</td>" +
        '<td class="qp-pick">' + escaparHtml(m.local) + "-" + escaparHtml(m.visita) + "</td>" +
        '<td class="qp-real">' + real + "</td>" +
        "</tr>"
      );
    }).join("");
    return { nombre: fila.nombre, puntos: fila.puntos, filasPartidos: filasPartidos };
  });

  // El orden y los puntos que se muestran son los MISMOS que ya calcula tu
  // Sheet para la Tabla general (columna AG de RESPUESTAS) -- no se inventa
  // ningún número nuevo aquí, para que nunca haya dos cuentas distintas.
  personas.sort(function (a, b) {
    const pa = a.puntos == null ? -1 : a.puntos;
    const pb = b.puntos == null ? -1 : b.puntos;
    if (pb !== pa) return pb - pa;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  const tarjetas = personas.map(function (persona) {
    const esYo = persona.nombre.trim().toLowerCase() === miNombre;
    const puntosTexto = persona.puntos == null ? "— pts" : persona.puntos + " pts";
    return (
      '<details class="tarjeta quiniela-persona' + (esYo ? " fila-yo" : "") + '">' +
      "<summary>" +
      '<span class="qp-nombre">' + escaparHtml(persona.nombre) + (esYo ? ' <span class="chip-tu">tú</span>' : "") + "</span>" +
      '<span class="qp-puntos">' + puntosTexto + "</span>" +
      "</summary>" +
      '<table class="qp-tabla">' + persona.filasPartidos + "</table>" +
      "</details>"
    );
  }).join("");

  cont.innerHTML = navJornadaQuinielasHtml(datos.jornada) + tarjetas;
  activarNavJornadaQuinielas();
}

// ---------- pestaña "Resultados" (solo admin) ----------
//
// El botón "🔒 Admin" lo ve cualquiera en la barra de arriba, pero no sirve
// de nada sin el PIN: la primera vez que le dan clic pide un PIN y lo guarda
// en ESE celular (no hay que volver a escribirlo cada vez que abran la app
// ahí); si alguien pone un PIN incorrecto simplemente no va a poder guardar
// ningún resultado -- el Sheet es quien de verdad valida el PIN, así que no
// hay riesgo de que alguien sin el PIN correcto llegue a cambiar algo.
//
// iniciarAdmin() deja el botón listo SIN depender de cómo esté publicado
// index.html -- si en GitHub quedó una copia vieja del archivo (por ejemplo
// de cuando el botón todavía estaba oculto), esto lo corrige solo: le quita
// cualquier "hidden" que pueda traer, le pone el texto/ícono correctos, y si
// por alguna razón el botón ni siquiera existe en esa página, lo crea. Así
// esta pestaña nunca vuelve a depender de tener TODOS los archivos
// perfectamente sincronizados en GitHub.
function iniciarAdmin() {
  let boton = document.getElementById("tab-resultados");
  if (!boton) {
    boton = document.createElement("button");
    boton.id = "tab-resultados";
    const nav = document.querySelector("nav.tabs");
    if (nav) nav.appendChild(boton);
  }
  boton.hidden = false;
  boton.removeAttribute("hidden");
  boton.classList.add("tab-admin");
  boton.textContent = "🔒 Admin";
  boton.addEventListener("click", abrirAdmin);
}

// A diferencia de antes (donde el PIN se guardaba para siempre y se mandaba
// crudo en cada petición), ahora se pide el PIN una sola vez para "iniciar
// sesión" -- el backend lo valida y entrega un token de sesión temporal
// (24 horas) que es lo único que se guarda de ahí en adelante. Si ya hay una
// sesión vigente guardada en este celular, no se vuelve a pedir el PIN.
async function abrirAdmin() {
  if (!tokenSesionAdminVigente()) {
    const logrado = await iniciarSesionAdmin();
    if (!logrado) return; // canceló o el PIN fue incorrecto
  }
  cambiarVista("resultados");
  cargarResultadosAdmin();
}

async function iniciarSesionAdmin() {
  const pin = window.prompt("PIN de administrador:");
  if (!pin) return false; // canceló
  try {
    const resp = await apiPost({ action: "adminLogin", pin: pin });
    if (resp.ok) {
      guardarSesionAdmin(resp.token, resp.expiraEn);
      return true;
    }
    window.alert(resp.error || "No se pudo iniciar sesión.");
    return false;
  } catch (err) {
    window.alert("No se pudo conectar con el Sheet para validar el PIN. Intenta de nuevo.");
    return false;
  }
}

// Si cualquier acción de admin regresa "no autorizado" (sesión vencida, o
// se cerró desde otro lado), se borra la sesión guardada en este celular y
// se le pide a la persona que vuelva a entrar -- en vez de quedarse
// mandando un token que el servidor ya no va a aceptar nunca.
function esRespuestaNoAutorizada(resp) {
  return !resp.ok && String(resp.error || "").toLowerCase().indexOf("autorizado") !== -1;
}

async function cargarResultadosAdmin(jornadaParam) {
  const cont = document.getElementById("contenido-resultados");
  cont.innerHTML = '<p class="centro">Cargando partidos…</p>';
  try {
    // "partidos" y "participantesJornada" se piden AL MISMO TIEMPO (en
    // paralelo) -- antes "participantesJornada" se pedía hasta que ya había
    // terminado de llegar "partidos" (y encima después de "activa" aparte),
    // una detrás de otra. El backend ya sabe resolver solo la jornada activa
    // para ambas si no se le manda ninguna, así que no hace falta esperar.
    const [datos, participantesResp] = await Promise.all([
      apiGet("partidos", { jornada: jornadaParam }),
      apiGet("participantesJornada", { jornada: jornadaParam, token: tokenSesionAdminVigente() }),
    ]);

    if (esRespuestaNoAutorizada(participantesResp)) {
      borrarSesionAdmin();
      const reingreso = await iniciarSesionAdmin();
      if (reingreso) return cargarResultadosAdmin(jornadaParam);
    }

    if (!datos.ok) {
      estadoAdmin.jornada = datos.jornada || jornadaParam;
      cont.innerHTML = navJornadaAdminHtml(datos.jornada || jornadaParam || "") + '<div class="aviso info">' + escaparHtml(datos.error) + "</div>";
      activarNavJornadaAdmin();
      return;
    }
    estadoAdmin.jornada = datos.jornada;
    estadoAdmin.partidos = datos.partidos;
    renderResultadosAdmin(datos, participantesResp);
  } catch (err) {
    cont.innerHTML = '<div class="aviso error">Sin conexión con el Sheet ahorita.<br><small>' + escaparHtml(String(err.message || err)) + "</small></div>";
  }
}

function navJornadaAdminHtml(jornada) {
  return (
    '<div class="jornada-nav">' +
    '<button type="button" id="jornada-prev-admin" class="nav-flecha" aria-label="Jornada anterior">‹</button>' +
    '<span class="chip">Jornada ' + jornada + "</span>" +
    '<button type="button" id="jornada-next-admin" class="nav-flecha" aria-label="Jornada siguiente">›</button>' +
    "</div>"
  );
}

function activarNavJornadaAdmin() {
  document.getElementById("jornada-prev-admin").addEventListener("click", function () { cambiarJornadaAdmin(-1); });
  document.getElementById("jornada-next-admin").addEventListener("click", function () { cambiarJornadaAdmin(1); });
}

function cambiarJornadaAdmin(delta) {
  const nueva = Math.min(17, Math.max(1, estadoAdmin.jornada + delta));
  if (nueva === estadoAdmin.jornada) return;
  cargarResultadosAdmin(nueva);
}

function renderResultadosAdmin(datos, participantesResp) {
  const cont = document.getElementById("contenido-resultados");
  const filas = datos.partidos.map(function (p, i) {
    return (
      '<div class="partido" data-i="' + i + '" data-num="' + p.num + '">' +
      '<div class="equipo local">' + escudoHtml(p.local) + '<span class="nombre-equipo">' + escaparHtml(p.local) + "</span></div>" +
      '<div class="marcador">' +
      '<input type="number" inputmode="numeric" min="0" max="30" class="input-resultado" data-lado="local" value="' + (p.local_goles === "" ? "" : p.local_goles) + '">' +
      '<span class="vs">-</span>' +
      '<input type="number" inputmode="numeric" min="0" max="30" class="input-resultado" data-lado="visita" value="' + (p.visita_goles === "" ? "" : p.visita_goles) + '">' +
      "</div>" +
      '<div class="equipo visita">' + escudoHtml(p.visita) + '<span class="nombre-equipo">' + escaparHtml(p.visita) + "</span></div>" +
      "</div>"
    );
  }).join("");

  const notaResultados = datos.resultadosCompletos
    ? '<p class="nota-control">Ya están los 9 resultados reales de esta jornada, así que de cualquier forma ya no se aceptan capturas nuevas, aunque dejes marcada la primera casilla.</p>'
    : "";

  // A petición tuya, la lista de participantes ahora es una lista
  // desplegable (como las tarjetas de la pestaña Quinielas) en vez de estar
  // siempre abierta -- así no tienes que hacer scroll por todos los
  // participantes nada más para llegar al botón "Guardar" de hasta abajo.
  // Arranca CERRADA siempre, pero el encabezado ya te dice cuántos siguen
  // pendientes de aprobar, para que sepas si vale la pena abrirla.
  const pendientesCount = (participantesResp && participantesResp.ok)
    ? participantesResp.participantes.filter(function (p) { return p.estado === "pendiente"; }).length
    : 0;
  const badgePendientes = pendientesCount
    ? ' <span class="chip chip-conteo" style="background:var(--dorado-claro,#e8b84b);color:var(--azul-oscuro,#0b1a2b);">' + pendientesCount + " pendiente" + (pendientesCount === 1 ? "" : "s") + "</span>"
    : "";

  cont.innerHTML =
    '<div class="tarjeta">' +
    navJornadaAdminHtml(datos.jornada) +
    '<div class="aviso info">Deja un partido en blanco si todavía no termina.</div>' +
    '<div id="lista-resultados">' + filas + "</div>" +
    '<style>.seccion-admin > summary.titulo-seccion-admin { cursor: pointer; list-style: revert; } .seccion-admin > summary.titulo-seccion-admin::marker { color: var(--azul-claro, #7ec8ff); }</style>' +
    '<details class="seccion-admin">' +
    '<summary class="titulo-seccion-admin">Participantes — Jornada ' + datos.jornada + badgePendientes + "</summary>" +
    '<p class="nota-control">Solo cuentan en la Tabla general y se ven en la pestaña Quinielas los que marques como "Aprobada". Aprueba a quien ya pagó o quieres que participe; rechaza al resto (aunque tengan el link).</p>' +
    '<div id="lista-participantes-admin"><p class="centro">Cargando participantes…</p></div>' +
    '<div id="mensaje-participantes-admin"></div>' +
    "</details>" +
    '<div class="control-jornada">' +
    '<label class="chk-control"><input type="checkbox" id="chk-capturas-abiertas"' + (datos.capturasManual ? " checked" : "") + '><span>Aceptar capturas de quiniela para esta jornada</span></label>' +
    '<label class="chk-control"><input type="checkbox" id="chk-quinielas-visibles"' + (datos.quinielasVisibles ? " checked" : "") + '><span>Mostrar las quinielas capturadas a todos (pestaña "Quinielas")</span></label>' +
    notaResultados +
    "</div>" +
    '<div id="mensaje-resultados"></div>' +
    '<button type="button" id="btn-guardar-resultados" class="principal">Guardar</button>' +
    "</div>";

  activarNavJornadaAdmin();
  document.getElementById("btn-guardar-resultados").addEventListener("click", guardarResultadosAdmin);

  // "participantesJornada" ya se pidió en paralelo con "partidos" desde
  // cargarResultadosAdmin -- aquí nada más se renderiza lo que ya llegó, sin
  // tener que hacer una llamada aparte.
  const contParticipantes = document.getElementById("lista-participantes-admin");
  if (participantesResp && participantesResp.ok) {
    renderParticipantesAdmin(participantesResp.participantes, datos.jornada);
  } else if (contParticipantes) {
    contParticipantes.innerHTML = '<p class="centro">No se pudo cargar la lista de participantes.</p>';
  }
}

// Lista de quién se registró en esta jornada, con un selector de estado
// (Pendiente / Aprobada / Rechazada) por persona. Cada cambio se guarda de
// inmediato -- no hace falta darle al botón "Guardar" de hasta abajo para
// esto (ese es solo para los resultados y las dos casillas de arriba).
// Vulnerabilidad B de la auditoría: esta función construía cada fila
// concatenando strings, incluyendo el nombre del participante dentro de un
// atributo (data-nombre="..."). escaparHtml() nunca fue seguro para eso --
// solo escapa lo necesario para CONTENIDO de texto, no comillas dentro de un
// atributo -- así que un nombre con una comilla doble y un manejador de
// evento (algo como `Juan" onmouseover="...`) podía romper el atributo e
// inyectar JavaScript que corría en el navegador del ADMIN, justo donde
// vivía el PIN guardado. Ahora cada fila se construye con el DOM directo
// (createElement + .dataset / .textContent), que nunca permite que un valor
// "rompa" el HTML sin importar qué caracteres traiga -- no se concatena
// ningún string con datos de un participante.
const ETIQUETAS_ESTADO = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada" };

function renderParticipantesAdmin(participantes, jornada) {
  const cont = document.getElementById("lista-participantes-admin");
  cont.innerHTML = "";
  if (!participantes.length) {
    const vacio = document.createElement("p");
    vacio.className = "centro";
    vacio.textContent = "Nadie se ha registrado todavía esta jornada.";
    cont.appendChild(vacio);
    return;
  }

  participantes.forEach(function (p) {
    const fila = document.createElement("div");
    fila.className = "participante-admin estado-" + p.estado;
    fila.dataset.nombre = p.nombre; // seguro: el DOM nunca deja que esto rompa el HTML

    const spanNombre = document.createElement("span");
    spanNombre.className = "pa-nombre";
    spanNombre.textContent = p.nombre;

    const select = document.createElement("select");
    select.className = "pa-estado";
    ESTADOS_APROBACION_FRONT.forEach(function (e) {
      const opt = document.createElement("option");
      opt.value = e;
      opt.textContent = ETIQUETAS_ESTADO[e];
      if (e === p.estado) opt.selected = true;
      select.appendChild(opt);
    });

    fila.appendChild(spanNombre);
    fila.appendChild(select);
    cont.appendChild(fila);
  });

  cont.querySelectorAll(".pa-estado").forEach(function (select) {
    select.addEventListener("change", async function () {
      const fila = select.closest(".participante-admin");
      const nombre = fila.dataset.nombre;
      const estado = select.value;
      const msg = document.getElementById("mensaje-participantes-admin");
      select.disabled = true;
      try {
        const resp = await apiPost({
          action: "actualizarAprobacion",
          token: tokenSesionAdminVigente(),
          jornada: jornada,
          nombre: nombre,
          estado: estado,
        });
        if (resp.ok) {
          fila.className = "participante-admin estado-" + estado;
          msg.innerHTML = "";
        } else if (esRespuestaNoAutorizada(resp)) {
          borrarSesionAdmin();
          msg.innerHTML = '<div class="aviso error">Tu sesión de admin venció. Vuelve a darle clic al botón 🔒 Admin para entrar de nuevo.</div>';
        } else {
          msg.innerHTML = '<div class="aviso error">' + escaparHtml(resp.error || "No se pudo actualizar.") + "</div>";
        }
      } catch (err) {
        msg.innerHTML = '<div class="aviso error">No se pudo guardar (revisa tu conexión) e intenta de nuevo.</div>';
      } finally {
        select.disabled = false;
      }
    });
  });
}

var ESTADOS_APROBACION_FRONT = ["pendiente", "aprobada", "rechazada"];

async function guardarResultadosAdmin() {
  const msg = document.getElementById("mensaje-resultados");
  const boton = document.getElementById("btn-guardar-resultados");
  const filas = document.querySelectorAll("#lista-resultados .partido");
  const resultados = Array.prototype.map.call(filas, function (fila) {
    const num = Number(fila.dataset.num);
    const local = fila.querySelector('[data-lado="local"]').value.trim();
    const visita = fila.querySelector('[data-lado="visita"]').value.trim();
    return { num: num, local_goles: local, visita_goles: visita };
  });

  const capturasAbiertas = document.getElementById("chk-capturas-abiertas").checked;
  const quinielasVisibles = document.getElementById("chk-quinielas-visibles").checked;

  boton.disabled = true;
  boton.textContent = "Guardando…";
  msg.innerHTML = "";

  try {
    const resp = await apiPost({
      action: "guardarResultados",
      token: tokenSesionAdminVigente(),
      jornada: estadoAdmin.jornada,
      resultados: resultados,
      capturasAbiertas: capturasAbiertas,
      quinielasVisibles: quinielasVisibles,
    });
    if (resp.ok) {
      const avisoCierre = !resp.capturasAbiertas ? " Ya no se aceptan capturas para esta jornada." : "";
      msg.innerHTML = '<div class="aviso exito">' + escaparHtml(resp.mensaje + avisoCierre) + "</div>";
    } else if (esRespuestaNoAutorizada(resp)) {
      borrarSesionAdmin();
      msg.innerHTML = '<div class="aviso error">Tu sesión de admin venció. Vuelve a darle clic al botón 🔒 Admin para entrar de nuevo.</div>';
    } else {
      msg.innerHTML = '<div class="aviso error">' + escaparHtml(resp.error) + "</div>";
    }
  } catch (err) {
    msg.innerHTML = '<div class="aviso error">No se pudo guardar (revisa tu conexión) e intenta de nuevo.</div>';
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar resultados";
  }
}

// Escapa texto para insertarlo como CONTENIDO (entre etiquetas, nunca dentro
// de un atributo con comillas). Además de lo que ya hacía (& < >), también
// codifica comillas dobles y simples como defensa adicional -- por si en el
// futuro alguien reutiliza esta función dentro de un atributo sin darse
// cuenta, como pasó antes en renderParticipantesAdmin (ver abajo). Para
// construir ATRIBUTOS con texto que viene de un participante (nombres, etc.)
// la forma correcta y la que se usa ahora es con el DOM directo
// (elemento.dataset.algo = valor / elemento.setAttribute(...)), nunca
// concatenando strings -- eso es lo que de verdad cierra ese tipo de hueco,
// esta función es nada más un cinturón extra.
function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto === undefined || texto === null ? "" : String(texto);
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
