---
"@cp949/geul-core": patch
"@cp949/geul-react": patch
---

미디어·iframe 블록의 URL 적용 한 번이 undo 두 번으로 되돌아가던 결함을 고친다.

- core: `setMediaBlockUrl`과 `setIframeSrc`가 선택 인자 `name?: string`을 받는다. 지정하면 url과 name을 같은 transaction, 같은 undo 단위로 적용한다.
- core: `name`을 생략하면 name을 바꾸지 않는다. 거절된 호출은 `name`을 지정해도 문서와 history를 바꾸지 않는다.
- react: MediaToolbar의 Replace Embed 탭과 File Panel의 URL 저장이 추출한 파일명을 URL 명령 인자로 넘긴다. `setMediaBlockName`을 따로 부르지 않는다.
