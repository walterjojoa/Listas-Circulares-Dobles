/* =====================================================================
   UNO Circular — frontend
   Dibuja la lista circular doble que devuelve el backend (Flask) y
   anima los cambios: inserciones, eliminaciones, reversa, robos, etc.
   ===================================================================== */

const $ = (s, el = document) => el.querySelector(s);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const mod = (a, n) => ((a % n) + n) % n;

const COLOR_HEX = { rojo: "#ff4757", amarillo: "#ffc312", verde: "#2ed573", azul: "#1e90ff" };
const SIMBOLO = { salta: "⊘", reversa: "⇄", comodin: "★" };
const NOMBRES_DEFECTO = ["Ana", "Luis", "Sofía", "Mateo"];
const SIN_TOAST = new Set(["jugada", "robo"]);

// Geometría de la mesa (unidades del viewBox 1000x1000)
const C = 500;
const R = 360;
const NODO_R = 55;
const SEPARACION = 26;

let estado = null;
let ocupado = false;
let autoActivo = false;
let autoTimer = null;

const mesa = $("#mesa");
const capaNodos = $("#nodos");
const gEnlaces = $("#g-enlaces");

/* ---------------------------------------------------------------------
   API
   --------------------------------------------------------------------- */
async function api(url, metodo = "GET", cuerpo) {
  const r = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json();
  if (!r.ok) throw new Error(datos.error || "Error inesperado");
  return datos;
}

async function accion(url, cuerpo, opciones = {}, metodo = "POST") {
  if (ocupado) return false;
  ocupado = true;
  actualizarBotones();
  try {
    const nuevo = await api(url, metodo, cuerpo);
    await aplicarEstado(nuevo, opciones);
    return true;
  } catch (e) {
    toast(e.message, "error");
    return false;
  } finally {
    ocupado = false;
    actualizarBotones();
  }
}

async function aplicarEstado(nuevo, opciones = {}) {
  const previo = estado;
  const eventos = nuevo.eventos || [];
  eventos.filter((ev) => !SIN_TOAST.has(ev.tipo)).forEach((ev) => toast(ev.texto, ev.tipo));
  // Las animaciones de cartas usan las posiciones actuales de los nodos
  if (previo) await animarEventos(eventos, opciones);
  estado = nuevo;
  render(previo);
  if (eventos.some((ev) => ev.tipo === "reversa")) pulsoAnillo();
  if (nuevo.terminado && !(previo && previo.terminado)) {
    detenerAuto();
    setTimeout(mostrarFin, 700);
  }
}

/* ---------------------------------------------------------------------
   Render general
   --------------------------------------------------------------------- */
function render(previo) {
  sincronizarNodos();
  pintarCentro(previo);
  pintarTurno();
  pintarMano(previo);
  pintarEstructura();
  pintarJugadores();
  pintarBitacora(previo);
  actualizarBotones();
}

function porId(id) {
  return estado.jugadores.find((j) => j.id === id);
}

function iniciales(nombre) {
  const partes = nombre.trim().split(/\s+/);
  return (partes.length > 1 ? partes[0][0] + partes[1][0] : nombre.slice(0, 2)).toUpperCase();
}

function esc(texto) {
  const d = document.createElement("div");
  d.textContent = texto;
  return d.innerHTML;
}

/* ---------------------------------------------------------------------
   Nodos y enlaces animados
   --------------------------------------------------------------------- */
const vis = new Map(); // id -> { el, a, s, a0, a1, s0, s1, quitando }
let tween = null;
let rafId = null;

const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rebote = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function polar(anguloGrados, radio) {
  const r = (anguloGrados * Math.PI) / 180;
  return { x: C + radio * Math.cos(r), y: C + radio * Math.sin(r) };
}

