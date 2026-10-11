---
"@cp949/geul-io": patch
---

`importHtml`과 클립보드 붙여넣기가 인라인 스타일의 `font-weight`·`font-style`·`text-decoration(-line)`·`font` 선언을 Chromium과 같은 규칙으로 읽는다.

- 무효 선언은 통째로 버리고 앞의 유효 값을 지우지 않는다. `text-decoration:underline;text-decoration:foo`는 밑줄이다. 이전에는 밑줄이 꺼졌다.
- `!important`가 우선순위를 정한다. `font-weight:normal !important;font-weight:bold`는 굵지 않고, `font-weight:bold ! important`(`!`와 낱말 사이 공백)는 굵게다.
- 따옴표·괄호 안 `;`는 선언을 끝내지 않는다. `font-family:'a;font-style:italic '`는 기울임이 아니다.
- `font-style`은 값 전체를 판정한다(`italic foo` 무효). `text-decoration`은 line·style·thickness·색 문법 전체를 판정한다.
- 한계: `calc()`·`var()` thickness와 `oblique` 각도 범위는 판정하지 않는다. `color-mix()`·`lab()`·`color()`·시스템 색(`windowtext` 등)이 든 `text-decoration`은 무효로 버려 밑줄·취소선이 꺼진다. 이전에는 켜졌다.
