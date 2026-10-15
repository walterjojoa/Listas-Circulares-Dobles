/* =====================================================================
   UNO Circular — frontend
   Draws the circular doubly linked list returned by the backend (Flask)
   and animates its changes: insertions, removals, reverse, draws, etc.
   ===================================================================== */

const $ = (s, el = document) => el.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mod = (a, n) => ((a % n) + n) % n;

const COLOR_HEX = { red: "#ff4757", yellow: "#ffc312", green: "#2ed573", blue: "#1e90ff" };
const SYMBOL = { skip: "⊘", reverse: "⇄", wild: "★" };
const DEFAULT_NAMES = ["Ana", "Luis", "Sofia", "Mateo"];
const NO_TOAST = new Set(["play", "draw"]);

// Table geometry (units of the 1000x1000 viewBox)
const C = 500;
const R = 360;
const NODE_R = 55;
const GAP = 26;

let state = null;
let busy = false;
let autoOn = false;
let autoTimer = null;

const table = $("#table");
const nodeLayer = $("#nodes");
const gLinks = $("#g-links");

/* ---------------------------------------------------------------------
   API
   --------------------------------------------------------------------- */
async function api(url, method = "GET", body) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Unexpected error");
  return data;
}

async function action(url, body, options = {}, method = "POST") {
  if (busy) return false;
  busy = true;
  updateButtons();
  try {
    const next = await api(url, method, body);
    await applyState(next, options);
    return true;
  } catch (e) {
    toast(e.message, "error");
    return false;
  } finally {
    busy = false;
    updateButtons();
  }
}

async function applyState(next, options = {}) {
  const previous = state;
  const events = next.events || [];
  events.filter((ev) => !NO_TOAST.has(ev.type)).forEach((ev) => toast(ev.text, ev.type));
  // Card animations use the current positions of the nodes
  if (previous) await animateEvents(events, options);
  state = next;
  render(previous);
  if (events.some((ev) => ev.type === "reverse")) pulseRing();
  if (next.finished && !(previous && previous.finished)) {
    stopAuto();
    setTimeout(showGameOver, 700);
  }
}

/* ---------------------------------------------------------------------
   Main render
   --------------------------------------------------------------------- */
function render(previous) {
  syncNodes();
  paintCenter(previous);
  paintTurn();
  paintHand(previous);
  paintStructure();
  paintPlayers();
  paintLog(previous);
  updateButtons();
}

