---
"@cp949/geul-io": patch
---

markdown strict 내보내기가 mark 달린 빈 글자 런을 `MARKDOWN_LOSS_NOT_ALLOWED`로 거절하고, lossy 내보내기가 같은 경고를 낸다.

- 대상: `bold`, `italic`, `strike`, `code` 중 하나가 붙은 빈 글자 런(`{ text: "", marks }`). 마커만(`****` 등) 나가 재가져오기 때 divider·codeBlock·글자로 구조가 바뀔 수 있다.
- 런이 content 중간에 끼어도(`a` + 빈 bold 런 + `b`) 보고한다. 블록 content와 표 셀 content 모두 본다.
- 신규 경고 kind `EMPTY_MARKED_RUN`을 `MarkdownLoss`에 추가한다. 블록당 1건, 표는 셀당 1건이다.
- 판정은 런 단위라 같은 mark 런이 빈 런을 양쪽에서 감싸 왕복이 일치하는 입력(`******a******`)도 거절한다.
- `link` 단독 빈 런과 mark 없는 빈 런은 대상이 아니다.
- `underline`·`textColor`·`backgroundColor` 빈 런은 기존 kind(`UNDERLINE`, `INLINE_COLOR`)만 낸다.
- lossy 출력은 바뀌지 않는다. 경고만 더해진다.
