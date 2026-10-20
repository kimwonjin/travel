"use client";

import { useEffect, useRef, useState } from "react";
import { db, supabase } from "@/lib/supabase";
import { DEFAULT_CHECKLIST, DEFAULT_PACKING } from "@/lib/defaults";
import { dday } from "@/lib/format";
import type { Trip } from "@/lib/types";
import RouteTab from "./RouteTab";
import InfoTab from "./InfoTab";
import CheckList from "./CheckList";
import BudgetTab from "./BudgetTab";

const TABS = [
  ["route", "동선 지도"],
  ["info", "여행 정보"],
  ["checklist", "준비 체크리스트"],
  ["packing", "짐 목록"],
  ["budget", "예산"],
] as const;
type TabId = (typeof TABS)[number][0];

/** 익명 로그인 후 사용자의 첫 여행을 불러오고, 없으면 기본 항목과 함께 만든다. */
async function loadOrCreateTrip(): Promise<Trip> {
  const client = db();
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    const { error } = await client.auth.signInAnonymously();
    if (error) throw error;
  }

  const { data: trips, error } = await client.from("trips").select("*").order("created_at").limit(1);
  if (error) throw error;
  if (trips.length) return trips[0] as Trip;

  const { data: trip, error: createError } = await client.from("trips").insert({}).select().single();
  if (createError) throw createError;
  await client.from("checklist_items").insert(
    DEFAULT_CHECKLIST.map((text, position) => ({ trip_id: trip.id, text, position })),
  );
  await client.from("packing_items").insert(
    Object.entries(DEFAULT_PACKING).flatMap(([category, texts]) =>
      texts.map((text, position) => ({ trip_id: trip.id, category, text, position })),
    ),
  );
  return trip as Trip;
}

export default function TravelApp() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("route");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!supabase) return;
    loadOrCreateTrip().then(setTrip, (e) => setError(e.message ?? String(e)));
  }, []);

  // 입력할 때마다 화면은 바로 바꾸고, 저장은 잠시 모아서 한 번에
  function updateTrip(patch: Partial<Trip>) {
    if (!trip) return;
    const next = { ...trip, ...patch };
    setTrip(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const { id, ...fields } = next;
      db().from("trips").update(fields).eq("id", id).then(({ error }) => error && setError(error.message));
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

  const summary = trip?.destination
    ? `${trip.destination} · ${trip.start_date ?? "?"} ~ ${trip.end_date ?? "?"} · ${trip.people}명`
    : "여행 정보를 입력해 주세요.";

  return (
    <>
      <header className="hero">
        <h1>✈️ 여행 준비</h1>
        <p>{summary}</p>
        {trip?.start_date && <div className="dday">{dday(trip.start_date)}</div>}
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
        {!trip ? (
          !error && <p className="muted">불러오는 중…</p>
        ) : (
          <section className="panel">
            {tab === "route" && <RouteTab tripId={trip.id} />}
            {tab === "info" && <InfoTab trip={trip} onChange={updateTrip} />}
            {tab === "checklist" && <CheckList table="checklist_items" tripId={trip.id} />}
            {tab === "packing" && <CheckList table="packing_items" tripId={trip.id} grouped />}
            {tab === "budget" && <BudgetTab tripId={trip.id} people={trip.people} />}
          </section>
        )}
      </main>
    </>
  );
}
