export type Role = "owner" | "editor" | "viewer";

export type Trip = {
  id: string;
  user_id: string;
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  people: number;
  memo: string;
};

/** 수정 가능한 여행 필드 (DB 컬럼 권한과 같음) */
export const TRIP_FIELDS = ["title", "destination", "start_date", "end_date", "people", "memo"] as const;

export type Stop = {
  id: string;
  trip_id: string;
  position: number;
  type: string;
  name: string;
  address: string;
  /** 이름만 적고 아직 장소를 고르지 않은 행은 null */
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  memo: string;
};

export type CheckItem = {
  id: string;
  trip_id: string;
  position: number;
  text: string;
  done: boolean;
  category?: string;
};

export type BudgetItem = {
  id: string;
  trip_id: string;
  text: string;
  amount: number;
};

export type Member = {
  trip_id: string;
  user_id: string;
  role: "editor" | "viewer";
  nickname: string;
};

export type Invite = {
  code: string;
  trip_id: string;
  role: "editor" | "viewer";
};

/** nearby_places 결과 */
export type Recommendation = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_id: string | null;
  category: string;
  saves: number;
  distance_km: number;
  comments: string[];
};

export type Course = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  region: string;
  author_name: string;
  price: number;
  stop_count: number;
  created_at: string;
};

export type CourseStop = Omit<Stop, "trip_id"> & { course_id: string };
