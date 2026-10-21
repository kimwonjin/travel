"use client";

import { useEffect, useRef, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  Map,
  Pin,
  Polyline,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps";
import { db } from "@/lib/supabase";
import { STOP_TYPES } from "@/lib/defaults";
import { distanceKm, fmtKm } from "@/lib/format";
import type { Recommendation, Stop } from "@/lib/types";

// 기본값은 이 앱의 브라우저용 키 (Google Cloud에서 사이트 주소로 사용 제한)
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDaMuLHYXCU2IDpjpbwJJa72z3qhuuutIE";
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";
const SEOUL = { lat: 37.5665, lng: 126.978 };

type Located = Stop & { lat: number; lng: number };
type PlacePick = { name: string; address: string; lat: number; lng: number; place_id: string | null };

const isLocated = (s: Stop): s is Located => s.lat != null && s.lng != null;
const placeKey = (p: { place_id: string | null; name: string; lat: number; lng: number }) =>
  p.place_id ?? `${p.name}@${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;

type Props = { tripId: string; userId: string; readOnly?: boolean };

/** 동선: 위에는 지도, 아래에는 행 추가/삭제로 순서를 짜는 표 */
export default function RouteTab({ tripId, userId, readOnly }: Props) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>({}); // placeKey → saved_places.id
  const [baseId, setBaseId] = useState<string | null>(null); // 추천 기준 행 (null이면 마지막 위치 있는 행)
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canEdit = !readOnly;

  useEffect(() => {
    db().from("stops").select("*").eq("trip_id", tripId).order("position").order("created_at")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setStops(data as Stop[]);
        setLoaded(true);
      });
  }, [tripId]);

  useEffect(() => {
    db().from("saved_places").select("id, name, lat, lng, place_id").eq("user_id", userId)
      .then(({ data }) => setSaved(Object.fromEntries((data ?? []).map((p) => [placeKey(p), p.id as string]))));
  }, [userId]);

  const located = stops.filter(isLocated);
  const base = located.find((s) => s.id === baseId) ?? located[located.length - 1];

  // 기준 장소 주변 5km 안에서 다른 여행자들이 많이 저장한 장소
  useEffect(() => {
    if (!base) return;
    db().rpc("nearby_places", { p_lat: base.lat, p_lng: base.lng, p_radius_km: 5 })
      .then(({ data, error }) => (error ? setError(error.message) : setRecs(data as Recommendation[])));
  }, [base?.lat, base?.lng, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addRow(fields: Partial<Stop> = {}) {
    const position = stops.length ? stops[stops.length - 1].position + 1 : 0;
    const { data, error } = await db().from("stops")
      .insert({ type: "관광지", name: "", ...fields, trip_id: tripId, position }).select().single();
    if (error) return setError(error.message);
    setStops((prev) => [...prev, data as Stop]);
  }

  async function updateRow(id: string, patch: Partial<Stop>) {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error } = await db().from("stops").update(patch).eq("id", id);
    if (error) setError(error.message);
  }

  async function move(i: number, d: -1 | 1) {
    const a = stops[i];
    const b = stops[i + d];
    const next = [...stops];
    next[i] = { ...b, position: a.position };
    next[i + d] = { ...a, position: b.position };
    setStops(next);
    const results = await Promise.all([
      db().from("stops").update({ position: b.position }).eq("id", a.id),
      db().from("stops").update({ position: a.position }).eq("id", b.id),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) setError(failed.error.message);
  }

  async function removeRow(stop: Stop) {
    if (stop.name && !confirm(`${stop.name} 행을 삭제할까요?`)) return;
    setStops(stops.filter((s) => s.id !== stop.id));
    const { error } = await db().from("stops").delete().eq("id", stop.id);
    if (error) setError(error.message);
  }

  /** ⭐ 괜찮은 장소 저장/취소. 저장한 장소는 근처를 여행하는 다른 사람에게 추천된다. */
  async function toggleSave(s: Located) {
    const key = placeKey(s);
    if (saved[key]) {
      const id = saved[key];
      setSaved(({ [key]: _, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
      const { error } = await db().from("saved_places").delete().eq("id", id);
      if (error) setError(error.message);
      return;
    }
    const comment = prompt(`"${s.name}" 한줄 추천 (선택, 다른 여행자에게 보여요)`);
    if (comment === null) return;
    const { data, error } = await db().from("saved_places").insert({
      name: s.name, address: s.address, lat: s.lat, lng: s.lng, place_id: s.place_id,
      category: s.type, comment: comment.trim(),
    }).select("id").single();
    if (error) return setError(error.message);
    setSaved((prev) => ({ ...prev, [key]: data.id as string }));
  }

  // 위치가 있는 행끼리 순서대로 거리 계산
  const legKm: Record<string, number> = {};
  located.forEach((s, i) => {
    if (i) legKm[s.id] = distanceKm(located[i - 1], s);
  });
  const total = Object.values(legKm).reduce((a, b) => a + b, 0);
  const inRoute = new Set(located.map(placeKey));
  const shownRecs = recs.filter((r) => !inRoute.has(placeKey(r)));
  const numberOf = Object.fromEntries(stops.map((s, i) => [s.id, i + 1]));

  const body = (
    <>
      {API_KEY ? (
        <RouteMap
          stops={located}
          numberOf={numberOf}
          recs={shownRecs}
          onAdd={canEdit ? (p) => addRow(p) : undefined}
        />
      ) : (
        <p className="notice">🗺️ Google 지도 키를 넣으면 여기에 지도와 동선이 그려져요.</p>
      )}
      {error && <p className="error">오류: {error}</p>}
      <p className="route-info">
        {!loaded ? "불러오는 중…" : stops.length ? `총 ${stops.length}곳` : "아래 '행 추가'로 동선을 짜 보세요."}
        {located.length > 1 && ` · 직선거리 합계 약 ${fmtKm(total)}km`}
      </p>

      <div className="route-table" role="table">
        <div className="rt-head" role="row">
          <span>#</span><span>종류</span><span>장소</span><span>메모</span><span />
        </div>
        {stops.map((s, i) => (
          <div className="rt-row" role="row" key={s.id}>
            <b className="no">{i + 1}</b>
            <select
              value={s.type}
              disabled={!canEdit}
              onChange={(e) => updateRow(s.id, { type: e.target.value })}
              aria-label="종류"
            >
              {Object.entries(STOP_TYPES).map(([t, icon]) => (
                <option key={t} value={t}>{icon} {t}</option>
              ))}
            </select>
            <div className="rt-place">
              {API_KEY && canEdit ? (
                <PlaceInput
                  initial={s.name}
                  onRename={(name) => name !== s.name && updateRow(s.id, { name })}
                  onPick={(p) => updateRow(s.id, p)}
                />
              ) : (
                <input
                  defaultValue={s.name}
                  readOnly={!canEdit}
                  placeholder="장소 이름"
                  aria-label="장소"
                  onBlur={(e) => e.target.value !== s.name && updateRow(s.id, { name: e.target.value })}
                />
              )}
              <small className="muted">
                {isLocated(s)
                  ? `${legKm[s.id] != null ? `이전 장소에서 ${fmtKm(legKm[s.id])}km · ` : ""}${s.address}`
                  : API_KEY && canEdit ? "장소를 검색해서 고르면 지도에 표시돼요" : ""}
              </small>
            </div>
            <input
              className="rt-memo"
              defaultValue={s.memo}
              readOnly={!canEdit}
              placeholder="시간, 메모"
              aria-label="메모"
              onBlur={(e) => e.target.value !== s.memo && updateRow(s.id, { memo: e.target.value })}
            />
            <div className="rt-actions">
              {isLocated(s) && (
                <button
                  className={`icon${saved[placeKey(s)] ? " on" : ""}`}
                  aria-label="괜찮은 장소로 저장"
                  title="괜찮은 장소로 저장 (다른 여행자에게 추천돼요)"
                  onClick={() => toggleSave(s)}
                >
                  {saved[placeKey(s)] ? "★" : "☆"}
                </button>
              )}
              {canEdit && (
                <>
                  <button className="icon" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="icon" aria-label="아래로" disabled={i === stops.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="icon" aria-label="행 삭제" title="행 삭제" onClick={() => removeRow(s)}>✕</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {canEdit && (
        <button className="secondary block add-row" disabled={!loaded} onClick={() => addRow()}>+ 행 추가</button>
      )}

      {base && (
        <div className="recs">
          <h3>
            📌{" "}
            <select value={base.id} onChange={(e) => setBaseId(e.target.value)} aria-label="추천 기준 장소">
              {located.map((s) => <option key={s.id} value={s.id}>{numberOf[s.id]}. {s.name}</option>)}
            </select>{" "}
            주변 추천 장소
          </h3>
          {!shownRecs.length ? (
            <p className="hint">아직 주변에 저장된 장소가 없어요. 좋았던 곳에 ☆를 눌러 저장하면 다른 여행자에게 추천돼요.</p>
          ) : (
            <ul className="list">
              {shownRecs.map((r) => (
                <li key={placeKey(r)}>
                  <span>
                    {STOP_TYPES[r.category] ?? "📍"} <b>{r.name}</b>{" "}
                    <small className="muted">★ {r.saves}명 저장 · {fmtKm(r.distance_km)}km</small>
                    {r.comments.length > 0 && <small className="comment">“{r.comments[0]}”</small>}
                  </span>
                  {canEdit && (
                    <button
                      className="pick"
                      onClick={() => addRow({
                        type: r.category, name: r.name, address: r.address, lat: r.lat, lng: r.lng, place_id: r.place_id,
                      })}
                    >
                      동선에 추가
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );

  return API_KEY ? <APIProvider apiKey={API_KEY} language="ko" region="KR">{body}</APIProvider> : body;
}

type MapProps = {
  stops: Located[];
  numberOf: Record<string, number>;
  recs: Recommendation[];
  onAdd?: (p: PlacePick) => void;
};

/** 상단 지도: 번호 마커 + 순서대로 잇는 동선 + 추천 장소(주황 ★) */
function RouteMap({ stops, numberOf, recs, onAdd }: MapProps) {
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const geocodingLib = useMapsLibrary("geocoding");
  const path = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
  const fitKey = path.map((p) => `${p.lat},${p.lng}`).join("|");

  // 위치가 바뀌면 전체 동선이 보이도록 맞춤
  useEffect(() => {
    if (!map || !path.length) return;
    if (path.length === 1) {
      map.panTo(path[0]);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);

  // 지도 클릭 → 그 장소로 새 행 추가
  async function handleClick(e: MapMouseEvent) {
    const { latLng, placeId } = e.detail;
    if (!latLng || !onAdd) return;
    try {
      // 지도 위 장소 아이콘을 누른 경우: 기본 정보창 대신 장소 정보를 가져와 추가
      if (placeId && placesLib) {
        e.stop();
        const place = new placesLib.Place({ id: placeId });
        await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
        onAdd({
          name: place.displayName ?? "새 장소",
          address: place.formattedAddress ?? "",
          lat: place.location?.lat() ?? latLng.lat,
          lng: place.location?.lng() ?? latLng.lng,
          place_id: placeId,
        });
        return;
      }
      let address = "";
      if (geocodingLib) {
        const { results } = await new geocodingLib.Geocoder().geocode({ location: latLng });
        address = results[0]?.formatted_address ?? "";
      }
      onAdd({ name: address.split(" ").slice(-2).join(" ") || "새 장소", address, ...latLng, place_id: null });
    } catch {
      onAdd({ name: "새 장소", address: "", ...latLng, place_id: null });
    }
  }

  return (
    <div className="map">
      <Map
        mapId={MAP_ID}
        defaultCenter={SEOUL}
        defaultZoom={5}
        gestureHandling="greedy"
        streetViewControl={false}
        mapTypeControl={false}
        onClick={handleClick}
      >
        <Polyline path={path} strokeColor="#2f80ed" strokeOpacity={0.9} strokeWeight={4} geodesic />
        {stops.map((s) => (
          <AdvancedMarker key={s.id} position={{ lat: s.lat, lng: s.lng }} title={`${numberOf[s.id]}. ${s.name}`}>
            <Pin background="#2f80ed" borderColor="#ffffff" glyphColor="#ffffff" glyphText={String(numberOf[s.id])} />
          </AdvancedMarker>
        ))}
        {recs.map((r) => (
          <AdvancedMarker
            key={`rec-${placeKey(r)}`}
            position={{ lat: r.lat, lng: r.lng }}
            title={`추천: ${r.name} (★${r.saves})${onAdd ? " · 눌러서 동선에 추가" : ""}`}
            onClick={onAdd ? () => onAdd(r) : undefined}
          >
            <Pin background="#f2994a" borderColor="#ffffff" glyphColor="#ffffff" glyphText="★" scale={0.8} />
          </AdvancedMarker>
        ))}
      </Map>
    </div>
  );
}

type PlaceInputProps = {
  initial: string;
  onRename: (name: string) => void;
  onPick: (p: PlacePick) => void;
};

/** 행 안의 장소 입력칸: 글자를 치면 Places API (New) 자동완성, 고르면 위치가 저장된다 */
function PlaceInput({ initial, onRename, onPick }: PlaceInputProps) {
  const map = useMap();
  const places = useMapsLibrary("places");
  const [query, setQuery] = useState(initial);
  const [typing, setTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([]);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!places || !typing || !query.trim()) return;
    token.current ??= new places.AutocompleteSessionToken();
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const center = map?.getCenter();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: token.current!,
          language: "ko",
          ...(center ? { locationBias: center } : {}),
        });
        if (!cancelled) setSuggestions(suggestions.flatMap((s) => (s.placePrediction ? [s.placePrediction] : [])));
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [places, map, query, typing]);

  // 입력 중일 때만 결과 표시
  const visible = typing && query.trim() ? suggestions : [];

  async function pick(p: google.maps.places.PlacePrediction) {
    setTyping(false);
    const place = p.toPlace();
    await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
    token.current = null; // 선택으로 세션 종료 → 다음 검색은 새 토큰
    if (!place.location) return;
    const name = place.displayName ?? p.mainText?.toString() ?? query;
    setQuery(name);
    onPick({
      name,
      address: place.formattedAddress ?? "",
      lat: place.location.lat(),
      lng: place.location.lng(),
      place_id: place.id,
    });
  }

  return (
    <div className="search">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setTyping(true);
        }}
        onBlur={() => {
          setTyping(false);
          onRename(query.trim());
        }}
        placeholder="장소 검색 (예: 인천국제공항)"
        aria-label="장소"
      />
      {visible.length > 0 && (
        <ul className="suggestions">
          {visible.map((p) => (
            <li key={p.placeId}>
              {/* mousedown 기본동작을 막아 입력칸 포커스를 유지 → 고르기 전에 blur 저장이 끼어들지 않음 */}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
                <b>{p.mainText?.toString()}</b>
                <small>{p.secondaryText?.toString()}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
