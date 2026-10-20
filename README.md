# 여행 준비 앱

지도 위에 `1. 공항 → 2. 숙소 → 3. 관광지…` 순서로 동선을 그리며 여행을 준비하는 웹앱입니다.

- **동선 지도**: 장소 검색(자동완성) 또는 지도 클릭으로 지점 추가 → 번호 마커와 동선 표시, 순서 변경, 구간 거리
- **여행 정보 / D-day**, **준비 체크리스트**, **짐 목록**, **예산**(1인당 금액)

## 기술 스택

| 구분 | 사용 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, TypeScript) |
| 지도 | Google Maps JavaScript API + `@vis.gl/react-google-maps` |
| 장소 검색 | Places API (New) 자동완성, Geocoding API |
| 데이터 | Supabase (Postgres + 익명 로그인 + RLS) |

## 설정

### 1. Supabase
1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. SQL Editor에서 `supabase/migrations/0001_init.sql` 실행 (또는 `supabase db push`)
3. Authentication → Sign In / Providers → **Allow anonymous sign-ins** 켜기
4. Project Settings → API 에서 URL과 Publishable key 확인

### 2. Google Maps
1. Google Cloud Console에서 프로젝트 생성 후 결제 계정 연결
2. **Maps JavaScript API**, **Places API (New)**, **Geocoding API** 사용 설정
3. API 키 발급 (HTTP 리퍼러로 도메인 제한 권장)
4. (선택) Map Management에서 Map ID 생성 — 없으면 `DEMO_MAP_ID` 사용

### 3. 환경 변수
```
cp .env.example .env.local   # 값 입력
```

## 실행
```
npm install
npm run dev     # http://localhost:3000
```

## 구조
```
src/app/              페이지, 전역 스타일
src/components/
  TravelApp.tsx       익명 로그인, 여행 불러오기/생성, 탭
  RouteTab.tsx        Google 지도 + 동선 + 장소 검색
  InfoTab.tsx / CheckList.tsx / BudgetTab.tsx
src/lib/              Supabase 클라이언트, 타입, 기본값, 거리 계산
supabase/migrations/  DB 스키마와 RLS 정책
```
