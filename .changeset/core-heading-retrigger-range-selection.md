---
"@cp949/geul-core": patch
---

heading 안 `#` 재발동 입력 규칙이 블록 경계를 걸친 범위 선택 위에서 `TypeError`를 던지던 문제를 고친다.

- 범위 선택 위 입력은 규칙을 건너뛰고 브라우저 기본 입력(선택 대체 평문)에 맡긴다.
- 이전에는 heading의 `##` 뒤에서 다음 블록 중간까지 선택하고 공백을 입력하거나, heading 시작부터 선택하고 `# `를 한 번에 입력하면 `Cannot read properties of undefined (reading 'nodeSize')`가 났다.
- 캐럿(빈 선택) 입력의 재발동 동작은 같다. heading 안에 머무는 범위 선택도 이전처럼 규칙을 건너뛴다.
