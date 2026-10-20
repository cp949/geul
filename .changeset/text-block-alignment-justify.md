---
"@cp949/geul-model": minor
"@cp949/geul-io": minor
"@cp949/geul-core": minor
---

텍스트 블록 정렬이 `justify`를 받고, 외부 HTML의 inline `text-align`을 읽고, 편집 화면에 보인다.

- model: `TextBlockProps.textAlignment`가 `left`·`center`·`right`·`justify`를 받는다. 신규 export는 `TEXT_BLOCK_ALIGNMENTS`, `TextBlockAlignment`, `isCanonicalTextBlockAlign`이다. 표 셀 `align`과 미디어 `textAlignment`는 `isCanonicalCellAlign`(`left`·`center`·`right`)을 그대로 쓰고 `justify`를 계속 거절한다.
- io: `data-geul-text-alignment`가 없는 `p`·`h1`–`h6`·`blockquote`·`li`·callout·블록 자식 없는 `div`의 `style` `text-align`을 `textAlignment`로 읽는다. `data-geul-text-alignment`가 있으면 style은 보지 않고, 무효 값은 필드 없이 경고하며 style로 복구하지 않는다. 블록 자식 없는 `div`는 `data-geul-*`를 읽지 않고 style만 읽는다.
- io 선택 규칙: `!important`가 먼저이고 같은 중요도는 뒤 선언이 이긴다. 키워드는 ASCII 대소문자를 구분하지 않는다. 문법상 무효한 값(`foo` 등)의 선언은 브라우저처럼 없는 것으로 본다. 문법상 유효하지만 허용 4값이 아닌 값(`start`·`end`·`inherit`·`var()` 등)이 이기면 값 없음이고 앞 선언으로 되돌아가지 않는다. `li`·`blockquote`·callout이 승격한 `p`는 바깥 요소보다 안쪽 우선이다. 브라우저 복사의 계산 스타일 덤프 안 `text-align: start`는 정렬로 읽지 않는다.
- io: GFM strict export는 `justify`를 기존 정렬과 같은 `BLOCK_ALIGN` 손실로 거절한다.
- core: `setBlockTextAlignment`가 `justify`를 받는다. 공개 타입의 `align`이 `TextBlockAlignment | null`로 넓어졌다. 편집 화면은 정렬을 blockContent 노드에 `text-align`으로 보여 준다. 이전에는 저장만 되고 화면에 보이지 않았다. 자식 블록은 부모 정렬을 상속하지 않는다. `justify` 버튼은 없다. 블록 메뉴는 현재 정렬을 바꾸지 않는 한 `justify` 블록을 덮어쓰지 않는다.
- 0.2.3 호환(0.2.3 패키지로 실측): `textAlignment: "justify"`가 있는 문서를 0.2.3 model `parseDocument`와 core `createEditor`가 `DOCUMENT_INVALID`(`textAlignment must be one of left, center, right`)로 거절한다. `replaceDocument`는 `{ ok: false }`를 돌려준다. 0.2.3 `importHtml`은 `data-geul-text-alignment="justify"`를 필드 없이 제거하고 `UNSAFE_ATTRIBUTE_REMOVED` 경고를 낸다. 0.2.3은 `style`의 `text-align`을 읽지 않고 `style` 제거 경고를 낸다.

- 빈 `data-geul-text-alignment`도 무효 속성으로 경고하고 style로 복구하지 않는다. CSS 정렬 키워드는 이스케이프를 푼 토큰으로 읽으며, 잘못된 `var(foo)`·`var()` 선언은 앞 유효 정렬을 지우지 않는다.
