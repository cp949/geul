---
"@cp949/geul-core": patch
---

`code` 글자가 색 마크와 함께 있어도 편집기 문서가 스키마상 유효하게 한다.

- 수정 전 `code` 마크는 모든 마크와 배타였다. model이 허용하는 `code`+`textColor`·`backgroundColor` 조합은 표 셀 안팎 붙여넣기와 초기 문서 로드에서 `doc.check()`가 `Invalid collection of marks for node text`를 던졌다.
- 이제 `code`는 `textColor`·`backgroundColor`와 함께 걸 수 있다. 나머지 마크와의 공존은 `code-mark-full-coexistence` changeset이 다룬다.
- `code` 글자에 색을 입힐 수 있고 `toggleCode`는 색을 지우지 않는다. 접힌 캐럿에서 `code` 위에 색을 켜도 거절하지 않는다.
- 커스텀 스타일 마크도 `code`와 함께 걸 수 있다. model이 이미 허용하는 조합이다.
- model 규칙과 저장 문서의 형식은 그대로다.
