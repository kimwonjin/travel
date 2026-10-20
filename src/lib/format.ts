type LatLng = { lat: number; lng: number };

/** 두 지점 사이 직선(대원) 거리, km */
export function distanceKm(a: LatLng, b: LatLng): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export const fmtKm = (d: number) => (d < 10 ? d.toFixed(1) : Math.round(d).toLocaleString("ko-KR"));
export const won = (n: number) => n.toLocaleString("ko-KR");

/** 출발일 기준 D-day 문구 */
export function dday(start: string | null): string {
  if (!start) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((new Date(start + "T00:00:00").getTime() - today.getTime()) / 864e5);
  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-DAY 🎉";
  return `D+${-days}`;
}
