---
"@cp949/geul-io": minor
"@cp949/geul-core": patch
---

표가 든 `text/html` 붙여넣기도 호스트의 `iframeEmbed` 설정으로 표 옆 `iframe` 블록의 url을 판정한다.

- io: `parseClipboardTable` 입력에 선택 필드 `iframeEmbed?: IframeEmbedConfig`를 더한다. 추가형이라 기존 호출은 그대로다. 필드를 주지 않으면 이전처럼 url 없는 `iframe` 블록이다.
- core: `TablePasteExtension`이 편집기 옵션 `iframeEmbed`를 `parseClipboardTable`에 넘긴다. 이전에는 표 없는 붙여넣기만 호스트 설정을 따라 같은 `iframe`이 표 유무에 따라 다르게 판정됐다.