function byId(id) {
  return state.players.find((p) => p.id === id);
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function esc(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

/* ---------------------------------------------------------------------
   Animated nodes and links
   --------------------------------------------------------------------- */
const vis = new Map(); // id -> { el, a, s, a0, a1, s0, s1, leaving }
let tween = null;
let rafId = null;

const smooth = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const overshoot = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function polar(angleDeg, radius) {
  const r = (angleDeg * Math.PI) / 180;
  return { x: C + radius * Math.cos(r), y: C + radius * Math.sin(r) };
}

function syncNodes() {
  const players = state.players;
  const n = players.length;
  const alive = new Set();

  players.forEach((p, i) => {
    alive.add(p.id);
    const target = -90 + (i * 360) / n;
    let v = vis.get(p.id);
    if (!v) {
      const el = document.createElement("div");
      el.className = "node";
      nodeLayer.appendChild(el);
      v = { el, a: target, s: 0 };
      vis.set(p.id, v);
    }
    v.a0 = v.a;
    v.s0 = v.s;
    v.a1 = v.a + (mod(target - v.a + 180, 360) - 180); // shortest path
    v.s1 = 1;
    v.leaving = false;
    v.el.classList.remove("leaving");
    paintNode(v.el, p);
  });

  for (const [id, v] of vis) {
    if (alive.has(id)) continue;
    v.a0 = v.a1 = v.a;
    v.s0 = v.s;
    v.s1 = 0;
    v.leaving = true;
    v.el.classList.add("leaving");
  }

  tween = { t0: performance.now(), dur: 800 };
  if (!rafId) rafId = requestAnimationFrame(frame);
}

function frame(now) {
  const t = Math.min(1, (now - tween.t0) / tween.dur);
  for (const [id, v] of vis) {
    v.a = v.a0 + (v.a1 - v.a0) * smooth(t);
    v.s = v.s0 + (v.s1 - v.s0) * (v.s1 > v.s0 ? overshoot(t) : smooth(t));
    place(v);
    if (t === 1 && v.leaving) {
      v.el.remove();
      vis.delete(id);
    }
  }
  drawLinks();
  rafId = t < 1 ? requestAnimationFrame(frame) : null;
}

function place(v) {
  const p = polar(v.a, R);
  v.el.style.left = p.x / 10 + "%";
  v.el.style.top = p.y / 10 + "%";
  v.el.style.transform = `translate(-50%, -50%) scale(${Math.max(0, v.s)})`;
  v.el.style.opacity = Math.min(1, Math.max(0, v.s));
}

function paintNode(el, p) {
  const playing = !state.finished;
  el.style.setProperty("--c", p.color);
  el.dataset.id = p.id;
  el.classList.toggle("current", playing && p.id === state.current);
  el.classList.toggle("upcoming", playing && p.id === state.upcoming && p.id !== state.current);
  const key = `${p.name}|${p.cards}|${p.is_head}`;
  if (el.dataset.key === key) return; // avoids restarting CSS animations
  el.dataset.key = key;
  el.title = `${p.name} · ${p.cards} cards`;
  el.innerHTML = `
    ${p.is_head ? '<span class="head-tag">head</span>' : ""}
    ${p.cards === 1 ? '<span class="badge-uno">UNO!</span>' : ""}
    <div class="avatar">${esc(initials(p.name))}</div>
    <div class="node-info">
      <b>${esc(p.name)}</b>
      <span class="mini-cards">🂠 ${p.cards}</span>
    </div>`;
}

function arc(from, to, radius, isNext, active) {
  let span = isNext ? mod(to - from, 360) : mod(from - to, 360);
  if (span < 0.001) span = 360;
  const trim = ((NODE_R + 18) / radius) * (180 / Math.PI);
  const usable = span - 2 * trim;
  if (usable < 3) return "";
  const start = polar(from + (isNext ? trim : -trim), radius);
  const end = polar(to + (isNext ? -trim : trim), radius);
  const large = usable > 180 ? 1 : 0;
  const sweep = isNext ? 1 : 0;
  const kind = isNext ? "next" : "prev";
  return `<path class="link ${kind}${active ? " active" : ""}"
    d="M${start.x.toFixed(1)} ${start.y.toFixed(1)} A${radius} ${radius} 0 ${large} ${sweep} ${end.x.toFixed(1)} ${end.y.toFixed(1)}"
    marker-end="url(#arrow-${kind}${active ? "-on" : ""})"/>`;
}

function drawLinks() {
  if (!state || !state.players) return;
  const ps = state.players;
  const n = ps.length;
  let html = "";

  if (n === 1) {
    const v = vis.get(ps[0].id);
    if (v) {
      const p = polar(v.a, R + 95);
      html = `<circle cx="${p.x}" cy="${p.y}" r="34" class="link next"/>`;
    }
    gLinks.innerHTML = html;
    return;
  }

  const playing = !state.finished;
  ps.forEach((p, i) => {
    const following = ps[(i + 1) % n];
    const a = vis.get(p.id), b = vis.get(following.id);
    if (!a || !b) return;
    // p.next -> following (outer ring, clockwise)
    html += arc(a.a, b.a, R + GAP, true, playing && state.direction === 1 && p.id === state.current);
    // following.prev -> p (inner ring, counterclockwise)
    html += arc(b.a, a.a, R - GAP, false, playing && state.direction === -1 && following.id === state.current);
  });
  gLinks.innerHTML = html;
}

/* ---------------------------------------------------------------------
   Cards
   --------------------------------------------------------------------- */
function cardInner(c) {
  const v = SYMBOL[c.value] ?? c.value;
  const long = v.length > 1 ? " long" : "";
  return `<span class="corner top">${v}</span><span class="oval"><i class="${long}">${v}</i></span><span class="corner bottom">${v}</span>`;
}

function cardClass(c) {
  return `c-${c.color || "black"}`;
}

function backHtml() {
  return '<span class="oval"><i>UNO</i></span>';
}

function nodeRect(id) {
  const v = vis.get(id);
  return v ? v.el.getBoundingClientRect() : table.getBoundingClientRect();
}

function fly(from, to, html, cls, { delay = 0, endScale = 1, rotation = 0 } = {}) {
  return new Promise((resolve) => {
    const target = $("#discard").getBoundingClientRect();
    const w = target.width;
    const h = target.height;
    const el = document.createElement("div");
    el.className = `card flying ${cls}`;
    el.style.setProperty("--w", w + "px");
    el.innerHTML = html;
    const x0 = from.left + from.width / 2 - w / 2;
    const y0 = from.top + from.height / 2 - h / 2;
    const x1 = to.left + to.width / 2 - w / 2;
    const y1 = to.top + to.height / 2 - h / 2;
    Object.assign(el.style, { left: x0 + "px", top: y0 + "px", width: w + "px" });
    document.body.appendChild(el);
    const anim = el.animate(
      [
        { transform: "translate(0,0) rotate(-20deg) scale(.6)", opacity: 0.4 },
        { opacity: 1, offset: 0.2 },
        { transform: `translate(${x1 - x0}px, ${y1 - y0}px) rotate(${rotation}deg) scale(${endScale})`, opacity: 1 },
      ],
      { duration: 520, delay, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
    );
    anim.onfinish = () => {
      el.remove();
      resolve();
    };
  });
}

async function animateEvents(events, options) {
  for (const ev of events) {
    if (ev.type === "play") {
      const from = options.cardRect || nodeRect(ev.player);
      await fly(from, $("#discard").getBoundingClientRect(), cardInner(ev.card), cardClass(ev.card), {
        rotation: Math.random() * 30 - 15,
      });
    } else if (ev.type === "draw" || ev.type === "penalty") {
      const target = nodeRect(ev.player);
      const flights = [];
      for (let k = 0; k < ev.amount; k++) {
        flights.push(fly($("#deck").getBoundingClientRect(), target, backHtml(), "back", { delay: k * 110, endScale: 0.45 }));
      }
      await Promise.all(flights);
    }
  }
}

/* ---------------------------------------------------------------------
   Center of the table
   --------------------------------------------------------------------- */
function paintCenter(previous) {
  const center = $("#center");
  const hex = COLOR_HEX[state.active_color] || "#fff";
  center.style.setProperty("--active", hex);

  const ring = $("#ring");
  ring.classList.toggle("ccw", state.direction === -1);

  const top = state.top_card;
  const key = JSON.stringify(top) + state.discard_count;
  const discard = $("#discard");
  if (!previous || discard.dataset.key !== key) {
    const old = discard.querySelector(".card:not(.previous)");
    discard.innerHTML = "";
    if (old && previous) {
      old.classList.add("previous");
      discard.appendChild(old);
    }
    const card = document.createElement("div");
    card.className = `card ${cardClass(top)}`;
    card.innerHTML = cardInner(top);
    if (top.color === null) card.style.boxShadow = `0 0 0 4px ${hex}, 0 0 24px ${hex}`;
    discard.appendChild(card);
    discard.dataset.key = key;
  }

  $("#deck-count").textContent = state.deck_count;
  $("#direction-label").textContent = state.direction === 1 ? "↻ clockwise · next" : "↺ counterclockwise · prev";
}

function pulseRing() {
  const ring = $("#ring");
  ring.classList.remove("flip");
  void ring.offsetWidth;
  ring.classList.add("flip");
}

/* ---------------------------------------------------------------------
   Turn and hand
   --------------------------------------------------------------------- */
function paintTurn() {
  const current = byId(state.current);
  const upcoming = state.upcoming ? byId(state.upcoming) : null;
  const avatar = $("#turn-avatar");
  if (state.finished) {
    const w = state.winners[0];
    $("#turn-name").textContent = `🏆 ${w.name} won`;
    avatar.style.setProperty("--c", w.color);
    avatar.textContent = initials(w.name);
  } else if (current) {
    $("#turn-name").textContent = current.name;
    avatar.style.setProperty("--c", current.color);
    avatar.textContent = initials(current.name);
  }
  const color = state.active_color;
  $("#turn-info").innerHTML = `
    <span class="chip"><span class="dot" style="--cc:${COLOR_HEX[color]}"></span>Color: ${color}</span>
    <span class="chip">${state.direction === 1 ? "↻ clockwise" : "↺ counterclockwise"}</span>
    ${upcoming && !state.finished ? `<span class="chip">Next up: <b>${esc(upcoming.name)}</b></span>` : ""}`;
}

function paintHand(previous) {
  const container = $("#hand");
  const samePlayer = previous && previous.current === state.current && !previous.finished;
  const before = samePlayer ? previous.hand.length : 0;
  container.innerHTML = "";

  if (state.finished) {
    container.innerHTML = '<p class="hand-empty">The game is over. Start a new one to keep playing!</p>';
    return;
  }

  state.hand.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = `card ${cardClass(c)} ${c.playable ? "playable" : "blocked"}${c.drawn ? " drawn" : ""}`;
    b.style.setProperty("--i", samePlayer ? Math.max(0, i - before) : i);
    if (samePlayer && i < before) b.style.animation = "none";
    b.innerHTML = cardInner(c);
    b.title = c.playable ? "Play this card" : "Can't be played right now";
    b.addEventListener("click", () => clickCard(i, c, b));
    container.appendChild(b);
  });
}

async function clickCard(index, card, button) {
  if (busy || state.finished) return;
  if (!card.playable) {
    button.style.animation = "";
    button.classList.remove("shake");
    void button.offsetWidth;
    button.classList.add("shake");
    const reason = state.has_drawn
      ? "After drawing you can only play the new card."
      : `You need a ${state.active_color} card or the same value as the top card.`;
    toast(reason, "error");
    return;
  }
  let color = null;
  if (card.color === null) {
    color = await chooseColor();
    if (!color) return;
  }
  const rect = button.getBoundingClientRect();
  button.style.visibility = "hidden";
  const ok = await action("/api/play", { index, color }, { cardRect: rect });
  if (!ok) button.style.visibility = "";
}

function updateButtons() {
  const started = !!state && state.started;
  const over = !started || state.finished;
  $("#btn-draw").disabled = busy || over || state.has_drawn;
  $("#deck").disabled = busy || over || state.has_drawn;
  $("#btn-pass").disabled = busy || over || !state.has_drawn;
  $("#btn-auto-move").disabled = busy || over;
  $("#btn-traverse").disabled = !started || state.players.length === 0;
  $("#btn-auto").disabled = over;
}

/* ---------------------------------------------------------------------
   Side panel
   --------------------------------------------------------------------- */
function paintStructure() {
  const ps = state.players;
  const playing = !state.finished;
  const chain = ps
    .map((p) => `<span class="chain-link${playing && p.id === state.current ? " current" : ""}" style="--c:${p.color}">${esc(p.name)}</span>`)
    .join('<span class="double-arrow">⇄</span>');
  $("#chain").innerHTML = ps.length
    ? `${chain}<span class="double-arrow">⇄</span><span class="wrap">↺ ${esc(ps[0].name)}</span>`
    : "<em>Empty list</em>";

  $("#node-rows").innerHTML = ps
    .map(
      (p, i) => `<tr class="${playing && p.id === state.current ? "current" : ""}">
        <td>${i}</td>
        <td><b>${esc(p.name)}</b>${p.is_head ? '<span class="mini-tag">head</span>' : ""}</td>
        <td class="p-prev">${esc(byId(p.prev).name)}</td>
        <td class="p-next">${esc(byId(p.next).name)}</td>
      </tr>`
    )
    .join("");
}

function paintPlayers() {
  const playing = !state.finished;
  $("#player-list").innerHTML = state.players
    .map(
      (p) => `<li class="${playing && p.id === state.current ? "current" : ""}">
        <span class="pl-avatar" style="--c:${p.color}">${esc(initials(p.name))}</span>
        <span class="pl-name">${esc(p.name)}</span>
        <span class="pl-cards">🂠 ${p.cards}</span>
        ${playing ? `<button class="pl-remove" data-id="${p.id}" title="Remove node (player quits)">✕</button>` : ""}
      </li>`
    )
    .join("");
}

function paintLog(previous) {
  const last = previous && previous.log && previous.log.length ? previous.log[0].n : 0;
  $("#log").innerHTML = state.log
    .map((e) => `<li class="${e.type}${e.n > last ? " new" : ""}">${e.type === "list" ? "🔗 " : "🎴 "}${esc(e.text)}</li>`)
    .join("");
}

/* ---------------------------------------------------------------------
   Traversal and search (highlight node by node)
   --------------------------------------------------------------------- */
async function highlightSequence(ids, ms = 380) {
  for (const id of ids) {
    const v = vis.get(id);
    if (!v) continue;
    v.el.classList.add("visiting");
    await wait(ms);
    v.el.classList.remove("visiting");
  }
}

async function traverse() {
  if (!state || !state.players.length) return;
  const start = state.finished ? state.players[0].id : state.current;
  const ids = [];
  let id = start;
  for (let k = 0; k <= state.players.length; k++) {
    ids.push(id);
    const p = byId(id);
    id = state.direction === 1 ? p.next : p.prev;
  }
  const pointer = state.direction === 1 ? "next" : "prev";
  toast(`Traversing with the «${pointer}» pointer from ${byId(start).name}…`, "info");
  $("#btn-traverse").disabled = true;
  await highlightSequence(ids);
  $("#btn-traverse").disabled = false;
  toast(`Back at ${byId(start).name}: the list has no end 🔁`, "info");
}

async function search(name) {
  if (!name.trim()) return;
  try {
    const r = await api(`/api/search?name=${encodeURIComponent(name)}`);
    await highlightSequence(r.path, 300);
    if (r.found) {
      const v = vis.get(r.id);
      v.el.classList.add("found");
      setTimeout(() => v.el.classList.remove("found"), 1900);
      toast(`Found in ${r.path.length} step(s) from the head!`, "join");
    } else {
      toast(`Not found: ${r.path.length} nodes visited and we're back at the head.`, "error");
    }
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ---------------------------------------------------------------------
   Auto mode
   --------------------------------------------------------------------- */
function toggleAuto() {
  autoOn ? stopAuto() : startAuto();
}

function startAuto() {
  if (!state || state.finished) return;
  autoOn = true;
  $("#btn-auto").classList.add("on");
  $("#btn-auto").textContent = "⏸ Stop auto";
  autoLoop();
}

function stopAuto() {
  autoOn = false;
  clearTimeout(autoTimer);
  $("#btn-auto").classList.remove("on");
  $("#btn-auto").textContent = "🤖 Auto mode";
}

async function autoLoop() {
  if (!autoOn) return;
  if (state.finished) return stopAuto();
  await action("/api/auto");
  if (autoOn) autoTimer = setTimeout(autoLoop, 950);
}

/* ---------------------------------------------------------------------
   Modals
   --------------------------------------------------------------------- */
const SETUP_COLORS = ["#ff4757", "#1e90ff", "#2ed573", "#ffa502", "#a55eea", "#ff6b81", "#00d2d3", "#eccc68", "#5352ed", "#ff7f50"];

function openSetup() {
  stopAuto();
  const names = state && state.started ? state.players.map((p) => p.name) : DEFAULT_NAMES;
  const box = $("#setup-names");
  box.innerHTML = "";
  (names.length >= 2 ? names : DEFAULT_NAMES).forEach((n) => addSetupRow(n));
  $("#modal-setup").hidden = false;
  box.querySelector("input")?.focus();
}

function addSetupRow(name = "") {
  const box = $("#setup-names");
  if (box.children.length >= 10) return toast("Maximum 10 players.", "error");
  const row = document.createElement("div");
  row.className = "setup-row";
  row.innerHTML = `
    <span class="pl-avatar"></span>
    <input maxlength="14" placeholder="Name">
    <button class="pl-remove" title="Remove">✕</button>`;
  row.querySelector("input").value = name;
  row.querySelector(".pl-remove").onclick = () => {
    if (box.children.length <= 2) return toast("At least 2 players are needed.", "error");
    row.remove();
    colorSetup();
  };
  box.appendChild(row);
  colorSetup();
  return row;
}

function colorSetup() {
  [...$("#setup-names").children].forEach((row, i) => {
    const av = row.querySelector(".pl-avatar");
    av.style.setProperty("--c", SETUP_COLORS[i % SETUP_COLORS.length]);
    av.textContent = i + 1;
  });
}

async function startGame() {
  const names = [...$("#setup-names").querySelectorAll("input")].map((i) => i.value.trim()).filter(Boolean);
  try {
    const next = await api("/api/new", "POST", { players: names });
    $("#modal-setup").hidden = true;
    $("#modal-end").hidden = true;
    for (const v of vis.values()) v.el.remove();
    vis.clear();
    state = null;
    await applyState(next);
    toast(`Let's play! ${byId(state.current).name} goes first.`, "join");
  } catch (e) {
    toast(e.message, "error");
  }
}

let resolveColor = null;
function chooseColor() {
  $("#modal-color").hidden = false;
  return new Promise((r) => (resolveColor = r));
}
function closeColor(color) {
  $("#modal-color").hidden = true;
  if (resolveColor) resolveColor(color);
  resolveColor = null;
}

function showGameOver() {
  const medals = ["🥇", "🥈", "🥉"];
  $("#podium").innerHTML = state.winners
    .map(
      (w, i) => `<li style="animation-delay:${i * 120}ms">
        <span class="medal">${medals[i] || i + 1 + "."}</span>
        <span class="pl-avatar" style="--c:${w.color}">${esc(initials(w.name))}</span>
        ${esc(w.name)}
      </li>`
    )
    .join("");
  $("#modal-end").hidden = false;
  confetti();
}

/* ---------------------------------------------------------------------
   Toasts and confetti
   --------------------------------------------------------------------- */
function toast(text, type = "info") {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

function confetti() {
  const canvas = $("#confetti");
  const ctx = canvas.getContext("2d");
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const colors = ["#ff4757", "#ffc312", "#2ed573", "#1e90ff", "#ff5fd2", "#2ee6ff"];
  const pieces = Array.from({ length: 220 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    vx: Math.random() * 4 - 2,
    vy: 2 + Math.random() * 4,
    r: Math.random() * Math.PI,
    vr: Math.random() * 0.3 - 0.15,
    w: 6 + Math.random() * 8,
    h: 4 + Math.random() * 6,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const end = performance.now() + 4000;
  (function step(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
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
    if (now < end) requestAnimationFrame(step);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })(performance.now());
}

/* ---------------------------------------------------------------------
   UI events
   --------------------------------------------------------------------- */
$("#btn-new").onclick = openSetup;
$("#btn-auto").onclick = toggleAuto;
$("#btn-traverse").onclick = traverse;
$("#btn-draw").onclick = () => action("/api/draw");
$("#deck").onclick = () => action("/api/draw");
$("#btn-pass").onclick = () => action("/api/pass");
$("#btn-auto-move").onclick = () => action("/api/auto");

$("#setup-add").onclick = () => addSetupRow().querySelector("input").focus();
$("#setup-ok").onclick = startGame;
$("#setup-names").addEventListener("keydown", (e) => {
  if (e.key === "Enter") startGame();
});

document.querySelectorAll("#modal-color .swatch").forEach((b) => (b.onclick = () => closeColor(b.dataset.color)));
$("#color-cancel").onclick = () => closeColor(null);

$("#end-close").onclick = () => ($("#modal-end").hidden = true);
$("#end-new").onclick = () => {
  $("#modal-end").hidden = true;
  openSetup();
};

$("#form-add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#in-add");
  if (await action("/api/players", { name: input.value })) input.value = "";
});

$("#form-search").addEventListener("submit", (e) => {
  e.preventDefault();
  search($("#in-search").value);
});

$("#player-list").addEventListener("click", (e) => {
  const b = e.target.closest(".pl-remove");
  if (b) action(`/api/players/${b.dataset.id}`, null, {}, "DELETE");
});

addEventListener("resize", () => drawLinks());

/* ---------------------------------------------------------------------
   Startup
   --------------------------------------------------------------------- */
(async function init() {
  try {
    const data = await api("/api/state");
    if (data.started) await applyState(data);
    else openSetup();
  } catch (e) {
    toast("Could not connect to the Flask server.", "error");
  }
  updateButtons();
})();
