// ---------- settings ----------
const ROUND_SECONDS = 90;   // length of a round
const BONUS_SECONDS = 5;    // time added per correct word
const MIN_TO_PLAY = 5;      // words you need to learn before playing
const CHUNK_SIZE = 8;       // words per learning set

// ---------- saved progress (stays in this browser) ----------
const STORE = "lexicon-v1";
let state = { learned: {}, miss: {}, best: 0, chunk: null };
try {
  const saved = JSON.parse(localStorage.getItem(STORE));
  if (saved) state = Object.assign(state, saved);
} catch (e) {}
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const rand = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const POS = { noun: "n.", verb: "v.", adjective: "adj.", adverb: "adv." };
const abbr = p => POS[p] || p;
const lookup = w => `https://www.merriam-webster.com/dictionary/${encodeURIComponent(w)}`;
const entryHTML = x => `<span class="pos ${esc(x.p)}">${abbr(x.p)}</span>${esc(x.d)}`;
const learnedWords = () => WORDS.filter(x => state.learned[x.w]);

function show(id) {
  ["home", "learn", "play", "results"].forEach(s => $(s).classList.toggle("hidden", s !== id));
  screen = id;
}
let screen = "home";

// ---------- home ----------
function renderHome() {
  const n = learnedWords().length;
  const inSet = state.chunk && state.chunk.queue.length ? new Set(state.chunk.queue).size : 0;
  $("learnSub").textContent = n >= WORDS.length ? "no words left"
    : inSet ? `${WORDS.length - n} words left · ${inSet} left in this set` : `${WORDS.length - n} words left`;
  $("progNum").textContent = `${n} / ${WORDS.length}`;
  $("progBar").style.width = (n / WORDS.length * 100) + "%";
  if (n < MIN_TO_PLAY) {
    $("goPlay").disabled = true;
    $("playSub").textContent = `learn ${MIN_TO_PLAY - n} more to unlock`;
  } else {
    $("goPlay").disabled = false;
    $("playSub").textContent = `${n} words in play · best ${state.best}`;
  }
  show("home");
}
$("goLearn").onclick = startLearn;
$("goPlay").onclick = startPlay;
document.querySelectorAll("[data-home]").forEach(b => b.onclick = renderHome);

function bindReset() {
  $("resetBtn").onclick = () => {
    $("resetWrap").innerHTML = `clear everything? <button class="btn small" id="yes">yes, reset</button> <button class="btn ghost small" id="no">cancel</button>`;
    $("yes").onclick = () => { state.learned = {}; state.miss = {}; state.best = 0; state.chunk = null; save(); restoreReset(); renderHome(); };
    $("no").onclick = restoreReset;
  };
}
function restoreReset() { $("resetWrap").innerHTML = `<button class="link" id="resetBtn">reset progress</button>`; bindReset(); }
bindReset();

// ---------- learn (multiple choice, in sets) ----------
// Learn works in sets of CHUNK_SIZE words. Missed words go to the back of the
// line, and the set only ends once every word in it has been answered correctly.
let learnWord = null, learnDone = false;
const findWord = w => WORDS.find(x => x.w === w);

function newChunk() {
  const pool = shuffle(WORDS.filter(x => !state.learned[x.w])).slice(0, CHUNK_SIZE).map(x => x.w);
  state.chunk = pool.length ? { words: pool, queue: pool.slice(), misses: 0 } : null;
  save();
}

function startLearn() {
  const c = state.chunk;
  if (c) c.queue = c.queue.filter(findWord);       // drop any words removed from the list
  if (!c || !c.queue.length) newChunk();
  show("learn");
  nextLearn();
}

function nextLearn() {
  const panel = $("learnPanel");
  const c = state.chunk;
  if (!c) {
    $("learnCount").textContent = `${WORDS.length} / ${WORDS.length} learned`;
    panel.innerHTML = `<div class="def">You've learned every word.</div><p>Go play, or add more words to words.js.</p>`;
    learnWord = null; return;
  }
  if (!c.queue.length) return chunkDone();

  const done = c.words.length - new Set(c.queue).size;
  $("learnCount").textContent = `set: ${done} / ${c.words.length}`;
  learnWord = findWord(c.queue[0]); learnDone = false;

  // distractors: other words from this set with the same part of speech first,
  // then other same part of speech words, then anything
  const setSame = shuffle(c.words.map(findWord).filter(x => x && x.w !== learnWord.w && x.p === learnWord.p));
  const same = shuffle(WORDS.filter(x => x.w !== learnWord.w && x.p === learnWord.p && !c.words.includes(x.w)));
  const other = shuffle(WORDS.filter(x => x.p !== learnWord.p));
  const opts = shuffle(setSame.slice(0, 2).concat(same, other).slice(0, 3).concat([learnWord]));

  panel.innerHTML = `
    <div class="def">${entryHTML(learnWord)}</div>
    <div class="choices">${opts.map((o, i) => `<button class="choice" data-w="${esc(o.w)}"><span class="k">${i + 1}</span>${esc(o.w)}</button>`).join("")}</div>
    <div id="learnFb"></div>`;
  panel.querySelectorAll(".choice").forEach(b => b.onclick = () => answerLearn(b));
}

