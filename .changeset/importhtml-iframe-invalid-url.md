---
"@cp949/geul-io": patch
---

`importHtml`이 `iframeEmbed` 정책(custom URL 허용, provider 허용 등)을 통과한 iframe `data-geul-src` 하나가 정적 url 검증을 통과하지 못해도 문서 전체를 거절하지 않는다.

- 정책을 통과했지만 `isSupportedLinkHref`를 통과하지 못하는 값(공백·제어문자 등)은 url 없는 빈 `iframe` 블록으로 남기고 `UNSAFE_URL_REMOVED`를 반환한다. 이전에는 `HTML_DOCUMENT_INVALID`였다.
- 경고의 `element`는 wrapper 태그(`a`·`div`·`figure`), `attribute`는 `data-geul-src`다. 정책 불허는 이전처럼 경고 없는 빈 `iframe`이다.
- `HtmlImportWarning`의 `UNSAFE_URL_REMOVED`는 `element`가 `"a" | "img" | "video" | "audio" | "div" | "figure"`, `attribute`가 `"href" | "src" | "data-geul-src"`로 넓어진다. 값만 늘어난다. `element`나 `attribute`를 exhaustive하게 좁히는 소비자는 분기를 더해야 한다.
- 정상 url과 기본 설정(`allowCustomUrl` 없음)의 결과는 바뀌지 않는다.
