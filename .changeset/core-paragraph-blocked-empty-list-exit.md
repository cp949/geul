---
"@cp949/geul-core": patch
---

`enabledBlockTypes`가 `paragraph`를 막은 설정에서 빈 목록 항목의 Backspace·Enter가 Tiptap 기본 체인으로 새던 것을 고친다. 종료 규칙(항목을 `paragraph`로 바꾼다)은 대상이 없으면 건너뛰고 일반 규칙을 따른다.

- 빈 항목의 Enter는 키를 소비하고 같은 타입의 새 빈 항목을 연다. 대상은 bullet·numbered·check·toggle 항목이다.
- 앞 블록이 있는 빈 항목의 Backspace는 항목을 지우고 캐럿을 앞 블록 끝에 둔다. 항목을 앞 블록의 자식으로 들여쓰지 않는다.
- 문서 최선두 항목과 자식 있는 toggle 헤더의 Backspace는 키만 소비한다. 문서와 undo 단위는 바뀌지 않는다. 이전에는 항목이 heading으로 바뀌거나 들여쓰기됐고 결과가 엔진마다 달랐다.
- 코드 블록 바로 뒤 목록 항목의 Backspace는 코드 블록을 한 번에 흡수한다. 항목 타입은 유지된다.
- `paragraph`를 막지 않은 설정은 이전처럼 항목을 `paragraph`로 바꿔 목록을 종료한다.
