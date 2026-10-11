---
"@cp949/geul-io": patch
"@cp949/geul-core": patch
---

`importHtml`이 무효 미디어 url과 무효 `data-geul-*` 선택 표시 값 하나로 문서 전체를 거절하지 않는다.

- `image`·`video`·`audio`의 `src`가 미디어 url 정책을 통과하지 못하면(`file:`, `cid:`, `javascript:` 등) 그 블록만 버리고 `UNSAFE_URL_REMOVED`를 반환한다. 이전에는 `HTML_DOCUMENT_INVALID`였다. `figure[data-geul-media-type="file"]` 안 `img`의 무효 `src`도 같다.
- 색·정렬·callout `icon`·production 목록 시작 번호·미디어 `backgroundColor`·`textAlignment`·`previewWidth`·`aspectRatio`·표 셀 색·정렬·열 폭의 무효 값은 그 필드만 버리고 `UNSAFE_ATTRIBUTE_REMOVED`를 반환한다. `attribute`는 `data-geul-text-color` 같은 HTML 속성 이름이다. 무효 `data-geul-*` 색은 `style`의 색으로 되살리지 않는다.
- `HtmlImportWarning`의 `UNSAFE_URL_REMOVED`는 `element`가 `"a" | "img" | "video" | "audio"`, `attribute`가 `"href" | "src"`로 넓어진다. 값만 늘어난다. `element === "a"`를 가정한 소비자는 좁히기가 필요하다.
- 정규형 입력의 결과는 바뀌지 않는다. 중복 id, 중첩 깊이 초과, 표 격자 위반 같은 구조 위반은 계속 `HTML_DOCUMENT_INVALID`다.
- 버린 미디어 블록의 `alt`와 `data-geul-media-type` 마커가 붙은 `figure`의 `figcaption` 글자는 경고 없이 함께 사라진다. 마커 없는 `figure`의 캡션 글자는 문단으로 남는다.
- 클립보드 파서(`parseClipboardTable`)는 변환기 결과를 그대로 쓴다. 비표 블록마다 하던 재프로브(`modelSafeBlock`)를 지웠다. 경고는 내지 않는다. 결과는 같다. 단 두 목록 사이에 무효 `img`가 끼면 둘째 목록의 번호가 이어붙지 않고 1부터 다시 시작한다(`importHtml`로 `<ol>a</ol><ol>b</ol>`을 읽은 결과와 같다).
- core: `text/html`이 `<img src="javascript:x">` 같은 무효 url만 담은 붙여넣기는 이전에 import 실패로 `text/plain` 폴백이 됐다. 이제 그 이미지를 뺀 나머지 블록이 붙는다.
