---
"@cp949/geul-core": patch
---

`duplicateBlock` 복제본이 원본의 로컬 프리뷰 blob URL을 공유하던 결함을 고친다.

- core: 복제본이 원본과 같은 URL을 가졌다.
- core: 한쪽이 정리되면 다른 쪽 프리뷰가 깨졌다.
- core: 이제 복제본(하위 블록 포함)이 같은 파일로 새 URL을 받는다.
