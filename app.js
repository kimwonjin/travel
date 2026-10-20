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
  itinerary: [],
  budget: [],
};
for (const k of Object.keys(DEFAULTS.packing)) {
  DEFAULTS.packing[k] = DEFAULTS.packing[k].map(text => ({ text, done: false }));
}

let state = load();

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

function renderItinerary() {
  state.itinerary.sort((a, b) => a.date.localeCompare(b.date));
  $("#itinerary-list").replaceChildren(...state.itinerary.map((it, i) =>
    mkItem(`${it.date}  ${it.text}`, false, null,
      () => { state.itinerary.splice(i, 1); save(); renderItinerary(); })));
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
  if (kind === "itinerary") state.itinerary.push({ date: els.date.value, text });
  if (kind === "budget") state.budget.push({ text, amount: Number(els.amount.value) });
  save(); form.reset(); renderAll();
}));

$("#reset").addEventListener("click", () => {
  if (!confirm("모든 데이터를 초기화할까요?")) return;
  state = structuredClone(DEFAULTS); save(); renderAll();
});

function renderAll() { renderInfo(); renderChecklist(); renderPacking(); renderItinerary(); renderBudget(); }
renderAll();
