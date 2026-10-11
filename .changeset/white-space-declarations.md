---
"@cp949/geul-io": patch
---

`importHtml`과 클립보드 붙여넣기가 `div`·`span`의 `white-space` 선언을 색·인라인 서식 선언과 같은 규칙으로 읽는다.

- 따옴표·괄호 안 `;`는 선언을 끝내지 않는다. `font-family:"a;white-space:pre;b"`는 `white-space` 선언이 아니라 부모 모드를 따른다. 이전에는 공백을 보존했다.
- `!important`가 우선순위를 정한다. `white-space:pre !important;white-space:normal`과 `white-space:pre ! important;white-space:normal`은 공백을 보존한다. 이전에는 접었다.
- 상속 키워드(`inherit` 등)에 붙은 `!important`도 칸을 차지한다. `white-space:inherit !important;white-space:pre`는 부모 모드를 따른다.
- 값 안 `/* */` 주석은 값을 끊지 않는다. `white-space:/*c*/pre`는 공백을 보존한다.
- 한계: 속성 이름 앞 쓰레기 글자는 무시한다. `x white-space:pre`와 `_white-space:pre`는 공백을 보존한다. `white-space:pre;_white-space:normal`은 공백을 접는다. Chromium은 이런 선언을 버린다. 이전에는 Chromium과 같았다.
- 한계: 따옴표 없는 `url(` 안의 `'`를 따옴표로 읽는다(`background:url(it's.png);white-space:pre`). 뒤 `white-space` 선언을 삼켜 부모 모드를 따른다. 이전에는 Chromium처럼 보존했다.
