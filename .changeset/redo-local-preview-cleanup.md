---
"@cp949/geul-core": patch
---

복제·삽입한 로컬 프리뷰 미디어를 undo한 뒤 redo하면 이미 해제된 blob URL을 가진 블록이 되살아나던 결함을 고친다.

- core: undo만 보고 복구 불가로 판정해 정리를 바로 통지했다.
- core: redo로 되살아난 블록의 프리뷰가 깨졌다.
- core: 이제 undo로도 redo로도 되돌릴 수 없을 때만 정리를 통지한다.
