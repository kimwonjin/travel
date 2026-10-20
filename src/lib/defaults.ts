export const STOP_TYPES: Record<string, string> = {
  집: "🏠",
  공항: "✈️",
  숙소: "🏨",
  관광지: "📍",
  식당: "🍴",
  기타: "⭐",
};

/** 새 여행의 첫 동선 행 */
export const DEFAULT_STOPS = [
  { type: "집", name: "" },
  { type: "공항", name: "" },
];

export const DEFAULT_CHECKLIST = [
  "여권 유효기간 확인 (6개월 이상)",
  "항공권 예약",
  "숙소 예약",
  "여행자 보험 가입",
  "환전 / 해외결제 카드 준비",
  "비자 / 입국 서류 확인",
  "로밍 또는 eSIM 준비",
  "공항 이동 계획",
];

export const DEFAULT_PACKING: Record<string, string[]> = {
  "서류/결제": ["여권", "항공권(e-ticket)", "카드/현금"],
  의류: ["속옷/양말", "상의", "하의", "잠옷"],
  "세면/위생": ["칫솔/치약", "세안용품", "상비약"],
  전자기기: ["휴대폰 충전기", "보조배터리", "멀티 어댑터"],
};

export const PACKING_CATEGORIES = Object.keys(DEFAULT_PACKING);
