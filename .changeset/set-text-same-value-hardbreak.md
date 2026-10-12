---
"@cp949/geul-core": patch
---

`setText`의 같은 값 판정이 hardBreak와 인라인 원소를 보지 못해 빈 undo 단위를 남기거나 실제 변경을 거절하던 결함을 고친다.

- core: 줄바꿈이 든 같은 텍스트를 다시 적용하면 dispatch 전에 `COMMAND_NOT_APPLICABLE`을 반환한다. history·문서·change event가 바뀌지 않고 undo 한 번이 직전의 실제 변경을 되돌린다.
- core: 줄바꿈만 지우거나 인라인 custom 원소만 지우는 `setText`는 이전에 거절됐고 이제 적용된다.
- core: 판정은 hardBreak를 `\n`으로 읽은 텍스트 비교다. 텍스트·hardBreak 밖의 인라인 원소가 있으면 항상 다름이다. 마크는 보지 않는다.
- 값 검증이 no-op 판정보다 먼저다. `BLOCK_NOT_FOUND` 등 기존 에러 우선순위는 그대로다.
