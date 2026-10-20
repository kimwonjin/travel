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
import type { Stop } from "@/lib/types";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";
const SEOUL = { lat: 37.5665, lng: 126.978 };

type NewStop = Pick<Stop, "name" | "address" | "lat" | "lng" | "place_id">;

export default function RouteTab({ tripId }: { tripId: string }) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [type, setType] = useState("관광지");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db().from("stops").select("*").eq("trip_id", tripId).order("position")
      .then(({ data, error }) => (error ? setError(error.message) : setStops(data as Stop[])));
  }, [tripId]);

  async function addStop(s: NewStop) {
    const position = stops.length ? stops[stops.length - 1].position + 1 : 0;
    const { data, error } = await db().from("stops")
      .insert({ ...s, trip_id: tripId, type, position }).select().single();
    if (error) return setError(error.message);
    setStops((prev) => [...prev, data as Stop]);
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

  async function rename(stop: Stop, name: string) {
    if (!name.trim() || name === stop.name) return;
    setStops(stops.map((s) => (s.id === stop.id ? { ...s, name } : s)));
    const { error } = await db().from("stops").update({ name }).eq("id", stop.id);
    if (error) setError(error.message);
  }

  async function remove(stop: Stop) {
    setStops(stops.filter((s) => s.id !== stop.id));
    const { error } = await db().from("stops").delete().eq("id", stop.id);
    if (error) setError(error.message);
  }

  if (!API_KEY) {
    return (
      <p className="notice">
        Google Maps API 키가 필요해요. <code>.env.local</code>에 <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>를 설정해 주세요.
      </p>
    );
  }

  const legs = stops.map((s, i) => (i ? distanceKm(stops[i - 1], s) : 0));
  const total = legs.reduce((a, b) => a + b, 0);

  return (
    <APIProvider apiKey={API_KEY} language="ko" region="KR">
      <RouteMap stops={stops} onMapClick={addStop} />
      {error && <p className="error">오류: {error}</p>}
      <p className="route-info">
        {stops.length
          ? `총 ${stops.length}곳 · 직선거리 합계 약 ${fmtKm(total)}km`
          : "장소를 검색하거나 지도를 클릭해 동선을 만들어 보세요."}
      </p>

      <div className="add">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="장소 종류">
          {Object.entries(STOP_TYPES).map(([t, icon]) => (
            <option key={t} value={t}>{icon} {t}</option>
          ))}
        </select>
        <PlaceSearch onPick={addStop} />
      </div>
      <p className="hint">지도에서 장소(가게, 관광지 아이콘)나 아무 곳을 클릭해도 추가돼요.</p>

      <ol className="stops">
        {stops.map((s, i) => (
          <li key={s.id}>
            <b className="no">{i + 1}</b>
            <div className="stop-main">
              <input className="stop-name" defaultValue={s.name} onBlur={(e) => rename(s, e.target.value)} />
              <small>
                {STOP_TYPES[s.type] ?? ""} {s.type}
                {i > 0 && ` · 이전 지점에서 ${fmtKm(legs[i])}km`}
                {s.address && ` · ${s.address}`}
              </small>
            </div>
            <button className="icon" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="icon" aria-label="아래로" disabled={i === stops.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="icon" aria-label="삭제" onClick={() => remove(s)}>✕</button>
          </li>
        ))}
      </ol>
    </APIProvider>
  );
}

/** 상단 지도: 번호 마커 + 순서대로 잇는 동선 */
function RouteMap({ stops, onMapClick }: { stops: Stop[]; onMapClick: (s: NewStop) => void }) {
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const geocodingLib = useMapsLibrary("geocoding");
  const path = stops.map((s) => ({ lat: s.lat, lng: s.lng }));

  // 지점 수가 바뀌면 전체 동선이 보이도록 맞춤
  useEffect(() => {
    if (!map || !stops.length) return;
    if (stops.length === 1) {
      map.panTo(path[0]);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, stops.length]);

  async function handleClick(e: MapMouseEvent) {
    const { latLng, placeId } = e.detail;
    if (!latLng) return;
    try {
      // 지도 위 장소 아이콘을 누른 경우: 기본 정보창 대신 장소 정보를 가져와 추가
      if (placeId && placesLib) {
        e.stop();
        const place = new placesLib.Place({ id: placeId });
        await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
        onMapClick({
          name: place.displayName ?? "새 지점",
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
      onMapClick({ name: address.split(" ").slice(-2).join(" ") || "새 지점", address, ...latLng, place_id: null });
    } catch {
      onMapClick({ name: "새 지점", address: "", ...latLng, place_id: null });
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
        {stops.map((s, i) => (
          <AdvancedMarker key={s.id} position={{ lat: s.lat, lng: s.lng }} title={`${i + 1}. ${s.name}`}>
            <Pin background="#2f80ed" borderColor="#ffffff" glyphColor="#ffffff" glyphText={String(i + 1)} />
          </AdvancedMarker>
        ))}
      </Map>
    </div>
  );
}

/** Places API (New) 자동완성 검색 */
function PlaceSearch({ onPick }: { onPick: (s: NewStop) => void }) {
  const map = useMap();
  const places = useMapsLibrary("places");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([]);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!places || !query.trim()) return;
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
  }, [places, map, query]);

  // 검색어를 지우면 이전 결과는 숨김
  const visible = query.trim() ? suggestions : [];

  async function pick(p: google.maps.places.PlacePrediction) {
    const place = p.toPlace();
    await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
    token.current = null; // 선택으로 세션 종료 → 다음 검색은 새 토큰
    setQuery("");
    setSuggestions([]);
    if (!place.location) return;
    onPick({
      name: place.displayName ?? p.mainText?.toString() ?? "",
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
        onChange={(e) => setQuery(e.target.value)}
        placeholder="장소 검색 (예: 인천국제공항, 센소지)"
        aria-label="장소 검색"
      />
      {visible.length > 0 && (
        <ul className="suggestions">
          {visible.map((p) => (
            <li key={p.placeId}>
              <button type="button" onClick={() => pick(p)}>
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