function answerLearn(btn) {
  if (learnDone) return;
  learnDone = true;
  const c = state.chunk;
  const ok = btn.dataset.w === learnWord.w;
  document.querySelectorAll(".choice").forEach(b => { b.disabled = true; if (b.dataset.w === learnWord.w) b.classList.add("right"); else if (b !== btn) b.classList.add("dim"); });
  c.queue.shift();
  if (ok) {
    state.learned[learnWord.w] = true;
  } else {
    btn.classList.add("wrong");
    c.misses++;
    c.queue.push(learnWord.w);                     // comes back later in this set
  }
  save();
  const picked = findWord(btn.dataset.w);
  const left = new Set(c.queue).size;
  $("learnFb").innerHTML = `
    <div class="fb ${ok ? "good" : "bad"}">
      ${ok
        ? `correct, <b>${esc(learnWord.w)}</b> is added to game.`
        : `not quite, it's <b>${esc(learnWord.w)}</b>. it'll come back in this set.<div class="picked"><b>${esc(picked.w)}</b> <span class="pos ${esc(picked.p)}">${abbr(picked.p)}</span>${esc(picked.d)}</div>`}
    </div>
    <div class="actions"><button class="btn" id="learnNext">${left ? "next →" : "finish set →"}</button></div>`;
  $("learnNext").onclick = nextLearn;
  if (document.activeElement) document.activeElement.blur();
}

function chunkDone() {
  const c = state.chunk;
  $("learnCount").textContent = `set: ${c.words.length} / ${c.words.length}`;
  const remainingWords = WORDS.filter(x => !state.learned[x.w]).length;
  $("learnPanel").innerHTML = `
    <div class="set-head">set done</div>
    <p class="muted-p">${c.words.length} words added to the game${c.misses ? ` · ${c.misses} miss${c.misses === 1 ? "" : "es"} along the way` : " · no misses"}. quick review:</p>
    <div class="review">${c.words.map(findWord).filter(Boolean).map(x => `
      <div class="rv"><b>${esc(x.w)}</b> <span class="pos ${esc(x.p)}">${abbr(x.p)}</span>${esc(x.d)}</div>`).join("")}
    </div>
    <div class="actions">
      ${remainingWords ? `<button class="btn" id="nextSet">next set →</button>` : ""}
      <button class="btn ghost" id="setPlay">go play</button>
    </div>`;
  if ($("nextSet")) $("nextSet").onclick = () => { newChunk(); nextLearn(); };
  $("setPlay").onclick = () => { state.chunk = null; save(); startPlay(); };
}

// ---------- play (timed typing) ----------
let endAt = 0, tick = null, playing = false, paused = false, remaining = 0, score = 0, current = null, seen = new Set(), got = [], skipped = [];

function startPlay() {
  if (learnedWords().length < MIN_TO_PLAY) return renderHome();
  show("play");
  playing = false;
  $("startOverlay").classList.remove("hidden");
  $("score").textContent = "0";
  $("timer").textContent = fmt(ROUND_SECONDS * 1000);
  $("timer").classList.remove("low");
  $("timebar").style.width = "100%";
  $("pDef").innerHTML = ""; $("pStart").textContent = ""; $("pInput").value = "";
}

function beginRound() {
  $("startOverlay").classList.add("hidden");
  playing = true; paused = false; score = 0; got = []; skipped = []; seen = new Set();
  endAt = Date.now() + ROUND_SECONDS * 1000;
  $("score").textContent = "0";
  nextWord();
  tick = setInterval(updateTimer, 100);
  $("pInput").focus();
}

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function updateTimer() {
  const left = endAt - Date.now();
  $("timer").textContent = fmt(left);
  $("timer").classList.toggle("low", left <= 10000);
  $("timebar").style.width = Math.min(100, (left / (ROUND_SECONDS * 1000)) * 100) + "%";
  if (left <= 0) endRound();
}

