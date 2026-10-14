---
"@cp949/geul-react": patch
---

`MediaToolbar`의 이름·캡션 편집을 끝내도 미디어 선택과 툴바가 남는다.

- Rename·Edit caption 입력을 클릭한 뒤 Enter, Escape, Cancel 버튼, Save 버튼으로 끝내면 초점이 편집기 contenteditable로 돌아온다.
- 입력을 클릭해 DOM selection이 툴바 입력에 있어도 미디어 선택과 툴바가 남는다. 이전에는 캐럿이 다음 문단으로 옮겨 툴바가 닫혔다.
