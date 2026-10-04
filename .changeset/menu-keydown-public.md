---
"@cp949/geul-react": patch
---

트리거 popup의 keydown 처리 순서를 한곳에 모은 `handleMenuKeyDown`을 공개한다. 타입 `MenuKeyboardEvent`와 `MenuKeyboardHandlers`도 함께 공개한다.

- IME 조합 중 키는 처리하지 않는다.
- Enter 자동 반복은 막고 확정하지 않는다.
- Ctrl·Alt·Meta가 눌린 키는 `preventDefault`하지 않고 물러난다.
- Escape·Enter·Tab·이동 키는 `escape`·`activate`·`tab`·`navigate` 인자로 받는다.

`@query`처럼 텍스트 트리거로 popup을 여는 소비자 UI가 `SlashMenu`·`EmojiPicker`와 같은 키보드 가드를 쓸 수 있다.
