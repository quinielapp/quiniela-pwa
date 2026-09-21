# Quiniela Liga MX — la app instalable (PWA)

Esto es una capa nueva, opcional, sobre lo que ya tienes. Tu Google Sheet sigue
siendo el cerebro de todo (participantes, partidos, puntos, pagos); esto solo
le agrega a cada participante una app bonita para su celular, en vez de tener
que abrir un Google Form. El Form sigue funcionando si alguien lo prefiere —
ambos caminos escriben en la misma hoja `RESPUESTAS`.

No cuesta nada. Todo lo de aquí (Apps Script y GitHub Pages) es gratis con una
cuenta normal.

Son dos partes que hay que conectar: (1) una "puerta" en tu Google Sheet que la
app pueda consultar, y (2) la app en sí, que necesita vivir en una dirección
web (no puede quedarse solo en tu computadora). Sigue los pasos en orden.

## Parte 1 — Abrir la puerta en tu Google Sheet (~5 minutos)

1. Abre tu Google Sheet (la misma donde ya está funcionando `Codigo_AppsScript.gs`).
2. Menú **Extensiones > Apps Script**.
3. En el panel izquierdo, junto a "Archivos", dale al **+** > **Script**.
   Ponle de nombre exactamente `WebApp` (sin .gs, Apps Script se lo agrega solo).
4. Borra el contenido de ejemplo que te ponga y pega **todo** el archivo `WebApp.gs`
   que te mandé.
4.1. Busca, cerca del inicio del archivo, la línea:
   ```
   const ADMIN_PIN = "CAMBIA_ESTE_PIN";
   ```
   Cámbiala por un PIN que solo tú conozcas (puede ser el que quieras). Es lo
   que te va a pedir la app para dejarte capturar el resultado real de los
   partidos desde tu celular — ver la sección "Capturar resultados desde tu
   celular (solo para ti)" más abajo. Este valor se queda solo en el Sheet,
   nunca se le manda a nadie más.
5. Guarda (ícono de disco, o Ctrl/Cmd+S).
6. Arriba a la derecha, botón azul **Implementar > Nueva implementación**.
7. Junto a "Seleccionar tipo", dale al engranaje ⚙️ y elige **Aplicación web**.
8. Dos campos importantes:
   - **Ejecutar como:** Yo (tu cuenta de Google).
   - **Quién tiene acceso:** Cualquier usuario.
9. Dale **Implementar**. Es posible que te vuelva a pedir autorizar permisos —
   es tu propio script, dale **Permitir** (si sale "app no verificada":
   Configuración avanzada > Ir a Quiniela [no seguro] > Permitir. Es normal en
   scripts personales, ya te pasó lo mismo con el primer script).
10. Te va a dar una URL que termina en `/exec`. **Cópiala completa** — es la
    que conecta la app con tu Sheet. Guárdala, la usas en el paso 2.4 de abajo.

Cada vez que cambies algo en `WebApp.gs` en el futuro, tienes que volver a
**Implementar > Gestionar implementaciones** > ícono de lápiz > en "Versión"
elige **Nueva versión** > Implementar, para que el cambio se refleje en esa
misma URL. Si solo haces "Guardar" sin esto, la URL sigue usando el código viejo.

## Parte 2 — Publicar la app en una dirección web (~10 minutos, una sola vez)

Una PWA tiene que vivir en una dirección `https://` para poder instalarse en
el celular — no sirve con abrir el archivo directamente desde tu compu. Vamos
a usar **GitHub Pages**, que es gratis y no pide tarjeta.

