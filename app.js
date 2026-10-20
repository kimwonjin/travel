const KEY = "travel-prep-v1";

const DEFAULTS = {
  info: { destination: "", start: "", end: "", people: 1, memo: "" },
  checklist: ["여권 유효기간 확인 (6개월 이상)", "항공권 예약", "숙소 예약", "여행자 보험 가입",
    "환전 / 해외결제 카드 준비", "비자 / 입국 서류 확인", "로밍 또는 eSIM 준비", "공항 이동 계획"]
    .map(text => ({ text, done: false })),
  packing: {
    "서류/결제": ["여권", "항공권(e-ticket)", "카드/현금"],
    "의류": ["속옷/양말", "상의", "하의", "잠옷"],
    "세면/위생": ["칫솔/치약", "세안용품", "상비약"],
    "전자기기": ["휴대폰 충전기", "보조배터리", "멀티 어댑터"],
  },
  stops: [],
  budget: [],
};
for (const k of Object.keys(DEFAULTS.packing)) {
  DEFAULTS.packing[k] = DEFAULTS.packing[k].map(text => ({ text, done: false }));
}

let state = load();
if (!state.stops) state.stops = [];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 저장소 사용 불가 시 기본값 */ }
  return structuredClone(DEFAULTS);
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
}
const $ = (s, r = document) => r.querySelector(s);
const won = n => Number(n).toLocaleString("ko-KR");

function mkItem(text, done, onToggle, onDelete) {
  const li = document.createElement("li");
  if (done) li.classList.add("done");
  if (onToggle) {
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = done;
    cb.addEventListener("change", onToggle);
    li.append(cb);
  }
  const span = document.createElement("span");
  span.textContent = text;
  const del = document.createElement("button");
  del.className = "del"; del.textContent = "✕"; del.setAttribute("aria-label", "삭제");
  del.addEventListener("click", onDelete);
  li.append(span, del);
  return li;
}

function bar(el, items) {
  const pct = items.length ? (items.filter(i => i.done).length / items.length) * 100 : 0;
  el.style.width = pct + "%";
}

function renderInfo() {
  const f = $("#info-form");
  for (const [k, v] of Object.entries(state.info)) f.elements[k].value = v;
  const { destination, start, end, people } = state.info;
  $("#trip-summary").textContent = destination
    ? `${destination} · ${start || "?"} ~ ${end || "?"} · ${people}명`
    : "여행 정보를 입력해 주세요.";
  const d = $("#dday");
  if (start) {
    const days = Math.ceil((new Date(start) - new Date().setHours(0, 0, 0, 0)) / 864e5);
    d.textContent = days > 0 ? `D-${days}` : days === 0 ? "D-DAY 🎉" : `여행 ${-days}일차 이후`;
  } else d.textContent = "";
  renderBudget();
}

function renderChecklist() {
  const ul = $("#checklist-list");
  ul.replaceChildren(...state.checklist.map((it, i) => mkItem(it.text, it.done,
    () => { it.done = !it.done; save(); renderChecklist(); },
    () => { state.checklist.splice(i, 1); save(); renderChecklist(); })));
  bar($("#checklist-bar"), state.checklist);
}

function renderPacking() {
  const wrap = $("#packing-groups");
  wrap.replaceChildren();
  const all = [];
  for (const [cat, items] of Object.entries(state.packing)) {
    all.push(...items);
    const h = document.createElement("h3"); h.textContent = cat;
    const ul = document.createElement("ul"); ul.className = "list";
    ul.append(...items.map((it, i) => mkItem(it.text, it.done,
      () => { it.done = !it.done; save(); renderPacking(); },
      () => { items.splice(i, 1); save(); renderPacking(); })));
    wrap.append(h, ul);
  }
  bar($("#packing-bar"), all);
  $("#packing select").replaceChildren(...Object.keys(state.packing).map(c => new Option(c, c)));
}

function renderBudget() {
  const total = state.budget.reduce((s, b) => s + b.amount, 0);
  $("#budget-total").textContent = won(total);
  const people = Number(state.info.people) || 1;
  $("#budget-per").textContent = people > 1 ? `(1인당 ${won(Math.round(total / people))}원)` : "";
  $("#budget-list").replaceChildren(...state.budget.map((b, i) =>
    mkItem(`${b.text} — ${won(b.amount)}원`, false, null,
      () => { state.budget.splice(i, 1); save(); renderBudget(); })));
}

// 탭 전환
document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab, .panel").forEach(e => e.classList.remove("active"));
  btn.classList.add("active");
  $("#" + btn.dataset.tab).classList.add("active");
  if (btn.dataset.tab === "itinerary") showMap();
}));

// 여행 정보 입력
$("#info-form").addEventListener("input", e => {
  state.info[e.target.name] = e.target.value;
  save(); renderInfo();
});

// 항목 추가 폼
document.querySelectorAll("form.add").forEach(form => form.addEventListener("submit", e => {
  e.preventDefault();
  const kind = form.dataset.add;
  const els = form.elements;
  const text = (els.text ? els.text.value : form.querySelector("input").value).trim();
  if (!text) return;
  if (kind === "checklist") state.checklist.push({ text, done: false });
  if (kind === "packing") state.packing[els.cat.value].push({ text, done: false });
  if (kind === "budget") state.budget.push({ text, amount: Number(els.amount.value) });
  save(); form.reset(); renderAll();
}));

