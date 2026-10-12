---
"@cp949/geul-core": patch
---

블록이 문서에 남은 채 로컬 프리뷰 blob URL만 빠지는 경로에서 URL이 통지 없이 새던 결함을 고친다.

- core: 로컬 프리뷰 정리 통지의 추적 단위를 `blockId`에서 URL로 바꾼다. `replaceBlocks` 재삽입, 삭제 뒤 같은 id 재삽입, 프리뷰 재업로드, 프리뷰 적용 undo 뒤 redo 소거에서 문서와 history 어디에도 없는 URL을 `onLocalPreviewCleanup`으로 통지한다. 같은 id가 미디어가 아닌 타입으로 바뀐 경우도 포함한다.
- core: `replaceBlocks`가 같은 id로 다시 넣은 미디어의 로컬 프리뷰를 `updateBlock`과 같은 규칙으로 이어받는다. 교체 블록에 `url`이 있으면 프리뷰를 정리한다. 통지는 도달 불가 때 낸다(Issue #382).
- core: 통지는 URL당 한 번이다. url 확정, `destroy()` 스윕 등 즉시 통지 경로와 겹쳐도 같은 URL을 두 번 알리지 않는다.
