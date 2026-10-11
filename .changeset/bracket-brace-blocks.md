---
"@cp949/geul-io": patch
---

`importHtml`과 클립보드 붙여넣기가 style 속성의 `(`·`[`·`{` 블록을 Chromium처럼 종류별로 센다.

- 블록 안의 `;`는 선언을 끝내지 않는다. `font-family:[;font-weight:bold`는 굵게가 아니다. 이전에는 굵게였다.
- 짝 맞는 닫는 글자만 블록을 닫는다. `font-family:[);font-weight:bold`는 굵게가 아니다. `font-family:[)];font-weight:bold`는 굵게다.
- 블록 밖 닫는 글자는 무시한다. `font-family:a];font-weight:bold`는 굵게다.
- 블록 안에서도 따옴표·주석·이스케이프는 그대로 읽는다. `font-family:[']';font-weight:bold`는 굵게가 아니다. `font-family:\[;font-weight:bold`는 굵게다.
- 개행이 끝낸 따옴표 뒤의 블록도 같다. `font-family:'a⏎[;font-weight:bold`는 굵게가 아니다.
- 같은 규칙이 색·배경색(`font-family:'a⏎[;background-color:yellow`)과 `white-space`(`font-family:'a⏎[;white-space:pre`) 선언에 적용된다.
- 동작 변화: `(` 안의 다른 블록에 든 `)`는 `(`를 닫지 않는다. `font-family:([)];font-weight:bold`는 굵게가 아니다. 이전에는 굵게였다. Chromium도 굵게가 아니다.
- 한계: 따옴표 없는 `url(` 안의 짝 없는 `[`·`{`도 블록으로 센다(#364). 이 모양은 이번 변경으로 Chromium과 달라졌다. `font-family:url(a[);font-weight:bold`는 굵게가 아니다. 이전에는 굵게였다.
- 한계: 속성 이름 앞 쓰레기 글자는 무시한다. `font-weight:bold;}color:red`는 빨강이다. Chromium은 color 선언을 버린다.
