---
"@cp949/geul-io": patch
---

`importHtml`과 클립보드 붙여넣기가 `text-decoration`·`text-decoration-line`의 사용자 정의 함수 호출(`--f(…)`)을 꺼짐으로 읽는다. 이전에는 모르는 함수 토큰으로 보아 선언을 무효로 버렸다. 앞 선언의 밑줄·취소선이 남았다.

- 호출이 값 어디에 있든 앞의 밑줄·취소선을 끈다. `text-decoration:underline --f(1px)`·`underline --f()`·`underline red --f(1px)`·`--f(1px)`가 꺼짐이다. 이전에는 앞의 값을 지켰다.
- 호출 위치, 앞뒤 토큰의 유효 여부, 괄호 닫힘 여부를 보지 않는다. `foo --f(1px)`·`underline calc(--f(1px))`·`underline --f(1px)red`·`underline --f(`도 꺼짐이다.
- 호출은 이름 글자 run이 `--`로 시작하고 길이가 3 이상이며 바로 뒤가 `(`인 경우다. `underline ---f(1px)`·`underline --1(1px)`은 꺼짐이다. `underline --(1px)`·`underline --f (1px)`·`underline foo--f(1px)`는 호출이 아니라 앞의 값을 지킨다.
- run 바로 앞 글자가 `!`·`#`·`@`·`{`·`}`·`]`·따옴표·비ASCII 글자이면 호출이 아니다. `underline #--f(1px)`·`underline é--f(1px)`·`underline "--f(1px)"`는 앞의 값을 지킨다.
- 깊이 0의 바깥 `)`가 있으면 호출이 있어도 무효다. `underline --f(1px))`는 앞의 값을 지킨다.
- 동작 변화: `underline var(--x(1))`은 꺼짐이다. 이전에는 `var(…)` 치환 토큰으로 읽어 밑줄이었다. Chromium은 무효다.
- 이유: `@function` 정의는 스타일시트에만 둘 수 있고 `importHtml`은 `<style>`을 읽지 않는다. 클립보드 입력의 호출은 늘 미정의라 Chromium 결과가 늘 꺼짐이다.
- 한계: 이름은 ASCII 글자만 읽는다. `underline --é(1px)`는 Chromium은 꺼짐이고 우리는 앞의 값을 지킨다.
- 한계: 따옴표 안 낱말, `{}` 블록 안, `url(`·`env(`·`attr(` 인자의 호출을 구분하지 않는다. `underline "a --f(1px)"`·`underline {a --f(1px)}`·`underline url(--f(1px))`는 Chromium은 무효이고 우리는 꺼짐이다. 따옴표 안의 `)`는 바깥 `)`로 센다. `underline --f("a)")`는 Chromium은 꺼짐이고 우리는 앞의 값을 지킨다.
- 한계: `underline var(--x, --f(1px))`는 `--x`가 정의돼 있으면 Chromium은 밑줄이다. 우리는 `--x` 정의를 읽지 않아 꺼짐이다.
