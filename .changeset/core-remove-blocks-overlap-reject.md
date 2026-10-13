---
"@cp949/geul-core": patch
---

`removeBlocks`가 조상과 자손을 함께 받으면 인자 순서와 무관하게 거절한다.

- 조상과 자손(자식·손자 포함)을 함께 주면 `COMMAND_NOT_APPLICABLE`로 거절한다. 문서·selection·undo 단위는 바뀌지 않는다.
- 이전에는 자손을 먼저 적으면 성공했다. 이 조합은 이제 거절로 바뀐다. 호출 쪽에서 조상만 넘기거나 겹치지 않는 대상만 넘긴다.
- 같은 id를 두 번 주는 경우도 명시적으로 `COMMAND_NOT_APPLICABLE`로 거절한다.
- 존재하지 않는 id가 섞이면 이전처럼 `BLOCK_NOT_FOUND`가 먼저다.
- `replaceBlocks`의 동작은 같다. 같은 판정을 공유한다.
