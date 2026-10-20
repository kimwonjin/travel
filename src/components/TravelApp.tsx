"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { db, supabase } from "@/lib/supabase";
import { DEFAULT_CHECKLIST, DEFAULT_PACKING, DEFAULT_STOPS } from "@/lib/defaults";
import { dday } from "@/lib/format";
import { TRIP_FIELDS, type CourseStop, type Role, type Trip } from "@/lib/types";
import RouteTab from "./RouteTab";
import InfoTab from "./InfoTab";
import CheckList from "./CheckList";
import BudgetTab from "./BudgetTab";
import ShareTab from "./ShareTab";
import MarketTab from "./MarketTab";
import PhoneLogin from "./PhoneLogin";

const TABS = [
  ["route", "동선 지도"],
  ["info", "여행 정보"],
  ["checklist", "체크리스트"],
  ["packing", "짐 목록"],
  ["budget", "예산"],
  ["share", "함께 짜기"],
  ["market", "투어 코스"],
] as const;
type TabId = (typeof TABS)[number][0];

const CURRENT_KEY = "travel-current-trip";
const ROLE_LABEL: Record<Role, string> = { owner: "내 여행", editor: "편집 가능", viewer: "보기 전용" };

/** 새 여행을 기본 체크리스트·짐 목록·동선(집 → 공항)과 함께 만든다. stops를 주면 그 동선을 넣는다. */
async function createTrip(fields: Partial<Trip> = {}, stops: Partial<CourseStop>[] = DEFAULT_STOPS) {
  const client = db();
  const { data: trip, error } = await client.from("trips").insert(fields).select().single();
  if (error) throw error;
  // 기본 항목은 동시에 저장해서 첫 화면을 빨리 띄운다
  const results = await Promise.all([
    client.from("checklist_items").insert(
      DEFAULT_CHECKLIST.map((text, position) => ({ trip_id: trip.id, text, position })),
    ),
    client.from("packing_items").insert(
      Object.entries(DEFAULT_PACKING).flatMap(([category, texts]) =>
        texts.map((text, position) => ({ trip_id: trip.id, category, text, position })),
      ),
    ),
    stops.length
      ? client.from("stops").insert(stops.map((s, position) => ({ ...s, position, trip_id: trip.id })))
      : null,
  ]);
  const failed = results.find((r) => r?.error);
  if (failed?.error) throw failed.error;
  return trip as Trip;
}

