---
"@cp949/geul-io": patch
---

`importHtml`의 codeBlock 메타 경고와 벗겨지는 `font`·`mark` 속성 경고를 변환기가 낸다.

- codeBlock이 되는 `pre`와 그 첫 직속 `code`의 `data-language`·`class`·`data-geul-block-id`·`data-geul-code-wrap`만 보존으로 본다.
- codeBlock `pre` 안에서 버려지는 메타를 `UNSAFE_ATTRIBUTE_REMOVED`로 새로 경고한다. 안쪽 `pre`, 두 번째 직속 `code`, `<pre><span><code>`의 `code`가 그렇다. 이전에는 경고가 없었다.
- 블록을 품어 벗겨지는 `font`·`mark`의 `color`·`style` 경고는 그대로 난다. 순서는 수집기 경고 뒤로 간다.
- 블록이 sanitize로 사라진 `font`(`<font color="red"><object><p>x</p></object></font>`)는 색을 읽어 `color` 경고가 없다. 이전 경고는 거짓이었다.
- sanitize가 자식째 지운 `object`·`svg`·`math` 안의 codeBlock 메타와 벗겨질 `font`·`mark` 속성은 따로 경고하지 않는다. 요소 제거 경고 하나로 보고한다.
- 블록 강등 경고(`SAFE_BLOCK_DOWNGRADED`)는 바뀌지 않는다.
