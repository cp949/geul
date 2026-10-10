---
"@cp949/geul-core": patch
---

`code` 글자가 `bold`·`italic`·`underline`·`strike`·`link`와 함께 있어도 편집기 문서가 스키마상 유효하게 한다.

- 수정 전 `code` 마크는 이 다섯 마크와 배타였다. model, io, 마크다운이 허용하는 조합은 초기 문서 로드에서 `doc.check()`가 `Invalid collection of marks for node text: bold,code`를 던졌고, 표 밖 붙여넣기(`<b><code>x</code></b>`, `<a href><code>x</code></a>`)는 처리되지 않은 `RangeError`를 냈다.
- 이제 `code`는 다른 마크를 배제하지 않는다. 저장 문서의 형식과 model 규칙은 그대로다. 이전에 열리지 않던 문서가 열린다.
- 동작 변경: `toggleCode`는 `bold`·`italic`·`underline`·`strike`를 지우지 않는다. `code` 글자에 굵게·기울임·밑줄·취소선·링크를 걸 수 있다. 접힌 캐럿에서 `code` 위에 이 마크를 켜도 `COMMAND_NOT_APPLICABLE`을 반환하지 않는다.
- 표 셀 안 html 붙여넣기는 `bold`+`code`를 `code`만 남기지 않고 둘 다 유지한다. 표 밖과 같다.
