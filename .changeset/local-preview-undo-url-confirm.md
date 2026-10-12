---
"@cp949/geul-core": patch
---

로컬 프리뷰 url 확정을 undo하면 이미 해제 통지한 blob URL이 문서에 돌아오던 결함과, 프리뷰 적용 직후 `undo()`가 거절 Result를 돌려주면서 PM 프리뷰를 지우던 결함을 고친다.

- core: `setMediaBlockUrl`, `updateBlock`, `replaceBlocks`, 업로드 완료로 url을 확정해도 `onLocalPreviewCleanup`을 즉시 부르지 않는다. 프리뷰 attrs는 그대로 정리한다.
- core: 통지는 그 URL이 undo·redo로 못 돌아올 때 1회 나간다. undo하면 프리뷰가 돌아온다. 키보드 undo도 같다.
- core: `undo()`·`redo()`는 PM이 바뀌었으면 모델 변경이 없어도 `ok`를 돌려준다. `onChange`와 revision은 그대로다. 빈 history는 `COMMAND_NOT_APPLICABLE`을 유지한다.
- core: 로컬 프리뷰 도달 판정은 pending URL이 새로 생겼거나 도달 가능성이 줄 수 있는 변경(eviction, redo 스택 소거, undo·redo)에서만 돈다. 이벤트를 쌓기만 하는 편집마다 history 시뮬레이션이 돌던 입력 지연을 없앤다.
