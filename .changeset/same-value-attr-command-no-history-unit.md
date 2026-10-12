---
"@cp949/geul-core": patch
---

같은 값을 다시 적용한 속성 명령이 빈 undo 단위를 남겨 다음 undo를 삼키던 결함을 고친다.

- core: 현재와 같은 값을 받은 속성 명령이 dispatch 전에 `COMMAND_NOT_APPLICABLE`을 반환한다. 반환값은 이전과 같고 undo 한 번이 직전의 실제 변경을 되돌린다.
- core: 대상은 `setMediaBlockUrl`, `setMediaBlockName`, `setMediaBlockCaption`, `setMediaBlockBackgroundColor`, `setIframeSrc`, `setMediaPreviewWidth`, `setMediaShowPreview`, `setMediaTextAlignment`, `setBlockTextColor`, `setBlockBackgroundColor`, `setBlockTextAlignment`, `setCodeBlockWrap`, `setCodeBlockCaption`, `setCalloutIcon`이다.
- core: 값 검증이 no-op 판정보다 먼저다. 막힌 iframe URL을 같은 값으로 재적용하면 기존처럼 `IFRAME_URL_NOT_ALLOWED`가 나간다.
- core: 업로드 콜백이 현재와 같은 `url`(및 `name`)을 돌려주면 `uploadMediaFile`·`replaceMediaBlockFile`이 문서를 바꾸지 않는다. 결과는 이전과 같이 `ok`다.
