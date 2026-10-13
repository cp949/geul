---
"@cp949/geul-io": patch
---

Markdown 가져오기가 맨몸 URL·www·이메일을 link 마크로 만들던 문제를 고친다.

- GFM autolink literal은 link 없이 평문으로 들어온다. 글자는 그대로다.
- 이전에는 평문 URL을 내보내고 다시 가져오면 link 마크가 새로 붙었다. 경고는 없었다.
- href가 무효인 맨몸 입력(예: `http://.` 뒤 NBSP)이 `importMarkdown` 실패를 일으키던 문제도 사라진다.
- `[text](url)`, `<url>`, 참조 링크는 이전처럼 link다.
- 클립보드 Markdown 붙여넣기(`detectMarkdownPaste`)도 같은 경로라 맨몸 URL이 link가 되지 않는다.