1. Ve a [github.com](https://github.com) y crea una cuenta gratis si no tienes
   (con cualquier correo).
2. Ya adentro, botón verde **New** (o el **+** de arriba a la derecha > New repository).
3. Ponle de nombre `quiniela-pwa` (puede ser otro nombre, no importa). Déjalo
   en **Public**. No marques ninguna otra casilla. Dale **Create repository**.
4. En la página del repo recién creado, busca el link que dice
   **"uploading an existing file"** (o el botón **Add file > Upload files**).
5. Arrastra ahí estos archivos (todos los que están en la carpeta que te mandé,
   menos `WebApp.gs` y este mismo instructivo — esos no van aquí):
   - `index.html`
   - `styles.css`
   - `app.js`
   - `sw.js`
   - `manifest.json`
   - `icon-192.png`
   - `icon-512.png`
6. Antes de subirlos, abre **`app.js`** en tu computadora con el Bloc de notas
   (o cualquier editor de texto) y busca la línea que dice:
   ```
   const WEBAPP_URL = "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT";
   ```
   Reemplaza el texto entre comillas por la URL que copiaste en el paso 1.10
   (la que termina en `/exec`). Guarda el archivo y súbelo así ya editado.
7. Abajo del todo dale **Commit changes** (déjalo con las opciones que vienen
   por default).
8. Ve a la pestaña **Settings** del repositorio > en el menú de la izquierda,
   **Pages**. En "Branch" elige `main` y la carpeta `/ (root)`, dale **Save**.
9. Espera uno o dos minutos y recarga esa misma página de Settings > Pages.
   Te va a mostrar tu dirección, algo como:
   `https://tu-usuario.github.io/quiniela-pwa/`
   Esa es la liga que compartes con el grupo.

**Importante para actualizaciones futuras:** cuando te mande una versión nueva
de la app, siempre incluye TODOS los archivos del zip al subirlos a GitHub
(selecciónalos todos juntos y arrástralos de una vez), aunque te diga que solo
cambiaron uno o dos — así nunca corres el riesgo de que quede una mezcla de
archivo viejo con archivo nuevo, que es lo que causa que algo dejé de
funcionar sin razón aparente.

## Instalarla en el celular

- **Android (Chrome):** abre la liga, te va a aparecer un aviso de
  "Instalar app" o "Agregar a pantalla de inicio" — dale que sí. Si no
  aparece solo, toca los tres puntos de arriba > "Instalar app".
- **iPhone (Safari, no Chrome):** abre la liga en Safari, toca el ícono de
  compartir (el cuadrito con la flecha hacia arriba) > **"Agregar a
  pantalla de inicio"**.

Después de instalarla les va a aparecer el ícono del balón en su pantalla de
inicio, y abre en su propia ventana sin la barra del navegador.

Si después de subir una actualización algo se ve raro o a medias, casi
siempre es que quedó guardada en el celular una copia vieja: en iPhone ve a
Ajustes > Safari > Avanzado > Datos de sitios web, busca tu sitio de GitHub y
bórralo, luego vuelve a abrir la liga y a "Agregar a pantalla de inicio". En
Android normalmente basta con cerrar la app y volver a abrirla.

## Cómo se usa

- Pestaña **Capturar**: cada quien escribe su nombre (se guarda solo para la
  próxima vez que abran la app en ese mismo celular) y pone el marcador de
  cada partido en las casillas. En cuanto la manda, queda fija para esa
  jornada: si abre la app de nuevo, ya no le sale el formulario vacío — le
  aparece lo que registró, de solo lectura, con un aviso de "Ya enviaste tu
  quiniela para esta jornada". Así, si alguien te pregunta por WhatsApp "¿qué
  le puse a tal partido?", ya no tienes que contestarle tú: lo puede ver solo
  con abrir la app. Esto es a propósito — evita que alguien cambie su
  marcador después de ver resultados parciales o lo que pusieron los demás.
  Si alguien de veras se equivocó, solo tú puedes corregirlo entrando directo
  al Sheet (columnas F:W de la fila de esa persona en `RESPUESTAS`). Debajo
  del formulario se ve cuántos van registrados esa jornada.
- Pestaña **Tabla general**: los puntos de la jornada en curso (no el
  acumulado de toda la temporada — cada jornada tiene su propio cobro y su
  propia bolsa), con tu fila resaltada. El acumulado de toda la temporada
  sigue disponible en la pestaña `TABLA_GENERAL` de tu Sheet.
- Cuando ya capturaste los resultados reales en `PARTIDOS` (columnas
  GolesLocal/GolesVisita) de esa jornada, la app deja de aceptar envíos para
  esa jornada y en vez del formulario muestra un aviso de que ya cerró — igual
  que pasa hoy si alguien intenta contestar el Form tarde.

## Agregar los escudos de los equipos (opcional)

La app ya está lista para mostrar el escudo de cada equipo arriba de su
nombre en la pestaña Capturar. Si no subes ninguna imagen, simplemente no
sale escudo y todo lo demás funciona igual — no es necesario para que la app
sirva.

La app busca cada logo en `logos/`, con el archivo nombrado EXACTAMENTE igual
al nombre del equipo tal como está escrito en la hoja `PARTIDOS` (mayúsculas y
espacios incluidos), más `.png`. Por ejemplo: `TIGRES.png`, `CRUZ AZUL.png`,
`SAN LUIS.png`. No hay que renombrar nada ni preocuparse por acentos o
minúsculas — solo que el nombre del archivo coincida con el del equipo.

**Cómo crear la carpeta `logos` y subir los archivos (la parte que se presta
a confusión en GitHub):**

En la web de GitHub no se puede arrastrar una imagen directo sobre una
carpeta para "meterla adentro". Y el botón "Create new file" sirve para
crear archivos de texto, no para subir imágenes.

1. En la barra de direcciones del navegador, pega esta URL completa y dale
   Enter (ajusta "quinielapp/quiniela-pwa" si tu organización o el nombre del
   repo son distintos):

   ```
   https://github.com/quinielapp/quiniela-pwa/upload/main/logos
   ```

   Esto abre la pantalla normal de "subir archivos" de GitHub, pero ya le
   indica que todo lo que sueltes ahí va a ir dentro de una carpeta `logos`
   (que se crea sola, no hace falta crearla aparte).
2. Selecciona los archivos de los equipos y arrástralos todos juntos a esa
   página. GitHub los va a listar con su nombre tal cual (`TIGRES.png`,
   `CRUZ AZUL.png`, etc. — no hace falta tocar los nombres).
3. Baja hasta el final de la página y dale **Commit changes**.
4. No hace falta tocar ningún código ni volver a implementar nada de Apps
   Script para esto. Solo recarga la PWA en tu celular (puede que necesites
   el mismo paso de borrar datos del sitio en Safari que hiciste antes, para
   que no se quede con la versión vieja guardada).

Si algún nombre de archivo no coincide exactamente con el del equipo en
`PARTIDOS`, esa imagen simplemente no aparece — el partido se ve bien igual,
solo sin escudo, así que no hay riesgo de que rompa la app.

## Capturar resultados desde tu celular (solo para ti)

En la barra de arriba, junto a "Capturar" y "Tabla general", hay un botón
**🔒 Admin**. Lo ven todos los participantes, pero no les sirve de nada sin
tu PIN — solo tú puedes usarlo de verdad. Sirve para que captures el
marcador real de los partidos directo desde tu celular, sin tener que
entrar a la computadora ni al Sheet. Escribe exactamente en las mismas
columnas de `PARTIDOS` (GolesLocal/GolesVisita) que llenarías tú a mano.

**Cómo activarlo (una sola vez por celular):**

1. Dale clic/toque al botón **🔒 Admin**.
2. Te va a pedir un PIN — escribe el mismo que pusiste en `ADMIN_PIN` dentro
   de `WebApp.gs` (paso 4.1 de la Parte 1).
3. Listo, entras directo a la pantalla de captura de resultados. Ese PIN se
   queda guardado en ese celular — la próxima vez que le des clic a
   **🔒 Admin** entras directo, sin que te lo vuelva a pedir.

**Cómo usarlo:**

- Verás los 9 partidos de la jornada en curso (puedes moverte a otra
  jornada con las flechitas, por si necesitas corregir una anterior).
- Escribe el marcador real en las casillas de cada partido conforme vayan
  terminando — puedes ir guardando poco a poco, no hace falta esperar a que
  se jueguen los 9. Deja en blanco los que todavía no acaban.
- Dale **Guardar resultados**. En cuanto completes los 9 partidos de esa
  jornada, se cierra sola para todos los participantes (ya no se aceptan más
  quinielas), igual que si lo hubieras capturado desde la computadora.

Si alguien sin el PIN le da clic a **🔒 Admin** y escribe cualquier cosa, va
a poder ver la pantalla de captura, pero en cuanto le dé "Guardar
resultados" el Sheet va a rechazarlo por PIN incorrecto y no se guarda nada
— nunca corre riesgo tu información. Si tú mismo te equivocas de PIN, te
avisa igual y solo tienes que darle clic a **🔒 Admin** otra vez para
escribirlo bien. Si alguna vez cambias el PIN en `WebApp.gs`, en tu celular
tendrás que volver a escribir el nuevo la próxima vez que te lo pida.

## Preguntas frecuentes

**¿Sigo pudiendo usar el Google Form?** Sí, no lo quité. Ambos caminos
escriben en la misma hoja `RESPUESTAS`, así que puedes dejar que cada quien
use el que prefiera.

**¿Hay login real (que no puedan contestar por alguien más)?** No en esta
primera versión — igual que el Form actual con nombre libre, la app confía en
que cada quien escriba su propio nombre. Si más adelante quieres identidad
real por cuenta de Google, eso ya implicaría el camino más grande del que
hablamos (reconstrucción con Firebase), no esta versión.

**¿Reciben notificaciones automáticas de "ya se abrió la jornada"?** No en
esta versión — para eso les sigues avisando por WhatsApp como ahora.

**¿Qué pasa si alguien no tiene internet en el momento?** La app abre igual
(el diseño y los botones cargan desde lo que quedó guardado en el celular),
pero para ver los partidos actuales, mandar su marcador o ver la tabla sí
necesita conexión en ese momento — esos datos siempre se piden en vivo a tu
Sheet para que nunca estén desactualizados.

**¿Puedo seguir editando el Sheet a mano como hasta ahora?** Sí, completamente
igual que hoy — la app solo lee y escribe en las mismas hojas y columnas que
ya usa el Form.
