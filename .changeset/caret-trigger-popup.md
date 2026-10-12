---
"@cp949/geul-react": patch
---

캐럿 트리거 popup(`/`, `:`, `@`)의 상태 기계를 `useCaretTriggerPopup` 훅 한 곳으로 모으고 공개한다. 동작은 바뀌지 않는다.

- react: 신규 export는 `useCaretTriggerPopup`, `UseCaretTriggerPopupOptions`, `CaretTriggerPopupState`, `readCaretBounds`다.
- react: `SlashMenu`와 `EmojiPicker`는 이 훅으로 옮겼다. 열림·닫기·키보드 동작은 같다.
- react: `SlashMenu`의 `items`가 바뀌어 후보 수가 줄면 강조 항목이 마지막 후보로 줄어드는 동작은 그대로다.
