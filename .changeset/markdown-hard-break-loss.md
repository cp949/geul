---
"@cp949/geul-io": patch
---

Markdown 내보내기가 보존하지 못하는 hardBreak(`\n`)를 손실로 보고한다.

- 블록 끝, `bold`·`italic`·`strike` 런 끝, 제목 3–6 안쪽의 `\n`이 대상이다.
- `strict`는 `MARKDOWN_LOSS_NOT_ALLOWED`로 거절한다. `lossy`는 새 손실 kind `HARD_BREAK_LOST`를 블록당 1건 보고한다.
- 이전에는 경고 없이 글자가 바뀌었다. `a\n`은 `a\`로 나가 개행이 사라졌다. `**a\n**`은 `**a\&#xA;**`로 나가 글자가 `a&#xA;`가 됐다.
- 표 셀, 중간·시작 개행, `link`만 달린 런, `code` 런, 제목 1·2 안쪽은 대상이 아니다. 출력도 그대로다.
- 제목 1·2도 글자가 전부 개행뿐이면 대상이다. ATX 제목으로 나가 개행이 공백이 된다. 출력은 그대로다.
- 정리하면 빈 content가 되는 컨테이너(`\n`뿐인 목록 항목·quote)는 빈 content와 같은 구조 경고를 낸다. `NESTED_CHILDREN`·`CHECKED_STATE_LOST`다. 이전에는 구조가 깨진 출력이 나갔다.
- `lossy` 출력이 바뀌는 입력:
  - 블록 끝 `\n`은 전부 지워진다. 예: `a\n` -> `a`, `a\n\n` -> `a`.
  - `bold`·`italic`·`strike` 런 끝 `\n`은 mark 밖 평문 개행이 된다. 예: `**a\n**`+`b` -> `**a**`, 개행, `b`. 개행의 mark는 사라진다.
  - `link`와 `bold`·`italic`·`strike`가 함께 달린 런도 같다.
  - 제목 3–6 안쪽 `\n`은 이전처럼 공백 한 칸이다. 출력은 같고 경고만 더해진다.
- 끝 개행이 남은 문서(Shift+Enter 뒤)의 `strict` 내보내기가 거절될 수 있다.
