---
"@cp949/geul-io": patch
---

Markdown 가져오기가 CR·CRLF 줄바꿈을 LF로 읽는다.

- 이전에는 CR이 있는 소스가 거절되거나 글자가 조용히 틀어졌다.
- 거절: 문단, 목록, 인용, inlineCode, 인라인·블록 html, 맨몸 URL 뒤 줄바꿈. `MARKDOWN_DOCUMENT_INVALID`를 반환했다.
- 조용한 손상: 이미지 alt 줄바꿈의 `\r`이 `name`에 남았다. 예: `![a\r\nb](url)` -> `name`이 `a\r\nb`.
- 지금은 소스의 `\r\n`과 `\r`을 `\n`으로 바꿔 파싱한다. LF 소스와 결과가 같다.
- `\r` 외 C0 제어문자는 이전처럼 거절한다.