function pickWord() {
  let pool = learnedWords().filter(x => !seen.has(x.w));
  if (!pool.length) { seen = new Set(current ? [current.w] : []); pool = learnedWords().filter(x => !seen.has(x.w)); }
  if (!pool.length) pool = learnedWords();
  // words you've skipped before show up more often
  const weights = pool.map(x => 1 + 2 * (state.miss[x.w] || 0));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

function nextWord() {
  current = pickWord();
  seen.add(current.w);
  $("pDef").innerHTML = entryHTML(current);
  $("pStart").textContent = current.w[0].toUpperCase();
  $("pLen").textContent = `${current.w.length} letters`;
  $("pInput").value = "";
  setDot("");
}

function setDot(v) {
  const d = $("dot");
  d.className = "dot";
  if (!v) return;
  d.classList.add(current.w.toLowerCase().startsWith(v) ? "good" : "bad");
}

$("pInput").addEventListener("input", () => {
  if (!playing || paused) return;
  const v = $("pInput").value.trim().toLowerCase();
  setDot(v);
  if (v === current.w.toLowerCase()) correct();
});

function correct() {
  score++;
  got.push(current);
  if (state.miss[current.w]) state.miss[current.w] = Math.max(0, state.miss[current.w] - 1);
  endAt += BONUS_SECONDS * 1000;
  $("score").textContent = score;
  const b = $("bonus"); b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
  flash("flash");
  nextWord();
}

// skipping shows the answer and stops the clock until you press Enter
function skip() {
  paused = true;
  remaining = endAt - Date.now();
  clearInterval(tick);
  skipped.push(current);
  state.miss[current.w] = (state.miss[current.w] || 0) + 1;
  save();
  $("pInput").disabled = true;
  setDot("");
  $("reveal").innerHTML = `it was <b>${esc(current.w)}</b> <span class="go">· clock paused · press <kbd>Enter</kbd> to keep going</span>`;
  $("reveal").classList.remove("hidden");
}

function resume() {
  paused = false;
  $("reveal").classList.add("hidden");
  $("pInput").disabled = false;
  endAt = Date.now() + remaining;
  tick = setInterval(updateTimer, 100);
  nextWord();
  $("pInput").focus();
}

function flash(cls) {
  const p = $("playPanel"); p.classList.remove(cls); void p.offsetWidth; p.classList.add(cls);
}

function endRound() {
  clearInterval(tick); playing = false;
  // the word on screen when time ran out counts as missed
  if (current && !got.includes(current) && !skipped.includes(current) && !paused) {
    skipped.push(current);
    state.miss[current.w] = (state.miss[current.w] || 0) + 1;
  }
  const newBest = score > state.best;
  if (newBest) state.best = score;
  save();

  $("rScore").textContent = score;
  $("rBest").textContent = newBest ? "★ new best" : `best: ${state.best}`;
  $("rBest").classList.toggle("new", newBest);
  const uniq = arr => arr.filter((x, i) => arr.findIndex(y => y.w === x.w) === i);
  let html = "";
  const miss = uniq(skipped);
  if (miss.length) {
    html += `<div class="list-title">missed — study these</div>` + miss.map(x => `
      <div class="entry"><div class="w"><a href="${lookup(x.w)}" target="_blank" rel="noopener">${esc(x.w)}</a></div><div class="d">${entryHTML(x)}</div></div>`).join("");
  }
  if (got.length) {
    html += `<div class="list-title">got 'em</div><div class="chips">${uniq(got).map(x => `<span class="chip">${esc(x.w)}</span>`).join("")}</div>`;
  }
  $("rLists").innerHTML = html;
  show("results");
}

$("startOverlay").onclick = () => { if (!playing) beginRound(); };
$("quit").onclick = () => { clearInterval(tick); playing = false; paused = false; $("pInput").disabled = false; $("reveal").classList.add("hidden"); renderHome(); };
$("again").onclick = startPlay;

// ---------- keyboard ----------
document.addEventListener("keydown", e => {
  if (screen === "learn") {
    if (!learnDone && /^[1-4]$/.test(e.key)) {
      const b = document.querySelectorAll(".choice")[+e.key - 1];
      if (b) b.click();
    }
  } else if (screen === "play") {
    if (!playing && e.key === "Enter" && !$("startOverlay").classList.contains("hidden")) { e.preventDefault(); beginRound(); }
    else if (playing && paused && e.key === "Enter") { e.preventDefault(); resume(); }
    else if (playing && !paused && e.key === "Escape") { e.preventDefault(); skip(); }
    else if (playing && !paused && e.key === "Enter") { flash("shake"); }
  } else if (screen === "results") {
    if (e.key === "Enter") { e.preventDefault(); startPlay(); }
  }
});

renderHome();
