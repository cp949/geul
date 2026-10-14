---
"@cp949/geul-react": patch
---

`EmojiPicker`가 강조한 이모지를 보조 기술에 알린다.

- 방향키로 강조한 옵션의 `id`를 편집기 contenteditable의 `aria-activedescendant`로 설정한다.
- 옵션 `id`는 `useId()` 기반 접두사와 이모지 `id`를 이은 값이다. 옵션마다 다르다.
- 팝업이 닫히면(Escape, 선택) 속성을 제거한다.
- 후보가 0건이면 속성을 달지 않는다.
- `CalloutIconPicker`의 이모지 선택기는 바뀌지 않는다. 옵션에 `id`가 없고 편집기에 속성도 없다.
