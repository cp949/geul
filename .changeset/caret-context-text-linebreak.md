---
"@cp949/geul-core": patch
---

`getCaretBlockContext().text`가 hardBreak와 인라인 원소를 지우던 결함을 고친다. 슬래시·이모지·mention popup이 줄바꿈 뒤 글자나 인라인 원소 뒤 글자를 질의로 이어 붙였다.

- core: `text`는 hardBreak를 `\n`으로 읽는다. 문단 `/`, 줄바꿈, `a`는 `"/\na"`다. 이전에는 `"/a"`라 슬래시 메뉴가 `{ query: "a" }`로 열렸다.
- core: hardBreak 밖의 인라인 원소(custom 인라인 원소)는 U+FFFC로 읽는다. 이전에는 빈 문자열이었다. 원소만 든 문단의 `text`는 `""`가 아니라 U+FFFC 하나다.
- core: mention 뒤에 `@a`를 치면 `text`가 U+FFFC에 `@a`가 이어 붙은 값이라 `@` 트리거가 열리지 않는다. 이전에는 picker가 열리고 후보를 확정하면 기존 mention이 지워졌다.
- core: 일반 텍스트, 마크가 붙은 텍스트, codeBlock(리터럴 `\n`)의 `text`는 그대로다. 반환 타입은 바뀌지 않는다.
- 알려진 한계: `/`·`:`·`@` 바로 뒤에 인라인 원소가 오면 질의 U+FFFC로 열리고 후보가 0건이다. 데이터를 잃지 않는다.
- 줄 첫머리 판정은 문단 전체 매치 그대로다.
