---
"@cp949/geul-react": patch
---

미디어 Replace와 File Panel의 Embed에서 지금과 같은 URL을 저장하면 사용자가 정한 name이 URL 끝 segment로 덮어써지던 결함을 고친다.

- MediaToolbar: Replace의 Embed 탭에서 블록의 현재 url과 같은 URL을 저장하면 name을 바꾸지 않는다. image·video·audio·file·iframe 모두 같다.
- FilePanel: Embed에서 같은 URL을 다시 저장해도 name이 유지되고 패널의 `Name:` 표시도 현재 name을 보인다.
- 문서와 revision은 바뀌지 않는다. 사용자가 비운 name(`""`)도 그대로 남는다.
- URL이 바뀔 때는 기존대로 새 URL 끝 segment가 name 초깃값이 된다.
- 비교는 정확 일치다. 정책이 막는 iframe URL은 같은 URL이어도 거절 문구를 띄운다.
