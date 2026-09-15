/**
 * Quiniela Liga MX — lógica de la PWA
 * -----------------------------------
 * ÚNICA LÍNEA QUE TIENES QUE CAMBIAR: WEBAPP_URL de aquí abajo. Pega ahí la
 * URL que te dio Apps Script al implementar WebApp.gs como "Aplicación web"
 * (termina en /exec). Ver COMO_USAR_PWA.md para el paso a paso.
 */
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxIsPOivqqh4bKGsGFkkFrLvU1NpEEk71Xv0n2e6UgV6luGfJWaUU_LWFfinhMyuuG0Aw/exec";

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

document.addEventListener("DOMContentLoaded", function () {
  if (!WEBAPP_URL || WEBAPP_URL.indexOf("PEGA_AQUI") !== -1) {
    mostrarErrorConfiguracion();
    return;
  }

  const nombreGuardado = localStorage.getItem("quiniela_nombre") || "";
  document.getElementById("nombre").value = nombreGuardado;

  document.getElementById("tab-capturar").addEventListener("click", function () { cambiarVista("capturar"); });
  document.getElementById("tab-tabla").addEventListener("click", function () { cambiarVista("tabla"); cargarTabla(); });
  document.getElementById("tab-resultados").addEventListener("click", abrirAdmin);
  document.getElementById("form-quiniela").addEventListener("submit", enviarQuiniela);

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
    Object.keys(params).forEach(function (k) { url += "&" + k + "=" + encodeURIComponent(params[k]); });
  }
  const resp = await fetch(url);
  return resp.json();
}