function sincronizarNodos() {
  const jugadores = estado.jugadores;
  const n = jugadores.length;
  const vivos = new Set();

  jugadores.forEach((j, i) => {
    vivos.add(j.id);
    const objetivo = -90 + (i * 360) / n;
    let v = vis.get(j.id);
    if (!v) {
      const el = document.createElement("div");
      el.className = "nodo";
      capaNodos.appendChild(el);
      v = { el, a: objetivo, s: 0 };
      vis.set(j.id, v);
    }
    v.a0 = v.a;
    v.s0 = v.s;
    v.a1 = v.a + (mod(objetivo - v.a + 180, 360) - 180); // camino más corto
    v.s1 = 1;
    v.quitando = false;
    v.el.classList.remove("saliendo");
    pintarNodo(v.el, j);
  });

  for (const [id, v] of vis) {
    if (vivos.has(id)) continue;
    v.a0 = v.a1 = v.a;
    v.s0 = v.s;
    v.s1 = 0;
    v.quitando = true;
    v.el.classList.add("saliendo");
  }

  tween = { t0: performance.now(), dur: 800 };
  if (!rafId) rafId = requestAnimationFrame(cuadro);
}

function cuadro(ahora) {
  const t = Math.min(1, (ahora - tween.t0) / tween.dur);
  for (const [id, v] of vis) {
    v.a = v.a0 + (v.a1 - v.a0) * suave(t);
    v.s = v.s0 + (v.s1 - v.s0) * (v.s1 > v.s0 ? rebote(t) : suave(t));
    posicionar(v);
    if (t === 1 && v.quitando) {
      v.el.remove();
      vis.delete(id);
    }
  }
  dibujarEnlaces();
  rafId = t < 1 ? requestAnimationFrame(cuadro) : null;
}

function posicionar(v) {
  const p = polar(v.a, R);
  v.el.style.left = p.x / 10 + "%";
  v.el.style.top = p.y / 10 + "%";
  v.el.style.transform = `translate(-50%, -50%) scale(${Math.max(0, v.s)})`;
  v.el.style.opacity = Math.min(1, Math.max(0, v.s));
}

function pintarNodo(el, j) {
  const enJuego = !estado.terminado;
  el.style.setProperty("--c", j.color);
  el.dataset.id = j.id;
  el.classList.toggle("actual", enJuego && j.id === estado.actual);
  el.classList.toggle("proximo", enJuego && j.id === estado.proximo && j.id !== estado.actual);
  const clave = `${j.nombre}|${j.cartas}|${j.es_cabeza}`;
  if (el.dataset.clave === clave) return; // evita reiniciar animaciones CSS
  el.dataset.clave = clave;
  el.title = `${j.nombre} · ${j.cartas} cartas`;
  el.innerHTML = `
    ${j.es_cabeza ? '<span class="tag-cabeza">cabeza</span>' : ""}
    ${j.cartas === 1 ? '<span class="badge-uno">UNO!</span>' : ""}
    <div class="avatar">${esc(iniciales(j.nombre))}</div>
    <div class="nodo-info">
      <b>${esc(j.nombre)}</b>
      <span class="mini-cartas">🂠 ${j.cartas}</span>
    </div>`;
}

function arco(desde, hasta, radio, esSig, activo) {
  let tramo = esSig ? mod(hasta - desde, 360) : mod(desde - hasta, 360);
  if (tramo < 0.001) tramo = 360;
  const recorte = ((NODO_R + 18) / radio) * (180 / Math.PI);
  const util = tramo - 2 * recorte;
  if (util < 3) return "";
  const ini = polar(desde + (esSig ? recorte : -recorte), radio);
  const fin = polar(hasta + (esSig ? -recorte : recorte), radio);
  const grande = util > 180 ? 1 : 0;
  const barrido = esSig ? 1 : 0;
  const tipo = esSig ? "sig" : "ant";
  return `<path class="enlace ${tipo}${activo ? " activo" : ""}"
    d="M${ini.x.toFixed(1)} ${ini.y.toFixed(1)} A${radio} ${radio} 0 ${grande} ${barrido} ${fin.x.toFixed(1)} ${fin.y.toFixed(1)}"
    marker-end="url(#flecha-${tipo}${activo ? "-on" : ""})"/>`;
}

