---
"@cp949/geul-io": patch
---

중첩 `span`의 색이 바깥 `span` 색으로 읽히던 결함을 고친다.

- `importHtml`이 `<span style="color:#ff0000"><span style="color:#0000ff">x</span></span>`를 `x`(#0000FF)로 읽는다. 이전에는 바깥 색 #FF0000이었다. 브라우저 렌더링과 같다.
- `<span red>a<span blue>x</span>b</span>`는 `a`(#FF0000), `x`(#0000FF), `b`(#FF0000) 세 조각이다. `background-color`도 같다.
- 안쪽 색이 읽지 못하는 값(`lab()`·`var()` 등)이거나 색을 정하지 않는 값(`transparent`·`inherit`·반투명)이면 바깥 색이 남는다.
- 안쪽 `background-color:rgba(0,0,0,0)`은 바깥 배경을 덮지 않는다.
