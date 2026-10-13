---
"@cp949/geul-core": patch
---

`enabledBlockTypes`가 `paragraph`를 막은 설정에서 heading·quote·callout 끝 Enter가 `TypeError`를 던지던 것을 고친다. 이제 예외 없이 같은 타입의 새 블록을 연다.

- 새 블록은 원본의 타입과 attrs(heading `level`, callout `icon`)를 복사하고 내용은 비어 있다.
- 키는 소비하고 undo 단위는 1회다.
- heading 끝에 여러 줄 평문을 붙여넣을 때 같은 `TypeError`가 나던 것도 사라진다. 줄 사이가 같은 타입으로 분할된다.
- `paragraph`를 막지 않은 설정의 끝 Enter는 이전처럼 빈 `paragraph`를 연다.