function dibujarEnlaces() {
  if (!estado || !estado.jugadores) return;
  const js = estado.jugadores;
  const n = js.length;
  let html = "";

  if (n === 1) {
    const v = vis.get(js[0].id);
    if (v) {
      const p = polar(v.a, R + 95);
      html = `<circle cx="${p.x}" cy="${p.y}" r="34" class="enlace sig"/>`;
    }
    gEnlaces.innerHTML = html;
    return;
  }

  const jugando = !estado.terminado;
  js.forEach((j, i) => {
    const sig = js[(i + 1) % n];
    const a = vis.get(j.id), b = vis.get(sig.id);
    if (!a || !b) return;
    // j.siguiente -> sig (exterior, sentido horario)
    html += arco(a.a, b.a, R + SEPARACION, true, jugando && estado.sentido === 1 && j.id === estado.actual);
    // sig.anterior -> j (interior, sentido antihorario)
    html += arco(b.a, a.a, R - SEPARACION, false, jugando && estado.sentido === -1 && sig.id === estado.actual);
  });
  gEnlaces.innerHTML = html;
}

/* ---------------------------------------------------------------------
   Cartas
   --------------------------------------------------------------------- */
function interiorCarta(c) {
  const v = SIMBOLO[c.valor] ?? c.valor;
  const largo = v.length > 1 ? " largo" : "";
  return `<span class="esq sup">${v}</span><span class="ovalo"><i class="${largo}">${v}</i></span><span class="esq inf">${v}</span>`;
}

function claseCarta(c) {
  return `c-${c.color || "negro"}`;
}

function htmlDorso() {
  return '<span class="ovalo"><i>UNO</i></span>';
}

function rectNodo(id) {
  const v = vis.get(id);
  return v ? v.el.getBoundingClientRect() : mesa.getBoundingClientRect();
}

