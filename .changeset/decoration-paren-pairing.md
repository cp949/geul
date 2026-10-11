---
"@cp949/geul-io": patch
---

`importHtml`과 클립보드 붙여넣기가 `text-decoration`·`text-decoration-line`의 함수 토큰에서 괄호 짝을 본다. 이전에는 토큰이 `)`로 끝나는지만 보아 괄호가 안 맞는 값을 잘못 읽었다.

- 바깥 `)`가 든 값은 무효라 앞의 밑줄·취소선을 지킨다. `text-decoration:underline calc(1px))`·`underline rgb(0,0,0))`는 앞의 값을 지킨다. 이전에는 밑줄이 켜졌다.
- `)` 뒤에 글자가 붙은 함수 토큰은 무효다. `underline calc(1px)foo(2px)`·`underline calc(1px)calc(2px)`는 앞의 값을 지킨다.
- 치환 함수가 있어도 바깥 `)`는 꺼짐이 아니라 무효다. `underline var(--x))`·`underline red var(--x))`는 앞의 값을 지킨다. 이전에는 `var(--x))`를 치환 토큰으로 건너뛰었다.
- `)` 뒤에 글자가 붙은 치환 `underline var(--x)foo(1)`과 열린 치환 `underline var(--x`는 치환 토큰이 아니다. 값에 치환 함수가 있어 꺼짐이다.
- 닫히지 않은 함수 토큰은 값 끝에서 닫은 것으로 읽는다. `underline lab(50 20 20`·`underline calc(1px`은 밑줄이다. 이전에는 무효였다.
- 한계: 따옴표와 `\` 이스케이프 안의 괄호도 센다.
- 한계: 인자 개수와 열린 괄호 안 낱말을 검증하지 않는다. `underline rgb(0, 0`은 Chromium은 무효이고 우리는 밑줄이다.
- 한계: 열린 `underline var(--x`는 칸 없이 꺼짐이다. Chromium은 `--x`가 정의돼 있으면 밑줄이다.
- 한계: 열린 함수 안의 치환 함수는 이름만 본다. `underline calc(var(--x)`는 Chromium은 꺼짐이고 우리는 밑줄이다.
- 한계: `)` 바로 뒤에 공백 없이 붙은 유효 토큰도 무효로 본다. `underline calc(1px)red`는 Chromium은 밑줄이고 우리는 앞의 값을 지킨다.
