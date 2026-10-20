"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import { STOP_TYPES } from "@/lib/defaults";
import { won } from "@/lib/format";
import type { Course, CourseStop, Stop } from "@/lib/types";

type Props = {
  tripId: string;
  userId: string;
  onImport: (title: string, region: string, stops: CourseStop[]) => Promise<void>;
};

/** 투어 코스: 잘 다녀온 사람이 동선을 올려 판매하고, 다른 사람이 사서 내 여행으로 가져온다 */
export default function MarketTab({ tripId, userId, onImport }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, CourseStop[]>>({});
  const [selling, setSelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db().from("courses").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => (error ? setError(error.message) : setCourses(data as Course[])));
    db().from("course_purchases").select("course_id").eq("buyer_id", userId)
      .then(({ data }) => setOwned(new Set((data ?? []).map((r) => r.course_id as string))));
  }, [userId]);

  const canView = (c: Course) => c.seller_id === userId || c.price === 0 || owned.has(c.id);

  async function toggle(c: Course) {
    if (open === c.id) return setOpen(null);
    setOpen(c.id);
    if (canView(c) && !detail[c.id]) {
      const { data, error } = await db().from("course_stops").select("*").eq("course_id", c.id).order("position");
      if (error) return setError(error.message);
      setDetail((d) => ({ ...d, [c.id]: data as CourseStop[] }));
    }
  }

  async function buy(c: Course) {
    if (!confirm(`"${c.title}" 코스를 ${won(c.price)}원에 구매할까요?\n(테스트 중이라 실제 결제는 되지 않아요)`)) return;
    const { error } = await db().from("course_purchases").insert({ course_id: c.id, price: c.price });
    if (error) return setError(error.message);
    setOwned(new Set([...owned, c.id]));
    await toggleAfterBuy(c);
  }

  async function toggleAfterBuy(c: Course) {
    const { data } = await db().from("course_stops").select("*").eq("course_id", c.id).order("position");
    setDetail((d) => ({ ...d, [c.id]: (data ?? []) as CourseStop[] }));
    setOpen(c.id);
  }

  async function importCourse(c: Course) {
    setBusy(true);
    try {
      await onImport(c.title, c.region, detail[c.id] ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function remove(c: Course) {
    if (!confirm(`"${c.title}" 코스를 내릴까요?`)) return;
    setCourses(courses.filter((x) => x.id !== c.id));
    const { error } = await db().from("courses").delete().eq("id", c.id);
    if (error) setError(error.message);
  }

  return (
    <>
      {error && <p className="error">오류: {error}</p>}

      {selling ? (
        <SellForm
          tripId={tripId}
          onDone={(c) => {
            if (c) setCourses([c, ...courses]);
            setSelling(false);
          }}
        />
      ) : (
        <button className="primary block" onClick={() => setSelling(true)}>💰 지금 여행의 동선을 코스로 판매하기</button>
      )}

      <h3>투어 코스 둘러보기</h3>
      {!courses.length && <p className="muted">아직 올라온 코스가 없어요. 첫 코스를 올려 보세요!</p>}
      <ul className="courses">
        {courses.map((c) => {
          const mine = c.seller_id === userId;
          return (
            <li key={c.id} className="course">
              <button className="course-head" onClick={() => toggle(c)}>
                <b>{c.title}</b>
                <small>
                  {c.region && `${c.region} · `}{c.stop_count}곳 · {c.author_name || "익명"}
                </small>
                <span className="price">{c.price ? `${won(c.price)}원` : "무료"}</span>
              </button>
              {open === c.id && (
                <div className="course-body">
                  {c.description && <p>{c.description}</p>}
                  {canView(c) ? (
                    <>
                      <ol className="course-stops">
                        {(detail[c.id] ?? []).map((s) => (
                          <li key={s.id}>{STOP_TYPES[s.type] ?? ""} {s.name || "(이름 없음)"}{s.memo && <small className="muted"> · {s.memo}</small>}</li>
                        ))}
                      </ol>
                      <div className="row">
                        <button className="primary" disabled={busy} onClick={() => importCourse(c)}>
                          {busy ? "가져오는 중…" : "내 여행으로 가져오기"}
                        </button>
                        {mine && <button className="link" onClick={() => remove(c)}>판매 중지</button>}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="muted">구매하면 {c.stop_count}곳의 전체 동선을 지도에서 볼 수 있어요.</p>
                      <button className="primary" onClick={() => buy(c)}>{won(c.price)}원에 구매하기</button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SellForm({ tripId, onDone }: { tripId: string; onDone: (c: Course | null) => void }) {
  const [title, setTitle] = useState("");
  const [region, setRegion] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const client = db();
      const { data: stops, error: stopsError } = await client.from("stops").select("*").eq("trip_id", tripId).order("position");
      if (stopsError) throw stopsError;
      if ((stops as Stop[]).filter((s) => s.lat != null).length < 2) {
        throw new Error("동선에 지도 위치가 있는 장소가 2곳 이상 있어야 판매할 수 있어요.");
      }

      const { data: course, error } = await client.from("courses").insert({
        title: title.trim(), region: region.trim(), description: description.trim(),
        price: Math.max(0, Number(price) || 0), author_name: author.trim(), stop_count: stops.length,
      }).select().single();
      if (error) throw error;

      const { error: copyError } = await client.from("course_stops").insert(
        (stops as Stop[]).map((s, position) => ({
          course_id: course.id, position, type: s.type, name: s.name, address: s.address,
          lat: s.lat, lng: s.lng, place_id: s.place_id, memo: s.memo,
        })),
      );
      if (copyError) throw copyError;
      onDone(course as Course);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="sell" onSubmit={submit}>
      <h3>지금 여행의 동선을 코스로 올리기</h3>
      <label>코스 이름<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 오사카 먹방 2박 3일" required /></label>
      <label>지역<input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="예: 오사카" /></label>
      <label>소개<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="이 코스의 좋은 점, 팁" /></label>
      <div className="grid">
        <label>가격(원, 0이면 무료)<input type="number" min={0} step={100} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label>판매자 이름<input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="닉네임" required /></label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy}>{busy ? "올리는 중…" : "판매 시작"}</button>
        <button type="button" className="link" onClick={() => onDone(null)}>취소</button>
      </div>
    </form>
  );
}
