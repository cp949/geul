---
"@cp949/geul-core": patch
---

툴바 버튼처럼 편집기 밖 요소에 포커스가 있을 때도 `keyboardShortcuts`에 등록한 `Mod-z`·`Mod-Shift-z`·`Mod-y` handler가 내장 undo·redo보다 먼저 실행되도록 고친다.

- 이전에는 undo·redo 폴백(`HistoryKeydownFallbackExtension`)이 등록 handler를 거치지 않고 내장 undo·redo를 바로 실행했다. 편집기 안 keydown에서만 handler가 먼저 실행됐다.
- handler가 `true`를 반환하면 내장 undo·redo를 건너뛴다. `false`를 반환하면 내장 동작이 이어진다.
- 폴백이 undo·redo로 판정한 세 키에서만 handler를 호출한다. 한글 두벌식 `ㅋ`(`KeyZ`)와 `Shift-Mod-z` 표기도 같다.
- 읽기 전용·조합 입력 중 keydown, 입력 컨트롤에서 보낸 keydown, DOM selection이 이 편집기 안에 없는 keydown에서는 handler를 호출하지 않는다.
- #307 변경(`keyboard-shortcuts-consumer-first`)의 한계 "툴바 등 편집기 밖에서 눌린 undo/redo fallback은 계약 밖"을 정정한다. 이제 계약 밖은 `beforeinput` `historyUndo` 경로(키 정보가 없다)와 열린 SlashMenu·EmojiPicker의 캡처 리스너다.
- 한계: 편집기 밖 keydown에서는 undo·redo 키가 아닌 등록 키의 handler를 호출하지 않는다.
- 공개 API 시그니처와 저장 문서 형식은 바뀌지 않는다.
