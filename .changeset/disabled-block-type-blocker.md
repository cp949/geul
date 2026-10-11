---
"@cp949/geul-core": patch
---

`getBlockTypeBlocker`·`getBlockTypesBlocker`가 `enabledBlockTypes`로 막은 타입 대상에 `NOT_APPLICABLE`을 답한다.

- 막은 타입 대상은 이전에 `null`이거나 다른 구조적 사유(`LIST_CODE_MISMATCH`·`HAS_CHILDREN`·`INVALID_TEXT`·`ALL_CODE_BLOCK`)였고 이제 `NOT_APPLICABLE`이다. `setBlockType`·`setBlockTypes`는 이전에도 `COMMAND_NOT_APPLICABLE`로 거절했다.
- 질의와 명령의 판정이 같아진다. 거절 코드와 메시지는 바뀌지 않는다.
