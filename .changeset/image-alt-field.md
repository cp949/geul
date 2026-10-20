---
"@cp949/geul-model": minor
"@cp949/geul-io": minor
"@cp949/geul-core": minor
---

이미지에 `name`·`caption`과 별개로 선택 `alt`를 저장하고 HTML 왕복에서 보존한다.

- model: `ImageBlock`에 선택 필드 `alt`를 추가한다. `MediaOwnField`에 `"alt"`가 늘고 `MEDIA_BLOCK_FIELDS`는 `alt`를 image만 소유한다고 답한다. 값 검증은 문자열 타입뿐이다. 빈 문자열은 유효하다.
- io: `exportHtml`이 출력 `alt`로 `alt ?? caption ?? name ?? ""`를 쓰고, `alt` 필드가 있을 때만 `data-geul-alt`를 바깥 요소에 낸다. `importHtml`은 `data-geul-alt`를 먼저 읽고, geul 마커가 있는 요소는 `alt`를 만들지 않으며, 마커가 없는 `<img alt>`를 `alt`로 읽는다.
- io 동작 변화: 마커 없는 `<img alt>`(구 에디터 HTML, 웹 페이지 붙여넣기 포함)가 `alt`로 들어온다. 이전에는 읽지 않고 버렸다. 그 결과 이전에 strict GFM export를 통과하던 이미지가 `IMAGE_ALT`로 거절될 수 있다. lossy export는 이전과 같이 동작한다.
- io: GFM export는 `alt ?? name ?? url`을 쓰고, `alt`가 있으며 `name ?? ""`와 다르면 `MarkdownLoss.kind` `IMAGE_ALT`로 보고한다. `name`이 없는 이미지의 `alt`도 같은 규칙으로 strict에서 거절한다. `alt`가 빈 문자열이고 `name`도 없으면 손실이 아니다.
- core: `alt`를 PM attr와 codec으로 보존하고 편집 화면 `<img alt>`에 `alt ?? caption ?? name ?? ""`를 쓴다. `alt`를 입력하는 UI와 명령은 없다. `replaceDocument`나 `importHtml`로만 넣을 수 있다.
- 0.2.3 호환(0.2.3 패키지로 실측): `alt`가 있는 문서를 0.2.3 model `parseDocument`와 core `createEditor`가 `DOCUMENT_INVALID`(`Unrecognized key: "alt"`)로 거절한다. `replaceDocument`는 `{ ok: false }`를 돌려주고 기존 문서를 바꾸지 않는다. 0.2.3 `importHtml`은 마커 없는 `<img alt>`의 `alt`를 경고 없이 무시한다.
