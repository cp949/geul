---
"@cp949/geul-io": patch
---

`importHtml`과 클립보드 붙여넣기가 style 속성의 닫히지 않은 따옴표를 Chromium처럼 개행에서 끝낸다.

- 개행(LF·CR·FF, CRLF는 하나)이 닫히지 않은 따옴표를 끝낸다. 그 선언은 버리고 다음 `;`부터 선언을 다시 읽는다.
- `font-family:'a⏎;font-weight:bold`는 굵게다. 이전에는 따옴표가 입력 끝까지 이어져 굵게를 삼켰다.
- 같은 규칙이 색·배경색(`font-family:'a⏎;background-color:yellow`)과 `white-space`(`font-family:"a⏎;white-space:pre`) 선언에 적용된다.
- `&#13;` 문자 참조는 CR로 남아 따옴표를 끝낸다.
- 백슬래시 뒤 개행은 문자열을 잇는다. `font-family:'a\⏎;font-weight:bold`는 굵게가 아니다.
- VT와 U+2028은 개행이 아니다. 따옴표를 끝내지 않는다.
- 개행에서 끝난 선언은 값 판정 전에 버린다. `font-weight:bold;font:italic 12px 'a⏎`는 굵게이고 기울임이 아니다. `background:url("a⏎") red`는 배경색이 없다.
- 동작 변화: `font-family:"a⏎b";font-weight:bold`는 굵게가 아니다. 개행이 첫 문자열을 끝내고 `b"`가 새 문자열을 열어 뒤 선언을 삼킨다. 이전에는 `"a⏎b"`를 문자열 하나로 읽어 굵게였다. Chromium도 굵게가 아니다.
- 한계: 따옴표 없는 `url(` 안의 `'`·`/*`는 아직 따옴표·주석으로 읽는다(#364). 개행 뒤 이 모양은 이번 변경으로 Chromium과 달라졌다. `font-family:'a⏎url(it's);color:red`는 색이 없다. 이전에는 빨강이었다.
