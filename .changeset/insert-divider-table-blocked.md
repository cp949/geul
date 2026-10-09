---
"@cp949/geul-core": patch
---

`enabledBlockTypes`가 막은 `divider`·`table`을 `insertDivider`·`insertTable`·`pasteTabularData`로 넣으면 `TypeError`를 던지던 결함을 고친다.

- `{ ok: false, error: { code: "EDITOR_FEATURE_UNAVAILABLE", message } }`를 돌려준다. 이전에는 `TypeError: Schema is missing table/tableRow/tableCell nodes` 등이 났다.
- `deny`·`allow` 모드 모두 같고 `clearAfterBlockText` 옵션을 줘도 같다.
- `divider`를 허용해도 `paragraph`를 막은 설정의 `insertDivider`는 `paragraph` 이름으로 거절한다.
- 거절하면 문서와 undo 스택이 바뀌지 않는다.
- 메시지는 `Block type "<type>" is disabled via CreateEditorOptions.enabledBlockTypes` 형식이다.
- 허용 타입 삽입, 다른 쪽 타입만 막은 설정, `enabledBlockTypes` 미지정 편집기는 이전과 같다.
