---
"@cp949/geul-core": patch
---

업로드 진행 중 같은 id의 다른 블록으로 교체돼도 옛 업로드 결과가 새 블록을 덮어쓰던 결함을 고친다.

- core: `uploadMediaFile`·`replaceMediaBlockFile`의 경합 가드가 블록 존재 여부만 확인해, `replaceBlocks`·`updateBlock`으로 교체한 블록의 url을 옛 결과가 덮어썼다.
- core: 이제 업로드 시작 시점의 블록 type·url과 다르면 교체된 것으로 보고 success·error·cancelled 결과를 모두 무시한다.
- core: caption·name 등 url 외 속성만 바뀐 경우는 같은 블록으로 보고 결과를 적용한다.
