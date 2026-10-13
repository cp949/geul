---
"@cp949/geul-core": patch
---

`enabledBlockTypes`가 `paragraph`를 막은 설정에서 문서 첫 위치 빈 블록의 Backspace가 Tiptap 기본 체인으로 새던 것을 고친다. 바꿀 대상이 없어 키만 소비한다.

- 문서 첫 텍스트 위치의 빈 heading·quote·callout의 Backspace는 키만 소비한다. 문서와 undo 단위는 바뀌지 않는다. 이전에는 빈 블록이 level 1 heading으로 바뀌었다. 빈 level 1 heading은 겉모양 변화 없이 undo 단위만 남았다.
- 뒤에 다른 블록이 있거나 자식이 딸린 경우, 인라인 원소만 든 블록도 같다.
- 앞이 divider·표뿐인 빈 블록과 앞 블록이 있는 빈 블록은 이전처럼 지워지거나 병합된다.
- `paragraph`를 막지 않은 설정은 바뀌지 않는다.