function volar(desde, hasta, html, clase, { demora = 0, escalaFinal = 1, giro = 0 } = {}) {
  return new Promise((resolver) => {
    const destino = $("#descarte").getBoundingClientRect();
    const w = destino.width;
    const h = destino.height;
    const el = document.createElement("div");
    el.className = `carta volando ${clase}`;
    el.style.setProperty("--w", w + "px");
    el.innerHTML = html;
    const x0 = desde.left + desde.width / 2 - w / 2;
    const y0 = desde.top + desde.height / 2 - h / 2;
    const x1 = hasta.left + hasta.width / 2 - w / 2;
    const y1 = hasta.top + hasta.height / 2 - h / 2;
    Object.assign(el.style, { left: x0 + "px", top: y0 + "px", width: w + "px" });
    document.body.appendChild(el);
    const anim = el.animate(
      [
        { transform: "translate(0,0) rotate(-20deg) scale(.6)", opacity: 0.4 },
        { opacity: 1, offset: 0.2 },
        { transform: `translate(${x1 - x0}px, ${y1 - y0}px) rotate(${giro}deg) scale(${escalaFinal})`, opacity: 1 },
      ],
      { duration: 520, delay: demora, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
    );
    anim.onfinish = () => {
      el.remove();
      resolver();
    };
  });
}

async function animarEventos(eventos, opciones) {
  for (const ev of eventos) {
    if (ev.tipo === "jugada") {
      const desde = opciones.rectCarta || rectNodo(ev.jugador);
      await volar(desde, $("#descarte").getBoundingClientRect(), interiorCarta(ev.carta), claseCarta(ev.carta), {
        giro: Math.random() * 30 - 15,
      });
    } else if (ev.tipo === "robo" || ev.tipo === "castigo") {
      const destino = rectNodo(ev.jugador);
      const vuelos = [];
      for (let k = 0; k < ev.cantidad; k++) {
        vuelos.push(volar($("#mazo").getBoundingClientRect(), destino, htmlDorso(), "dorso", { demora: k * 110, escalaFinal: 0.45 }));
      }
      await Promise.all(vuelos);
    }
  }
}

/* ---------------------------------------------------------------------
   Centro de la mesa
   --------------------------------------------------------------------- */
function pintarCentro(previo) {
  const centro = $("#centro");
  const hex = COLOR_HEX[estado.color_activo] || "#fff";
  centro.style.setProperty("--activo", hex);

  const anillo = $("#anillo");
  anillo.classList.toggle("antihorario", estado.sentido === -1);

  const sup = estado.carta_superior;
  const clave = JSON.stringify(sup) + estado.cartas_descarte;
  const descarte = $("#descarte");
  if (!previo || descarte.dataset.clave !== clave) {
    const viejo = descarte.querySelector(".carta:not(.anterior)");
    descarte.innerHTML = "";
    if (viejo && previo) {
      viejo.classList.add("anterior");
      descarte.appendChild(viejo);
    }
    const carta = document.createElement("div");
    carta.className = `carta ${claseCarta(sup)}`;
    carta.innerHTML = interiorCarta(sup);
    if (sup.color === null) carta.style.boxShadow = `0 0 0 4px ${hex}, 0 0 24px ${hex}`;
    descarte.appendChild(carta);
    descarte.dataset.clave = clave;
  }

  $("#mazo-n").textContent = estado.cartas_mazo;
  const sentido = estado.sentido === 1 ? "↻ horario · siguiente" : "↺ antihorario · anterior";
  $("#sentido-lbl").textContent = sentido;
}

function pulsoAnillo() {
  const anillo = $("#anillo");
  anillo.classList.remove("cambio");
  void anillo.offsetWidth;
  anillo.classList.add("cambio");
}

/* ---------------------------------------------------------------------
   Turno y mano
   --------------------------------------------------------------------- */
function pintarTurno() {
  const actual = porId(estado.actual);
  const proximo = estado.proximo ? porId(estado.proximo) : null;
  const avatar = $("#turno-avatar");
  if (estado.terminado) {
    const g = estado.ganadores[0];
    $("#turno-nombre").textContent = `🏆 Ganó ${g.nombre}`;
    avatar.style.setProperty("--c", g.color);
    avatar.textContent = iniciales(g.nombre);
  } else if (actual) {
    $("#turno-nombre").textContent = actual.nombre;
    avatar.style.setProperty("--c", actual.color);
    avatar.textContent = iniciales(actual.nombre);
  }
  const color = estado.color_activo;
  $("#turno-info").innerHTML = `
    <span class="chip"><span class="punto" style="--cc:${COLOR_HEX[color]}"></span>Color: ${color}</span>
    <span class="chip">${estado.sentido === 1 ? "↻ horario" : "↺ antihorario"}</span>
    ${proximo && !estado.terminado ? `<span class="chip">Próximo: <b>${esc(proximo.nombre)}</b></span>` : ""}`;
}

function pintarMano(previo) {
  const contenedor = $("#mano");
  const mismoJugador = previo && previo.actual === estado.actual && !previo.terminado;
  const anterior = mismoJugador ? previo.mano.length : 0;
  contenedor.innerHTML = "";

  if (estado.terminado) {
    contenedor.innerHTML = '<p class="mano-vacia">La partida terminó. ¡Inicia una nueva para seguir jugando!</p>';
    return;
  }

  estado.mano.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = `carta ${claseCarta(c)} ${c.jugable ? "jugable" : "bloqueada"}${c.robada ? " robada" : ""}`;
    b.style.setProperty("--i", mismoJugador ? Math.max(0, i - anterior) : i);
    if (mismoJugador && i < anterior) b.style.animation = "none";
    b.innerHTML = interiorCarta(c);
    b.title = c.jugable ? "Jugar esta carta" : "No se puede jugar ahora";
    b.addEventListener("click", () => clicCarta(i, c, b));
    contenedor.appendChild(b);
  });
}

async function clicCarta(indice, carta, boton) {
  if (ocupado || estado.terminado) return;
  if (!carta.jugable) {
    boton.style.animation = "";
    boton.classList.remove("sacudir");
    void boton.offsetWidth;
    boton.classList.add("sacudir");
    const motivo = estado.ya_robo
      ? "Después de robar solo puedes jugar la carta nueva."
      : `Necesitas color ${estado.color_activo} o el mismo valor que la carta de arriba.`;
    toast(motivo, "error");
    return;
  }
  let color = null;
  if (carta.color === null) {
    color = await elegirColor();
    if (!color) return;
  }
  const rect = boton.getBoundingClientRect();
  boton.style.visibility = "hidden";
  const ok = await accion("/api/jugar", { indice, color }, { rectCarta: rect });
  if (!ok) boton.style.visibility = "";
}