async function apiPost(body) {
  // OJO: content-type "text/plain" a propósito -- evita que el navegador mande
  // una petición OPTIONS de preflight, que Apps Script Web Apps no responde.
  const resp = await fetch(WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  return resp.json();
}

async function iniciarCapturar() {
  const cont = document.getElementById("contenido-capturar");
  cont.innerHTML = '<p class="centro">Cargando partidos…</p>';
  try {
    const activa = await apiGet("activa");
    if (!activa.ok) throw new Error(activa.error || "No se pudo leer la jornada activa.");
    await cargarJornada(activa.jornada);
  } catch (err) {
    cont.innerHTML = '<div class="aviso error">Sin conexión con el Sheet ahorita. Intenta de nuevo en un momento.<br><small>' + escaparHtml(String(err.message || err)) + "</small></div>";
  }
}

// Pide y muestra una jornada específica (la usa tanto la carga inicial como
// las flechitas de "< Jornada N >" para moverse entre semanas).
async function cargarJornada(jornada) {
  const cont = document.getElementById("contenido-capturar");
  cont.innerHTML = '<p class="centro">Cargando partidos…</p>';
  estado.jornada = jornada;
  try {
    const datos = await apiGet("partidos", { jornada: jornada });
    if (!datos.ok) {
      cont.innerHTML = navJornadaHtml(jornada) + '<div class="aviso info">' + escaparHtml(datos.error) + "</div>";
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
    // así puede consultarlo sin tener que pedírtelo a ti.
    let miQuiniela = null;
    const nombreGuardado = (localStorage.getItem("quiniela_nombre") || "").trim();
    if (!datos.cerrada && nombreGuardado) {
      try {
        const mia = await apiGet("miquiniela", { nombre: nombreGuardado, jornada: datos.jornada });
        if (mia.ok && mia.registrada) miQuiniela = mia.marcadores;
      } catch (err) {
        // si falla esta consulta extra, no pasa nada -- se muestra el formulario normal
      }
    }

    renderPartidos(datos, miQuiniela);
    cargarRegistros(datos.jornada);
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
function renderPartidos(datos, miQuiniela) {
  const cont = document.getElementById("contenido-capturar");
  const yaRegistrada = !!miQuiniela;
  const bloques = datos.partidos.map(function (p, i) {
    const marcadorHtml = yaRegistrada
      ? '<div class="marcador marcador-fijo">' +
        '<span class="valor-fijo">' + escaparHtml(miQuiniela[i].local) + "</span>" +
        '<span class="vs">-</span>' +
        '<span class="valor-fijo">' + escaparHtml(miQuiniela[i].visita) + "</span>" +
        "</div>"
      : '<div class="marcador">' +
        '<input type="number" inputmode="numeric" min="0" max="15" class="input-resultado" data-lado="local" value="0">' +
        '<span class="vs">-</span>' +
        '<input type="number" inputmode="numeric" min="0" max="15" class="input-resultado" data-lado="visita" value="0">' +
        "</div>";
    return (
      '<div class="partido" data-i="' + i + '">' +
      '<div class="equipo local">' + escudoHtml(p.local) + '<span class="nombre-equipo">' + escaparHtml(p.local) + "</span></div>" +
      marcadorHtml +
      '<div class="equipo visita">' + escudoHtml(p.visita) + '<span class="nombre-equipo">' + escaparHtml(p.visita) + "</span></div>" +
      "</div>"
    );
  }).join("");

  const cerrada = datos.cerrada;
  let aviso = "";
  if (cerrada) {
    aviso = '<div class="aviso info">Esta jornada ya cerró (ya se capturaron los resultados reales). Aquí abajo puedes ver la tabla general.</div>';
  } else if (yaRegistrada) {
    aviso = '<div class="aviso exito">Ya enviaste tu quiniela para esta jornada ⚽ Aquí abajo está lo que registraste — ya no se puede cambiar. Si te equivocaste, pídele al admin que lo corrija directo en el Sheet.</div>';
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

async function cargarRegistros(jornada) {
  const cont = document.getElementById("registrados");
  try {
    const datos = await apiGet("registros", { jornada: jornada });
    if (!datos.ok) { cont.innerHTML = ""; return; }
    const chips = datos.nombres.map(function (n, idx) {
      return '<span class="chip-nombre"><span class="chip-nombre-num">' + (idx + 1) + '</span>' + escaparHtml(n) + "</span>";
    }).join("");
    cont.innerHTML =
      '<div class="tarjeta">' +
      '<div class="registrados-header">' +
      '<span class="registrados-titulo">Registrados — Jornada ' + jornada + "</span>" +
      '<span class="chip chip-conteo">' + datos.total + "</span>" +
      "</div>" +
      (datos.nombres.length
        ? '<div class="chips-nombres">' + chips + "</div>"
        : '<p class="lista-nombres">Todavía nadie se ha registrado.</p>') +
      "</div>";
  } catch (err) {
    cont.innerHTML = "";
  }
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
      // Muestra de inmediato lo que se acaba de mandar, de solo lectura --
      // así el participante ve confirmado exactamente lo que quedó guardado.
      renderPartidos({ jornada: estado.jornada, cerrada: false, partidos: estado.partidos }, estado.marcadores);
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
  const filas = datos.filas.map(function (fila, idx) {
    const esYo = fila.nombre.trim().toLowerCase() === miNombre;
    const clasesFila = [];
    if (idx === 0) clasesFila.push("puesto-1");
    if (idx === 1) clasesFila.push("puesto-2");
    if (idx === 2) clasesFila.push("puesto-3");
    if (esYo) clasesFila.push("total"); // resalta al usuario (reutiliza estilo bold)
    return (
      "<tr" + (clasesFila.length ? ' class="' + clasesFila.join(" ") + '"' : "") + ">" +
      "<td>" + escaparHtml(fila.nombre) + (esYo ? " (tú)" : "") + "</td>" +
      '<td class="total">' + fila.total + "</td>" +
      "</tr>"
    );
  }).join("");

  cont.innerHTML =
    '<div class="tarjeta tabla-scroll">' +
    '<table class="tabla-general">' +
    "<thead><tr><th>Nombre</th><th>Jornada " + datos.jornada + "</th></tr></thead>" +
    "<tbody>" + (filas || '<tr><td colspan="2" class="centro">Todavía nadie se ha registrado.</td></tr>') + "</tbody>" +
    "</table>" +
    "</div>";
}

// ---------- pestaña "Resultados" (solo admin) ----------
//
// El botón "🔒 Admin" lo ve cualquiera en la barra de arriba, pero no sirve
// de nada sin el PIN: la primera vez que le dan clic pide un PIN y lo guarda
// en ESE celular (no hay que volver a escribirlo cada vez que abran la app
// ahí); si alguien pone un PIN incorrecto simplemente no va a poder guardar
// ningún resultado -- el Sheet es quien de verdad valida el PIN, así que no
// hay riesgo de que alguien sin el PIN correcto llegue a cambiar algo.
function abrirAdmin() {
  if (!localStorage.getItem("quiniela_admin_pin")) {
    const pin = window.prompt("PIN de administrador:");
    if (!pin) return; // canceló, no entra a la pestaña
    localStorage.setItem("quiniela_admin_pin", pin);
  }
  cambiarVista("resultados");
  cargarResultadosAdmin();
}

async function cargarResultadosAdmin(jornadaParam) {
  const cont = document.getElementById("contenido-resultados");
  cont.innerHTML = '<p class="centro">Cargando partidos…</p>';
  try {
    let jornada = jornadaParam;
    if (!jornada) {
      const activa = await apiGet("activa");
      if (!activa.ok) throw new Error(activa.error || "No se pudo leer la jornada activa.");
      jornada = activa.jornada;
    }
    estadoAdmin.jornada = jornada;
    const datos = await apiGet("partidos", { jornada: jornada });
    if (!datos.ok) {
      cont.innerHTML = navJornadaAdminHtml(jornada) + '<div class="aviso info">' + escaparHtml(datos.error) + "</div>";
      activarNavJornadaAdmin();
      return;
    }
    estadoAdmin.jornada = datos.jornada;
    estadoAdmin.partidos = datos.partidos;
    renderResultadosAdmin(datos);
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

function renderResultadosAdmin(datos) {
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

  cont.innerHTML =
    '<div class="tarjeta">' +
    navJornadaAdminHtml(datos.jornada) +
    '<div class="aviso info">Deja un partido en blanco si todavía no termina. En cuanto completes los 9, esa jornada cierra sola para todos (ya no se aceptan más quinielas).</div>' +
    '<div id="lista-resultados">' + filas + "</div>" +
    '<div id="mensaje-resultados"></div>' +
    '<button type="button" id="btn-guardar-resultados" class="principal">Guardar resultados</button>' +
    "</div>";

  activarNavJornadaAdmin();
  document.getElementById("btn-guardar-resultados").addEventListener("click", guardarResultadosAdmin);
}

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

  boton.disabled = true;
  boton.textContent = "Guardando…";
  msg.innerHTML = "";

  try {
    const resp = await apiPost({
      action: "guardarResultados",
      pin: localStorage.getItem("quiniela_admin_pin") || "",
      jornada: estadoAdmin.jornada,
      resultados: resultados,
    });
    if (resp.ok) {
      const avisoCierre = resp.cerrada ? " La jornada quedó cerrada -- ya no se aceptan más quinielas." : "";
      msg.innerHTML = '<div class="aviso exito">' + escaparHtml(resp.mensaje + avisoCierre) + "</div>";
    } else {
      const esPinMalo = String(resp.error || "").indexOf("PIN") !== -1;
      msg.innerHTML =
        '<div class="aviso error">' + escaparHtml(resp.error) +
        (esPinMalo ? " Vuelve a darle clic al botón 🔒 Admin para escribirlo de nuevo." : "") +
        "</div>";
      if (esPinMalo) {
        localStorage.removeItem("quiniela_admin_pin");
      }
    }
  } catch (err) {
    msg.innerHTML = '<div class="aviso error">No se pudo guardar (revisa tu conexión) e intenta de nuevo.</div>';
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar resultados";
  }
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto === undefined || texto === null ? "" : String(texto);
  return div.innerHTML;
}
