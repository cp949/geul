---
"@cp949/geul-react": patch
---

미디어 Replace와 File Panel의 Embed에서 지금과 같은 URL을 저장하면 "Unsupported media URL" 경고가 뜨던 결함을 고친다.

- MediaToolbar: Replace의 Embed 탭에서 블록과 url·name이 모두 같은 저장은 경고 없이 view로 돌아간다. 문서와 revision은 바뀌지 않는다.
- FilePanel: Embed에서 같은 저장을 다시 해도 경고가 없다.
- iframe 블록도 같다.
- 지원하지 않는 URL, iframe 정책 위반, 호스트 `onBeforeChange`가 거절한 저장은 거절 문구를 그대로 띄운다.
- URL이 같아도 블록 name이 URL 끝 segment와 다르면 name을 덮어쓰는 기존 동작은 바뀌지 않는다.
