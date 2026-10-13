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
    let miEstado = null;
    const nombreGuardado = (localStorage.getItem("quiniela_nombre") || "").trim();
    // OJO: esto se pide SIEMPRE que haya un nombre guardado, sin importar si
    // la jornada ya cerró o no -- antes solo se pedía cuando seguía abierta,
    // y por eso al refrescar la pestaña Capturar después de que ya se
    // capturaron los resultados reales, parecía que "no habías registrado
    // nada" aunque sí lo hubieras hecho.
    if (nombreGuardado) {
      try {
        const mia = await apiGet("miquiniela", { nombre: nombreGuardado, jornada: datos.jornada });
        if (mia.ok && mia.registrada) {
          miQuiniela = mia.marcadores;
          miEstado = mia.estado;
        }
      } catch (err) {
        // si falla esta consulta extra, no pasa nada -- se muestra el formulario normal
      }
    }

    renderPartidos(datos, miQuiniela, miEstado);
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
      "</tr>"
    );
  }).join("");

  cont.innerHTML =
    '<div class="tarjeta tabla-scroll">' +
    '<table class="tabla-general">' +
    "<thead><tr><th></th><th>Nombre</th><th>Jornada " + datos.jornada + "</th></tr></thead>" +
    "<tbody>" + (filas || '<tr><td colspan="3" class="centro">Todavía nadie se ha registrado.</td></tr>') + "</tbody>" +
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
    let jornada = jornadaParam;
    if (!jornada) {
      const activa = await apiGet("activa");
      if (!activa.ok) throw new Error(activa.error || "No se pudo leer la jornada activa.");
      jornada = activa.jornada;
    }
    estadoQuinielas.jornada = jornada;

    const datos = await apiGet("partidos", { jornada: jornada });
    if (!datos.ok) {
      cont.innerHTML = navJornadaQuinielasHtml(jornada) + '<div class="aviso info">' + escaparHtml(datos.error) + "</div>";
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

    const quinielas = await apiGet("quinielas", { jornada: datos.jornada });
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

  const notaResultados = datos.resultadosCompletos
    ? '<p class="nota-control">Ya están los 9 resultados reales de esta jornada, así que de cualquier forma ya no se aceptan capturas nuevas, aunque dejes marcada la primera casilla.</p>'
    : "";

  cont.innerHTML =
    '<div class="tarjeta">' +
    navJornadaAdminHtml(datos.jornada) +
    '<div class="aviso info">Deja un partido en blanco si todavía no termina.</div>' +
    '<div id="lista-resultados">' + filas + "</div>" +
    '<div class="seccion-admin">' +
    '<h3 class="titulo-seccion-admin">Participantes — Jornada ' + datos.jornada + "</h3>" +
    '<p class="nota-control">Solo cuentan en la Tabla general y se ven en la pestaña Quinielas los que marques como "Aprobada". Aprueba a quien ya pagó o quieres que participe; rechaza al resto (aunque tengan el link).</p>' +
    '<div id="lista-participantes-admin"><p class="centro">Cargando participantes…</p></div>' +
    '<div id="mensaje-participantes-admin"></div>' +
    "</div>" +
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
  cargarParticipantesAdmin(datos.jornada);
}

// Lista de quién se registró en esta jornada, con un selector de estado
// (Pendiente / Aprobada / Rechazada) por persona. Cada cambio se guarda de
// inmediato -- no hace falta darle al botón "Guardar" de hasta abajo para
// esto (ese es solo para los resultados y las dos casillas de arriba).
async function cargarParticipantesAdmin(jornada) {
  const cont = document.getElementById("lista-participantes-admin");
  if (!cont) return;
  try {
    const datos = await apiGet("participantesJornada", { jornada: jornada });
    if (!datos.ok) {
      cont.innerHTML = '<p class="centro">No se pudo cargar la lista de participantes.</p>';
      return;
    }
    renderParticipantesAdmin(datos.participantes, jornada);
  } catch (err) {
    cont.innerHTML = '<p class="centro">Sin conexión con el Sheet ahorita.</p>';
  }
}

function renderParticipantesAdmin(participantes, jornada) {
  const cont = document.getElementById("lista-participantes-admin");
  if (!participantes.length) {
    cont.innerHTML = '<p class="centro">Nadie se ha registrado todavía esta jornada.</p>';
    return;
  }

  const etiquetas = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada" };
  cont.innerHTML = participantes.map(function (p) {
    return (
      '<div class="participante-admin estado-' + p.estado + '" data-nombre="' + escaparHtml(p.nombre) + '">' +
      '<span class="pa-nombre">' + escaparHtml(p.nombre) + "</span>" +
      '<select class="pa-estado">' +
      ESTADOS_APROBACION_FRONT.map(function (e) {
        return '<option value="' + e + '"' + (e === p.estado ? " selected" : "") + ">" + etiquetas[e] + "</option>";
      }).join("") +
      "</select>" +
      "</div>"
    );
  }).join("");

  cont.querySelectorAll(".pa-estado").forEach(function (select) {
    select.addEventListener("change", function () {
      const fila = select.closest(".participante-admin");
      const nombre = fila.dataset.nombre;
      const estado = select.value;
      const msg = document.getElementById("mensaje-participantes-admin");
      select.disabled = true;
      apiPost({
        action: "actualizarAprobacion",
        pin: localStorage.getItem("quiniela_admin_pin") || "",
        jornada: jornada,
        nombre: nombre,
        estado: estado,
      }).then(function (resp) {
        if (resp.ok) {
          fila.className = "participante-admin estado-" + estado;
          msg.innerHTML = "";
        } else {
          msg.innerHTML = '<div class="aviso error">' + escaparHtml(resp.error || "No se pudo actualizar.") + "</div>";
        }
      }).catch(function () {
        msg.innerHTML = '<div class="aviso error">No se pudo guardar (revisa tu conexión) e intenta de nuevo.</div>';
      }).finally(function () {
        select.disabled = false;
      });
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
      pin: localStorage.getItem("quiniela_admin_pin") || "",
      jornada: estadoAdmin.jornada,
      resultados: resultados,
      capturasAbiertas: capturasAbiertas,
      quinielasVisibles: quinielasVisibles,
    });
    if (resp.ok) {
      const avisoCierre = !resp.capturasAbiertas ? " Ya no se aceptan capturas para esta jornada." : "";
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
