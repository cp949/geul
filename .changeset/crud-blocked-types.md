---
"@cp949/geul-core": patch
---

`enabledBlockTypes`가 막은 타입을 `insertBlocks`·`replaceBlocks`·`updateBlock`에 넘기면 `RangeError`를 던지던 결함을 고친다.

- 막은 타입이 블록 자체나 중첩 `children` 안에 있으면 `{ ok: false, error: { code: "EDITOR_FEATURE_UNAVAILABLE", message } }`를 돌려준다. 이전에는 `RangeError: Unknown node type: ...`가 났다.
- `deny`·`allow` 모드 모두 같다.
- 거절하면 문서와 undo 스택이 바뀌지 않는다.
- 메시지는 `initialDocument`·`replaceDocument` 거절과 같은 형식이다.
- `updateBlock`의 타입 변경은 이전과 같이 `COMMAND_NOT_APPLICABLE`이다.
- 막은 타입이 없는 입력, 허용 타입 삽입·교체, `removeBlocks`·`moveBlocksUp/Down`과 `enabledBlockTypes` 미지정 편집기는 이전과 같다.
