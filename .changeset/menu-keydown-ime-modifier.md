---
"@cp949/geul-react": patch
---

`handleMenuKeyDown`의 Enter 처리 두 가지를 고친다.

- IME가 처리한 Enter(`keyCode` 229)는 `isComposing`이 `false`여도 막고 `activate`를 부르지 않는다. Safari가 조합 확정 Enter를 `compositionend` 뒤에 보내 메뉴 항목이 확정되던 결함이다.
- 확정 Enter가 건 반복 억제가 Shift·Control·Alt·AltGraph·Meta keydown에서 풀리지 않는다. Enter를 누른 채 Shift를 누르면 반복 Enter가 편집기에 닿던 결함이다.
- `MenuKeyboardEvent`에 선택 필드 `keyCode`를 더한다.
