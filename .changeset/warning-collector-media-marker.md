---
"@cp949/geul-io": patch
---

`importHtml`이 `data-geul-media-type="iframe"`을 단 `<a>`에 거짓 `SAFE_BLOCK_DOWNGRADED` 경고를 내지 않는다.

- iframe 블록으로 읽히는 `<a data-geul-media-type="iframe" …>`는 이전에 `SAFE_BLOCK_DOWNGRADED`(element `a`) 경고가 났고 이제 경고가 없다. 문서 내용은 이전과 같다.
- 경고 수집기가 마커 값 표와 블록 태그 이름 표를 변환기와 같은 표에서 읽는다. 다른 경고는 바뀌지 않는다.
