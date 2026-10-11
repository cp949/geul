---
"@cp949/geul-io": patch
---

`importHtml`과 클립보드 붙여넣기가 `text-decoration`·`text-decoration-line`의 함수·식별자 토큰을 이름으로 읽는다. 이전에는 못 읽는 토큰이 든 값을 통째로 무효로 버려 밑줄·취소선이 꺼졌다.

- 색 함수 14개(`rgb`·`hsl`·`hwb`·`lab`·`lch`·`oklab`·`oklch`·`color`·`color-mix`·`light-dark`·`contrast-color`·`alpha` 등)를 색으로 읽는다. `text-decoration:underline lab(50 20 20)`은 밑줄이다.
- 수식 함수 10개(`calc`·`min`·`max`·`clamp`·`round`·`mod`·`rem`·`abs`·`hypot`·`-webkit-calc`)를 thickness로 읽는다. `text-decoration:underline calc(1px + 2px)`는 밑줄이다.
- 시스템 색 식별자 45개를 색으로 읽는다. `text-decoration:underline windowtext`는 밑줄이다.
- 같은 칸을 두 번 쓰거나 모르는 이름이면 무효다. `underline windowtext red`·`underline foo(1px)`는 앞의 값을 지킨다.
- `var()`·`env()`·`attr()`·`if()`는 칸을 차지하지 않는다. `underline var(--x)`는 밑줄이다. line 낱말이 하나도 없으면 선언을 버린다. `var(--d)` 하나는 앞의 값을 지킨다.
- 동작 변화: 값에 치환 함수가 있는데 다른 토큰이 무효면 앞의 밑줄·취소선을 끈다. `text-decoration:underline;text-decoration:underline foo var(--x)`는 꺼짐이다. 이전에는 밑줄이 남았다. Chromium은 인자가 정상인 치환 함수가 든 선언이 항상 앞 선언을 덮는다.
- 한계: 함수 안쪽을 검증하지 않는다. `underline calc(1)`·`underline lab(foo)`는 Chromium은 무효이고 우리는 밑줄이다.
- 한계: 치환 결과를 추적하지 않는다. `<style>`과 조상의 `--x` 정의를 읽지 않는다. 정의 없는 `underline var(--x)`는 Chromium은 꺼짐이고 우리는 밑줄이다.
- 한계: 인자가 비었거나 잘못된 치환 함수(`underline foo var()`)는 Chromium과 다르게 읽는다.
- 한계: font 경로(`font`·`font-style`·`font-weight`)의 수식 함수는 `calc`·`min`·`max`·`clamp` 넷뿐이다. 색 경로(`color`·`background-color`)의 `lab()`·`windowtext`는 무효다.
