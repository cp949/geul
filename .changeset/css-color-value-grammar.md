---
"@cp949/geul-io": patch
---

`color`·`background-color`·`background` 값을 CSS 문법대로 읽도록 고친다.

- `importHtml`과 클립보드 표 파서가 색 이름(`red`, `rebeccapurple`), 3·4·8자리 hex, `rgb()`·`rgba()`의 공백 문법·%·소수, `hsl()`·`hsla()`·`hwb()`를 읽는다. Word·Outlook·Excel HTML의 `color:red`, `background:yellow`가 색을 유지한다.
- `!important`와 `/* */` 주석을 처리하고, 나중 선언이 `inherit`·`transparent`면 앞 값을 지운다. 문법이 틀린 선언은 버리고 앞 값을 유지한다.
- `background` 줄임 속성에서 `url()`·`no-repeat` 같은 다른 토큰 옆의 색을 읽는다. 색이 없는 줄임 속성은 앞 `background-color`를 지운다.
- 반투명 색(`rgba(255,0,0,0.5)`, `#ff000080`)과 투명은 색 마크를 만들지 않는다. 이전에는 alpha를 버리고 불투명 색으로 읽었다.
- 선언을 괄호·따옴표 밖 `;`에서 잘라 `url(data:...;base64,...)` 뒤의 색도 읽는다.
- `lab()`·`oklch()`·`color()`·`color-mix()`·`var()`·`calc()`·시스템 색은 읽지 않는다.
