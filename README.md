# 여행 준비 웹사이트

여행 정보, 준비 체크리스트, 짐 목록, 일정, 예산을 한곳에서 관리하는 정적 웹사이트입니다.
빌드 과정 없이 `index.html`을 브라우저로 열면 동작하며, 데이터는 브라우저 localStorage에 저장됩니다.

## 실행

```
python3 -m http.server 8000   # http://localhost:8000
```

## 구조

- `index.html` — 화면 구조
- `style.css` — 스타일 (다크모드, 모바일 대응)
- `app.js` — 상태 관리 및 렌더링
