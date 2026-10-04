---
"@cp949/geul-react": patch
---

`SlashMenu`와 `EmojiPicker`가 키보드로 트리거 블록을 떠난 직후의 Enter를 확정하지 않는다.

- `Control+Home`·`PageUp` 같은 이동 키 직후(대기 0ms) Enter가 이전 `/query`·`:query` 블록을 변환하거나 이모지로 바꾸던 결함을 고친다.
- 범위 선택(`Control+Shift+Home`) 직후 Enter도 확정하지 않는다.
- 확정 전에 DOM selection이 popup을 연 블록 안의 접힌 캐럿인지 확인한다. 아니면 popup만 닫고 문서는 바꾸지 않는다.
- 같은 블록에서의 Enter 확정, 사이드 메뉴 "+"로 연 slash의 Enter 확정, 마우스 클릭 선택은 그대로다.
