---
"@cp949/geul-react": patch
---

트리거 popup의 keydown 처리 순서를 한곳에 모은 `handleMenuKeyDown`을 공개한다. 타입 `MenuKeyboardEvent`와 `MenuKeyboardHandlers`도 함께 공개한다.

- IME 조합 중(`isComposing`) 키는 처리하지 않는다.
- Escape는 `escape` 인자가 있으면 처리한다. Ctrl·Alt·Meta가 눌려도 처리한다.
- Enter 자동 반복은 막고 확정하지 않는다. 처음 Enter를 처리하면 Enter keyup까지 문서 capture 단계에서 반복 Enter를 삼킨다.
- Enter·Tab·이동 키는 Ctrl·Alt·Meta가 눌렸으면 처리 없이 물러나고 `preventDefault`하지 않는다.
- Tab·Enter·이동 키는 `tab`·`activate`·`navigate` 인자로 받는다.

`@query`처럼 텍스트 트리거로 popup을 여는 소비자 UI가 `SlashMenu`·`EmojiPicker`와 같은 키보드 가드를 쓸 수 있다.