function readCurrent(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export default function TravelApp() {
  // undefined: 세션 확인 중, null: 로그아웃 상태
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("route");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const trip = trips.find((t) => t.id === tripId) ?? null;
  const userId = session?.user.id;

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  /** 볼 수 있는 여행(내 것 + 초대받은 것)을 불러오고 선택할 여행을 정한다 */
  const loadTrips = useCallback(async (prefer?: string) => {
    const { data, error } = await db().from("trips").select("*").order("created_at");
    if (error) throw error;
    let list = data as Trip[];
    if (!list.length) list = [await createTrip()];
    setTrips(list);
    const want = prefer ?? readCurrent();
    setTripId(list.some((t) => t.id === want) ? want : list[0].id);
  }, []);

  // 로그인 후: 초대 링크(?join=코드)로 들어왔으면 먼저 참여시키고 여행 목록 불러오기
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const code = new URLSearchParams(location.search).get("join");
      let joined: string | undefined;
      if (code) {
        history.replaceState(null, "", location.pathname);
        const nickname = prompt("함께 여행할 사람들에게 보일 이름을 입력해 주세요") ?? "";
        const { data, error } = await db().rpc("join_trip", { invite_code: code, nickname });
        if (error) setError(error.message);
        else joined = data as string;
      }
      await loadTrips(joined);
    })().catch((e) => setError(e.message ?? String(e)));
  }, [userId, loadTrips]);

  // 선택한 여행 기억 + 내 권한 확인
  useEffect(() => {
    if (!tripId) return;
    try {
      localStorage.setItem(CURRENT_KEY, tripId);
    } catch {}
    db().rpc("trip_role", { t: tripId }).then(({ data }) => setRole((data as Role) ?? "viewer"));
  }, [tripId]);

  async function logout() {
    await db().auth.signOut();
    setTrips([]);
    setTripId(null);
  }

  async function newTrip() {
    const title = prompt("새 여행 이름", "새 여행");
    if (title === null) return;
    try {
      const t = await createTrip({ title: title || "새 여행" });
      setTrips((prev) => [...prev, t]);
      setTripId(t.id);
      setTab("route");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** 구매한 코스로 새 여행 만들기 */
  async function importCourse(title: string, region: string, stops: CourseStop[]) {
    const t = await createTrip(
      { title, destination: region },
      stops.map((s) => ({
        type: s.type, name: s.name, address: s.address, lat: s.lat, lng: s.lng, place_id: s.place_id, memo: s.memo,
      })),
    );
    setTrips((prev) => [...prev, t]);
    setTripId(t.id);
    setTab("route");
  }

  // 입력할 때마다 화면은 바로 바꾸고, 저장은 잠시 모아서 한 번에
  function updateTrip(patch: Partial<Trip>) {
    if (!trip) return;
    const next = { ...trip, ...patch };
    setTrips((prev) => prev.map((t) => (t.id === next.id ? next : t)));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const fields = Object.fromEntries(TRIP_FIELDS.map((k) => [k, next[k]]));
      db().from("trips").update(fields).eq("id", next.id).then(({ error }) => error && setError(error.message));
    }, 500);
  }

  if (!supabase) {
    return (
      <main className="notice">
        <h2>Supabase 설정이 필요해요</h2>
        <p><code>.env.example</code>을 <code>.env.local</code>로 복사하고 Supabase URL과 키를 입력해 주세요.</p>
      </main>
    );
  }

  if (session === undefined) return <main><p className="muted">불러오는 중…</p></main>;
  if (session === null) {
    return (
      <>
        <header className="hero"><h1>✈️ 여행 준비</h1></header>
        <PhoneLogin />
      </>
    );
  }

  const readOnly = role === "viewer";
  const summary = trip?.destination
    ? `${trip.destination} · ${trip.start_date ?? "?"} ~ ${trip.end_date ?? "?"} · ${trip.people}명`
    : "여행 정보를 입력해 주세요.";

  return (
    <>
      <header className="hero">
        <div className="trip-picker">
          <select value={tripId ?? ""} onChange={(e) => setTripId(e.target.value)} aria-label="여행 선택">
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}{t.user_id !== userId ? " (초대받음)" : ""}
              </option>
            ))}
          </select>
          <button onClick={newTrip}>+ 새 여행</button>
        </div>
        <p>{summary}</p>
        {trip?.start_date && <div className="dday">{dday(trip.start_date)}</div>}
        {role && role !== "owner" && <span className="badge">{ROLE_LABEL[role]}</span>}
      </header>

      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        {error && <p className="error">오류: {error}</p>}
        {!trip || !role ? (
          !error && <p className="muted">불러오는 중…</p>
        ) : (
          <section className="panel" key={trip.id}>
            {tab === "route" && <RouteTab tripId={trip.id} userId={session.user.id} readOnly={readOnly} />}
            {tab === "info" && <InfoTab trip={trip} onChange={updateTrip} readOnly={readOnly} />}
            {tab === "checklist" && <CheckList table="checklist_items" tripId={trip.id} readOnly={readOnly} />}
            {tab === "packing" && <CheckList table="packing_items" tripId={trip.id} grouped readOnly={readOnly} />}
            {tab === "budget" && <BudgetTab tripId={trip.id} people={trip.people} readOnly={readOnly} />}
            {tab === "share" && (
              <ShareTab
                tripId={trip.id}
                role={role}
                onLeft={() => loadTrips().catch((e) => setError(e.message))}
              />
            )}
            {tab === "market" && <MarketTab tripId={trip.id} userId={session.user.id} onImport={importCourse} />}
          </section>
        )}
      </main>
      <footer>
        <button className="link" onClick={logout}>로그아웃{session.user.phone ? ` (+${session.user.phone})` : ""}</button>
      </footer>
    </>
  );
}
