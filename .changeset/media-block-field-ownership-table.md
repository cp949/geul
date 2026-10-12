---
"@cp949/geul-model": patch
"@cp949/geul-core": patch
---

미디어 블록 종류별 필드 소유 표를 추가하고, `getSelectionMediaBlock()`이 iframe의 `showPreview`를 `null`로 보고하게 한다.

- model: 신규 export는 `MEDIA_BLOCK_FIELDS`, `MediaOwnField`, `MediaBlockTypeWithField`, `mediaBlockTypeHasField`, `mediaBlockHasField`이다. `showPreview`·`previewWidth`·`textAlignment`·`aspectRatio`를 어느 종류가 갖는지 표 하나가 답한다.
- core: `getSelectionMediaBlock()`이 iframe에서 `showPreview: true`를 보고하던 것을 `null`로 바꾼다. iframe은 `showPreview` 필드가 없다. 같은 이유로 `file`은 원래 `null`이었다. react의 미리보기 토글은 iframe에서 이미 숨겨져 화면 변화는 없다.
