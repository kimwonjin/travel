"use client";

import type { Trip } from "@/lib/types";

type Props = { trip: Trip; onChange: (patch: Partial<Trip>) => void; readOnly?: boolean };

export default function InfoTab({ trip, onChange, readOnly }: Props) {
  return (
    <form className="grid" onSubmit={(e) => e.preventDefault()}>
      <fieldset disabled={readOnly} className="grid wide">
        <label className="wide">
          여행 이름
          <input value={trip.title} onChange={(e) => onChange({ title: e.target.value })} />
        </label>
        <label>
          여행지
          <input value={trip.destination} placeholder="예: 도쿄" onChange={(e) => onChange({ destination: e.target.value })} />
        </label>
        <label>
          인원
          <input
            type="number"
            min={1}
            value={trip.people}
            onChange={(e) => onChange({ people: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label>
          출발일
          <input type="date" value={trip.start_date ?? ""} onChange={(e) => onChange({ start_date: e.target.value || null })} />
        </label>
        <label>
          도착일
          <input type="date" value={trip.end_date ?? ""} onChange={(e) => onChange({ end_date: e.target.value || null })} />
        </label>
        <label className="wide">
          메모
          <textarea
            rows={3}
            value={trip.memo}
            placeholder="숙소, 항공편 번호 등"
            onChange={(e) => onChange({ memo: e.target.value })}
          />
        </label>
      </fieldset>
    </form>
  );
}