$("#reset").addEventListener("click", () => {
  if (!confirm("모든 데이터를 초기화할까요?")) return;
  state = structuredClone(DEFAULTS); save(); renderAll();
});

function renderAll() { renderInfo(); renderChecklist(); renderPacking(); renderStops(); renderBudget(); }

// ---------- 동선 지도 ----------
const TYPES = { "공항": "✈️", "숙소": "🏨", "관광지": "📍", "식당": "🍴", "기타": "⭐" };
$("#place-search select").replaceChildren(...Object.keys(TYPES).map(t => new Option(`${TYPES[t]} ${t}`, t)));

let map, mapLayer;

function showMap() {
  if (typeof L === "undefined") {
    $("#map").textContent = "지도 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.";
    return;
  }
  if (!map) {
    map = L.map("map").setView([37.5665, 126.978], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
    map.on("click", e => addStop({ type: "관광지", name: "새 지점", lat: e.latlng.lat, lng: e.latlng.lng }, true));
  }
  setTimeout(() => { map.invalidateSize(); drawRoute(true); }, 0);
}

function km(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const fmtKm = d => d < 10 ? d.toFixed(1) : Math.round(d).toLocaleString("ko-KR");

function drawRoute(fit) {
  if (!map) return;
  mapLayer.clearLayers();
  const pts = state.stops.map(s => [s.lat, s.lng]);
  if (pts.length > 1) L.polyline(pts, { color: "#2f80ed", weight: 4, dashArray: "8 6" }).addTo(mapLayer);
  state.stops.forEach((s, i) => {
    const icon = L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14],
      html: `<div class="pin">${i + 1}</div>` });
    L.marker([s.lat, s.lng], { icon }).bindTooltip(`${i + 1}. ${s.name}`).addTo(mapLayer);
  });
  if (fit && pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
}

function renderStops() {
  const ol = $("#stop-list");
  ol.replaceChildren();
  let total = 0;
  state.stops.forEach((s, i) => {
    const leg = i ? km(state.stops[i - 1], s) : 0;
    total += leg;
    const li = document.createElement("li");
    const no = document.createElement("b"); no.className = "no"; no.textContent = i + 1;
    const name = document.createElement("input");
    name.value = s.name; name.className = "stop-name";
    name.addEventListener("change", () => { s.name = name.value.trim() || s.name; save(); drawRoute(); });
    const meta = document.createElement("small");
    meta.textContent = `${TYPES[s.type] || ""} ${s.type}` + (i ? ` · 이전 지점에서 ${fmtKm(leg)}km` : "");
    const box = document.createElement("div"); box.className = "stop-main"; box.append(name, meta);
    li.append(no, box,
      btn("↑", "위로", () => move(i, -1), i === 0),
      btn("↓", "아래로", () => move(i, 1), i === state.stops.length - 1),
      btn("📍", "지도에서 보기", () => map && map.setView([s.lat, s.lng], 15)),
      btn("✕", "삭제", () => { state.stops.splice(i, 1); save(); renderStops(); drawRoute(true); }));
    ol.append(li);
  });
  $("#route-info").textContent = state.stops.length
    ? `총 ${state.stops.length}곳 · 직선거리 합계 약 ${fmtKm(total)}km`
    : "장소를 추가하면 동선이 그려져요.";
  drawRoute();
}

function btn(text, label, fn, disabled) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "del"; b.textContent = text;
  b.setAttribute("aria-label", label); b.disabled = !!disabled;
  b.addEventListener("click", fn);
  return b;
}

function move(i, d) {
  const j = i + d;
  [state.stops[i], state.stops[j]] = [state.stops[j], state.stops[i]];
  save(); renderStops();
}

async function addStop(stop, lookupName) {
  state.stops.push(stop);
  save(); renderStops();
  if (map) map.panTo([stop.lat, stop.lng]);
  if (!lookupName) return;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=ko&lat=${stop.lat}&lon=${stop.lng}`);
    const j = await r.json();
    const n = j.name || (j.display_name || "").split(",")[0];
    if (n) { stop.name = n; save(); renderStops(); }
  } catch (e) { /* 이름 조회 실패 시 기본 이름 유지 */ }
}

$("#place-search").addEventListener("submit", async e => {
  e.preventDefault();
  const q = e.target.elements.q.value.trim();
  const ul = $("#search-results");
  ul.replaceChildren(Object.assign(document.createElement("li"), { textContent: "검색 중…" }));
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ko&q=${encodeURIComponent(q)}`);
    const list = await r.json();
    if (!list.length) { ul.firstChild.textContent = "검색 결과가 없어요."; return; }
    const type = e.target.elements.type.value;
    ul.replaceChildren(...list.map(p => {
      const li = document.createElement("li");
      const span = document.createElement("span"); span.textContent = p.display_name;
      const add = document.createElement("button"); add.type = "button"; add.className = "pick"; add.textContent = "추가";
      add.addEventListener("click", () => {
        addStop({ type, name: (p.name || p.display_name.split(",")[0]), lat: +p.lat, lng: +p.lon });
        ul.replaceChildren(); e.target.reset();
        drawRoute(true);
      });
      li.append(span, add);
      return li;
    }));
  } catch (err) {
    ul.firstChild.textContent = "검색에 실패했어요. 지도를 직접 클릭해 추가해 보세요.";
  }
});

renderAll();
