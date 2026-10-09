---
"@cp949/geul-core": patch
---

`enabledBlockTypes`가 일부 타입을 막은 편집기에서 표 붙여넣기가 미처리 예외를 던지고 붙여넣기가 사라지던 결함을 고친다.

- `table`을 막은 편집기에 평문 TSV나 html 표를 붙이면 같은 클립보드의 `text/plain`이 들어간다. 이전에는 `TypeError: Schema is missing table/tableRow/tableCell nodes`가 났고 문서는 그대로였다. 탭은 문단에 못 들어가 지워진다. 평문이 없는 html 표는 문서가 바뀌지 않는다.
- 표를 허용해도 제목·목록 같은 막은 타입이 표와 섞인 클립보드(목록 항목 안 중첩 포함)는 표까지 `text/plain`으로 들어간다. 이전에는 `RangeError: Unknown node type: ...`가 났다. 허용 블록만 골라 넣지는 않는다.
- 이 물러남은 거절이 아니라서 `onPasteRejected`를 부르지 않는다.
- 막은 타입이 없는 입력, 표 셀 안 캐럿 붙여넣기와 `enabledBlockTypes` 미지정 편집기의 표 붙여넣기는 이전과 같다.
