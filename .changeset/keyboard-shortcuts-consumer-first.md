---
"@cp949/geul-core": patch
---

`keyboardShortcuts`에 내장 키와 같은 키를 등록하면 등록 handler가 내장 handler보다 먼저 실행되도록 고친다.

- 등록 확장의 priority를 내장 확장보다 높게 둔다. 이전에는 일부 내장 키가 등록 handler보다 먼저 실행됐다.
- 영향받던 키: Enter, Backspace·Delete 계열(Mod·Shift 조합 포함), codeBlock 안과 표 경계 범위의 Shift-Enter, codeBlock 안 서식 단축키(Mod-b·i·u·e, Mod-Shift-s).
- handler가 `true`를 반환하면 내장 동작(표 경계·codeBlock 보호 포함)을 건너뛴다. `false`를 반환하면 내장 동작이 이어진다.
- 겹침 경고 문구가 이 동작을 알린다.
- 한계: 편집기 DOM에 도달한 keydown의 keymap 단계 기준이다. 툴바 등 편집기 밖에서 눌린 undo/redo fallback과 열린 SlashMenu·EmojiPicker의 캡처 리스너는 계약 밖이다.
- 한계: 조합 중(IME)·읽기 전용 상태의 keydown은 handler를 호출하지 않는다.
- 한계: 키 표기가 다르면(`Mod-Shift-z` vs `Shift-Mod-z`) 겹침 경고가 나지 않을 수 있다. 동작은 같다.
- 저장 문서 형식은 바뀌지 않는다.
