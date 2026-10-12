---
"@cp949/geul-core": patch
---

`replaceBlocks`가 제거 대상과 같은 id의 블록으로 교체하지 못하던 결함을 고친다.

- core: 제거 대상과 같은 id의 블록을 삽입하면 `COMMAND_NOT_APPLICABLE`로 거절됐다.
- core: 삽입 블록의 자식이 제거 대상 id를 재사용하면 그 자식이 조용히 사라졌다.
- core: 이제 제거를 id가 아니라 원래 있던 노드 기준으로 해 같은 id 교체가 성공한다.
