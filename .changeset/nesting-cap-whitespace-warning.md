---
"@cp949/geul-io": patch
---

`importHtml`이 깊이 상한(64단)의 wrapper·details에 공백뿐인 children 컨테이너가 있을 때 거짓 `NESTED_CHILDREN_FLATTENED` 경고를 내지 않는다.

- 64단 children wrapper나 토글 details의 children 컨테이너가 공백, NBSP, zero-width 문자뿐이면 이전에 `NESTED_CHILDREN_FLATTENED`가 났고 이제 경고가 없다. 문서 내용은 이전과 같다.
- 요소나 실질 텍스트가 있으면 이전처럼 경고한다.
- 한계: 빈 `<span>`·`<div>`처럼 블록이 나오지 않는 요소만 든 컨테이너는 계속 경고한다.
