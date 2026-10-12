---
"@cp949/geul-react": patch
---

`uploadFile`을 등록하지 않은 편집기에서 iframe URL을 바꿀 수 없던 결함을 고친다.

- MediaToolbar: iframe 블록의 more 메뉴가 업로드 설정과 무관하게 Replace 항목을 보여 준다. 누르면 Upload 탭 없이 Iframe URL 입력이 열린다.
- MediaToolbar: image·video·audio·file 블록은 그대로다. `uploadFile`이 없으면 Replace 항목을 보여 주지 않는다.