function actualizarBotones() {
  const hay = !!estado && estado.iniciado;
  const fin = !hay || estado.terminado;
  $("#btn-robar").disabled = ocupado || fin || estado.ya_robo;
  $("#mazo").disabled = ocupado || fin || estado.ya_robo;
  $("#btn-pasar").disabled = ocupado || fin || !estado.ya_robo;
  $("#btn-jugada-auto").disabled = ocupado || fin;
  $("#btn-recorrer").disabled = !hay || estado.jugadores.length === 0;
  $("#btn-auto").disabled = fin;
}

/* ---------------------------------------------------------------------
   Panel lateral
   --------------------------------------------------------------------- */
function pintarEstructura() {
  const js = estado.jugadores;
  const enJuego = !estado.terminado;
  const cadena = js
    .map((j) => `<span class="eslabon${enJuego && j.id === estado.actual ? " actual" : ""}" style="--c:${j.color}">${esc(j.nombre)}</span>`)
    .join('<span class="flecha-doble">⇄</span>');
  $("#cadena").innerHTML = js.length
    ? `${cadena}<span class="flecha-doble">⇄</span><span class="vuelta">↺ ${esc(js[0].nombre)}</span>`
    : "<em>Lista vacía</em>";

  $("#tabla-nodos").innerHTML = js
    .map(
      (j, i) => `<tr class="${enJuego && j.id === estado.actual ? "actual" : ""}">
        <td>${i}</td>
        <td><b>${esc(j.nombre)}</b>${j.es_cabeza ? '<span class="tag-mini">cabeza</span>' : ""}</td>
        <td class="p-ant">${esc(porId(j.anterior).nombre)}</td>
        <td class="p-sig">${esc(porId(j.siguiente).nombre)}</td>
      </tr>`
    )
    .join("");
}

function pintarJugadores() {
  const enJuego = !estado.terminado;
  $("#lista-jugadores").innerHTML = estado.jugadores
    .map(
      (j) => `<li class="${enJuego && j.id === estado.actual ? "actual" : ""}">
        <span class="lj-avatar" style="--c:${j.color}">${esc(iniciales(j.nombre))}</span>
        <span class="lj-nombre">${esc(j.nombre)}</span>
        <span class="lj-cartas">🂠 ${j.cartas}</span>
        ${enJuego ? `<button class="lj-quitar" data-id="${j.id}" title="Eliminar nodo (abandona)">✕</button>` : ""}
      </li>`
    )
    .join("");
}

function pintarBitacora(previo) {
  const ultimo = previo && previo.bitacora && previo.bitacora.length ? previo.bitacora[0].n : 0;
  $("#bitacora").innerHTML = estado.bitacora
    .map((e) => `<li class="${e.tipo}${e.n > ultimo ? " nuevo" : ""}">${e.tipo === "lista" ? "🔗 " : "🎴 "}${esc(e.texto)}</li>`)
    .join("");
}

/* ---------------------------------------------------------------------
   Recorrido y búsqueda (resaltan nodo por nodo)
   --------------------------------------------------------------------- */
async function resaltarSecuencia(ids, ms = 380) {
  for (const id of ids) {
    const v = vis.get(id);
    if (!v) continue;
    v.el.classList.add("recorre");
    await espera(ms);
    v.el.classList.remove("recorre");
  }
}

async function recorrer() {
  if (!estado || !estado.jugadores.length) return;
  const inicio = estado.terminado ? estado.jugadores[0].id : estado.actual;
  const ids = [];
  let id = inicio;
  for (let k = 0; k <= estado.jugadores.length; k++) {
    ids.push(id);
    const j = porId(id);
    id = estado.sentido === 1 ? j.siguiente : j.anterior;
  }
  const puntero = estado.sentido === 1 ? "siguiente" : "anterior";
  toast(`Recorriendo con el puntero «${puntero}» desde ${porId(inicio).nombre}…`, "info");
  $("#btn-recorrer").disabled = true;
  await resaltarSecuencia(ids);
  $("#btn-recorrer").disabled = false;
  toast(`Volvimos a ${porId(inicio).nombre}: la lista no tiene final 🔁`, "info");
}

