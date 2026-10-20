---
"@cp949/geul-io": minor
---

미디어 폭을 HTML 가져오기에서 더 넓게 읽는다.

- `data-geul-preview-width`의 소수 폭(`320.5`)을 읽는다. 이전에는 정수만 읽어 소수 폭이 HTML 왕복에서 사라졌다. 허용 문법은 `^[+-]?\d+(\.\d+)?$`이고 유한한 수만 받는다. 문법은 맞지만 양수가 아닌 값은 `UNSAFE_ATTRIBUTE_REMOVED` 경고를 낸다.
- `data-geul-preview-width`가 없는 image의 안쪽 `<img style="width: Npx">`를 `previewWidth`로 읽는다(구 에디터가 저장한 HTML). `%`·`auto`·`calc()`는 값 없음이다. video에는 적용하지 않는다. 웹 페이지에서 복사한 `<img style="width: 600px">`를 붙여넣어도 `previewWidth: 600`이 된다. 이전에는 폭을 버렸다.
- `img`의 `style` 제거 경고는 이전과 같다.
