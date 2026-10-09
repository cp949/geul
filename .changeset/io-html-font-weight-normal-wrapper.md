---
"@cp949/geul-io": patch
---

굵지 않은 `<b>` 래퍼가 본문 전체를 굵게 만들던 결함을 고친다.

- `font-weight:normal` 또는 `400` 인라인 스타일이 붙은 `<b>`·`<strong>`은 굵게(bold)로 읽지 않는다. 공백·대소문자·`!important`는 무시하고 마지막 선언을 기준으로 한다.
- Google Docs 복사는 문서 전체를 `<b style="font-weight:normal">`로 감싼다. 이 HTML을 가져오거나 붙여넣으면 본문이 굵지 않게 들어온다. 글자색 같은 안쪽 서식은 유지된다.
- 표 밖 붙여넣기, 여러 블록 붙여넣기, `importHtml`이 모두 같다.
- 일반 `<b>`·`<strong>`은 이전처럼 굵게다. `font-weight:700` 같은 스타일 기반 굵게는 여전히 인식하지 않는다.
- `style` 속성 제거 경고(`UNSAFE_ATTRIBUTE_REMOVED`)는 이전과 같다.
- 저장 문서 형식은 바뀌지 않는다.
