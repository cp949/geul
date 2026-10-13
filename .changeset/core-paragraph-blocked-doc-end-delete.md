---
"@cp949/geul-core": patch
---

`enabledBlockTypes`가 `paragraph`를 막은 설정에서 문서 끝 블록의 Delete가 Tiptap 기본 체인으로 새던 것을 고친다. 문서 끝에는 병합 대상이 없어 키만 소비한다.

- 문서 끝 빈 목록 항목·heading·quote·callout의 Delete는 키만 소비한다. 문서와 undo 단위는 바뀌지 않는다. 이전에는 빈 블록이 level 1 heading으로 바뀌었다. 빈 level 1 heading은 겉모양 변화 없이 undo 단위만 남았다.
- toggle·quote 아래 중첩 마지막 자식과 캐럿이 끝인 글자 있는 끝 블록도 같다.
- 빈 코드 블록이 최상위 유일한 블록이면 지우지 않고 키만 소비한다. 앞 블록이 있으면 이전처럼 코드 블록을 지운다.
- `paragraph`를 막지 않은 설정은 바뀌지 않는다.
