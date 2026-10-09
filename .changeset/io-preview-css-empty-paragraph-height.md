---
"@cp949/geul-io": patch
---

`preview.css`가 빈 문단에 한 줄 높이를 준다(Issue #322). 빈 `<p>`는 줄 상자가 없어 높이 0이었고, 에디터의 빈 줄 N개가 미리보기에서 사라졌다.

- `.geul-preview p:empty::before { content: "\200b"; }` 규칙을 추가한다. 높이는 `.geul-preview`의 `line-height`를 따른다.
- ZWSP는 대체 텍스트 구문(`/ ""`)으로 접근성 트리에서 뺀다. 이 구문을 모르는 엔진(Chrome 75)은 첫 선언만 쓴다.
- 빈 제목(`<h2></h2>`)은 이 규칙이 닿지 않아 높이 0 그대로다.
- `exportHtml()` 출력은 바뀌지 않는다. 빈 문단은 `<p …></p>` 그대로다.
- 빈 callout·인용·목록 항목 안쪽 `<p>`도 한 줄 높이를 얻는다. 내용이 있는 문단과 callout 안쪽 `<p>`의 높이·간격은 그대로다.
- `preview.css`를 쓰지 않는 소비자는 빈 문단이 높이 0인 채로 남는다. README에 대응을 적었다.
