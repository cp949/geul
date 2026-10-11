---
"@cp949/geul-io": patch
---

`importHtml`과 클립보드 붙여넣기가 style 속성의 따옴표 없는 `url(`을 Chromium처럼 url 토큰으로 읽는다. 이전에는 안의 `'`·`/*`·`[`·`{`가 따옴표·주석·블록을 열어 뒤 선언을 삼켰다.

- `)`까지 한 덩어리다. `background:url(it's.png);color:red`는 빨강, `background:url(a/*b);color:red`도 빨강이다. `background:url(it's.png);font-weight:bold`는 굵게, `background:url(it's.png);white-space:pre`는 공백 보존이다.
- 안의 짝 없는 `[`·`{`는 블록이 아니다. `font-family:url(a[);font-weight:bold`는 굵게, `background:url(a[) red;font-weight:bold`는 배경 빨강·굵게다. #365 직후에는 둘 다 뒤 선언을 잃었다.
- 개행이 끝낸 따옴표 뒤도 같다. `font-family:'a⏎url(it's);color:red`는 빨강이다. #362 직후에는 색이 없었다.
- `url(` 뒤 공백은 건너뛴다. 다음 글자가 따옴표면 보통 함수 블록이라 따옴표 안 `;`가 선언을 끝내지 않는다. `color:red;background:url( 'a;color:blue' )`는 빨강이다. 그 밖의 글자면 토큰이다. `background:url( it's.png);color:red`는 빨강이다.
- 이름은 대소문자를 구분하지 않는다. `URL(it's)`·`Url(it's)`가 같다. 앞 글자가 이름 글자(a–z, A–Z, 0–9, `-`, `_`, NUL, 비ASCII)·`#`·`@`이거나 이스케이프된 글자이면 url 함수가 아니다. `myurl(it's)`·`#url(it's)`·`-url(it's)`·`1url(it's)`·`a\ url(it's)`·`\)url(it's)`는 따옴표를 열어 뒤 선언을 삼킨다. `\url(it's)` 단독은 `\u`가 u라서 url 함수다.
- 이스케이프된 `)`는 토큰을 닫지 않는다. 토큰 안 `;`는 선언을 끝내지 않는다. `background:url(;color:red);font-weight:bold`는 굵게다. 닫히지 않은 토큰은 입력 끝까지 한 선언이다. `background:url(;font-weight:bold`는 굵게가 아니다.
- 한계: 값 판독기는 bad url을 모른다. Chromium은 `url(it's.png)`처럼 따옴표·`(`·가운데 공백이 든 url을 bad-url로 보고 그 선언을 통째로 버린다. `color:red;background-color:blue;background:url(it's.png)`는 Chromium이 배경 파랑이고 우리는 배경을 지운다. `background:url(it's.png) red`는 Chromium이 배경 없음이고 우리는 빨강이다.
- 한계: 이름 안의 이스케이프는 읽지 않는다. `\75rl(it's)`·`u\rl(it's)`는 Chromium이 url로 읽고 우리는 아니다. `\31 url(it's)`는 Chromium이 url이 아니고 우리는 url로 읽는다.