async function buscar(nombre) {
  if (!nombre.trim()) return;
  try {
    const r = await api(`/api/buscar?nombre=${encodeURIComponent(nombre)}`);
    await resaltarSecuencia(r.recorrido, 300);
    if (r.encontrado) {
      const v = vis.get(r.id);
      v.el.classList.add("encontrado");
      setTimeout(() => v.el.classList.remove("encontrado"), 1900);
      toast(`¡Encontrado en ${r.recorrido.length} paso(s) desde la cabeza!`, "entra");
    } else {
      toast(`No está: se recorrieron ${r.recorrido.length} nodos y se volvió a la cabeza.`, "error");
    }
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ---------------------------------------------------------------------
   Modo automático
   --------------------------------------------------------------------- */
function alternarAuto() {
  autoActivo ? detenerAuto() : iniciarAuto();
}

function iniciarAuto() {
  if (!estado || estado.terminado) return;
  autoActivo = true;
  $("#btn-auto").classList.add("on");
  $("#btn-auto").textContent = "⏸ Detener auto";
  cicloAuto();
}

function detenerAuto() {
  autoActivo = false;
  clearTimeout(autoTimer);
  $("#btn-auto").classList.remove("on");
  $("#btn-auto").textContent = "🤖 Modo auto";
}

async function cicloAuto() {
  if (!autoActivo) return;
  if (estado.terminado) return detenerAuto();
  await accion("/api/auto");
  if (autoActivo) autoTimer = setTimeout(cicloAuto, 950);
}

/* ---------------------------------------------------------------------
   Modales
   --------------------------------------------------------------------- */
const COLORES_SETUP = ["#ff4757", "#1e90ff", "#2ed573", "#ffa502", "#a55eea", "#ff6b81", "#00d2d3", "#eccc68", "#5352ed", "#ff7f50"];

function abrirSetup() {
  detenerAuto();
  const nombres = estado && estado.iniciado ? estado.jugadores.map((j) => j.nombre) : NOMBRES_DEFECTO;
  const caja = $("#setup-nombres");
  caja.innerHTML = "";
  (nombres.length >= 2 ? nombres : NOMBRES_DEFECTO).forEach((n) => agregarFilaSetup(n));
  $("#modal-setup").hidden = false;
  caja.querySelector("input")?.focus();
}

function agregarFilaSetup(nombre = "") {
  const caja = $("#setup-nombres");
  if (caja.children.length >= 10) return toast("Máximo 10 jugadores.", "error");
  const fila = document.createElement("div");
  fila.className = "setup-fila";
  fila.innerHTML = `
    <span class="lj-avatar"></span>
    <input maxlength="14" placeholder="Nombre">
    <button class="lj-quitar" title="Quitar">✕</button>`;
  fila.querySelector("input").value = nombre;
  fila.querySelector(".lj-quitar").onclick = () => {
    if (caja.children.length <= 2) return toast("Se necesitan al menos 2 jugadores.", "error");
    fila.remove();
    colorearSetup();
  };
  caja.appendChild(fila);
  colorearSetup();
  return fila;
}

function colorearSetup() {
  [...$("#setup-nombres").children].forEach((fila, i) => {
    const av = fila.querySelector(".lj-avatar");
    av.style.setProperty("--c", COLORES_SETUP[i % COLORES_SETUP.length]);
    av.textContent = i + 1;
  });
}

async function comenzar() {
  const nombres = [...$("#setup-nombres").querySelectorAll("input")].map((i) => i.value.trim()).filter(Boolean);
  try {
    const nuevo = await api("/api/nuevo", "POST", { jugadores: nombres });
    $("#modal-setup").hidden = true;
    $("#modal-fin").hidden = true;
    for (const v of vis.values()) v.el.remove();
    vis.clear();
    estado = null;
    await aplicarEstado(nuevo);
    toast(`¡A jugar! Empieza ${porId(estado.actual).nombre}.`, "entra");
  } catch (e) {
    toast(e.message, "error");
  }
}

let resolverColor = null;
function elegirColor() {
  $("#modal-color").hidden = false;
  return new Promise((r) => (resolverColor = r));
}
function cerrarColor(color) {
  $("#modal-color").hidden = true;
  if (resolverColor) resolverColor(color);
  resolverColor = null;
}

function mostrarFin() {
  const medallas = ["🥇", "🥈", "🥉"];
  $("#podio").innerHTML = estado.ganadores
    .map(
      (g, i) => `<li style="animation-delay:${i * 120}ms">
        <span class="medalla">${medallas[i] || i + 1 + "°"}</span>
        <span class="lj-avatar" style="--c:${g.color}">${esc(iniciales(g.nombre))}</span>
        ${esc(g.nombre)}
      </li>`
    )
    .join("");
  $("#modal-fin").hidden = false;
  confeti();
}

/* ---------------------------------------------------------------------
   Toasts y confeti
   --------------------------------------------------------------------- */
function toast(texto, tipo = "info") {
  const caja = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = texto;
  caja.appendChild(el);
  while (caja.children.length > 5) caja.firstChild.remove();
  setTimeout(() => {
    el.classList.add("salir");
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

function confeti() {
  const lienzo = $("#confeti");
  const ctx = lienzo.getContext("2d");
  lienzo.width = innerWidth;
  lienzo.height = innerHeight;
  const colores = ["#ff4757", "#ffc312", "#2ed573", "#1e90ff", "#ff5fd2", "#2ee6ff"];
  const piezas = Array.from({ length: 220 }, () => ({
    x: Math.random() * lienzo.width,
    y: -20 - Math.random() * lienzo.height * 0.5,
    vx: Math.random() * 4 - 2,
    vy: 2 + Math.random() * 4,
    r: Math.random() * Math.PI,
    vr: Math.random() * 0.3 - 0.15,
    w: 6 + Math.random() * 8,
    h: 4 + Math.random() * 6,
    c: colores[Math.floor(Math.random() * colores.length)],
  }));
  const fin = performance.now() + 4000;
  (function paso(ahora) {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    piezas.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (ahora < fin) requestAnimationFrame(paso);
    else ctx.clearRect(0, 0, lienzo.width, lienzo.height);
  })(performance.now());
}

/* ---------------------------------------------------------------------
   Eventos de la interfaz
   --------------------------------------------------------------------- */
$("#btn-nuevo").onclick = abrirSetup;
$("#btn-auto").onclick = alternarAuto;
$("#btn-recorrer").onclick = recorrer;
$("#btn-robar").onclick = () => accion("/api/robar");
$("#mazo").onclick = () => accion("/api/robar");
$("#btn-pasar").onclick = () => accion("/api/pasar");
$("#btn-jugada-auto").onclick = () => accion("/api/auto");

$("#setup-mas").onclick = () => agregarFilaSetup().querySelector("input").focus();
$("#setup-ok").onclick = comenzar;
$("#setup-nombres").addEventListener("keydown", (e) => {
  if (e.key === "Enter") comenzar();
});

document.querySelectorAll("#modal-color .col").forEach((b) => (b.onclick = () => cerrarColor(b.dataset.color)));
$("#color-cancelar").onclick = () => cerrarColor(null);

$("#fin-cerrar").onclick = () => ($("#modal-fin").hidden = true);
$("#fin-nuevo").onclick = () => {
  $("#modal-fin").hidden = true;
  abrirSetup();
};

$("#form-agregar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#in-agregar");
  if (await accion("/api/jugadores", { nombre: input.value })) input.value = "";
});

$("#form-buscar").addEventListener("submit", (e) => {
  e.preventDefault();
  buscar($("#in-buscar").value);
});

$("#lista-jugadores").addEventListener("click", (e) => {
  const b = e.target.closest(".lj-quitar");
  if (b) accion(`/api/jugadores/${b.dataset.id}`, null, {}, "DELETE");
});

addEventListener("resize", () => dibujarEnlaces());

/* ---------------------------------------------------------------------
   Inicio
   --------------------------------------------------------------------- */
(async function iniciar() {
  try {
    const datos = await api("/api/estado");
    if (datos.iniciado) await aplicarEstado(datos);
    else abrirSetup();
  } catch (e) {
    toast("No se pudo conectar con el servidor Flask.", "error");
  }
  actualizarBotones();
})();
