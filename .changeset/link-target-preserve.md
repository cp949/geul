---
"@cp949/geul-model": minor
"@cp949/geul-io": minor
"@cp949/geul-core": minor
---

링크 `target`을 문서에 저장하고 HTML 왕복에서 보존한다. 새 링크에는 `target`이 붙지 않는다.

- model: `link` 마크에 선택 필드 `target`을 추가한다. 허용값은 `_blank`·`_self`·`_parent`·`_top`이다. 신규 export는 `LINK_TARGETS`, `LinkTarget`, `isCanonicalLinkTarget`, `normalizeLinkTarget`이다. `normalizeLinkTarget`은 ASCII 대소문자만 소문자로 바꾼다(`_BLANK` → `_blank`). 허용 밖 값을 가진 문서는 `marks[i].target` 경로로 거절한다. 인접 조각 병합 판정(`sameMarkKind`)이 `target`을 비교한다.
- io: `importHtml`이 `<a target>`을 읽고 `exportHtml`이 `target`을 낸다. `exportHtml`은 `target="_blank"`일 때만 `rel="noopener noreferrer"`를 붙인다. 허용 밖 `target`은 필드 없이 `UNSAFE_ATTRIBUTE_REMOVED(a, target)` 경고 1건을 낸다. `target="_blank"`에 정확히 `rel="noopener noreferrer"`가 붙은 자체 export는 `rel` 경고를 내지 않는다. 구 에디터가 낸 `rel="noopener noreferrer nofollow"`는 이전처럼 `rel` 경고를 낸다.
- io: `MarkdownLoss.kind`에 `LINK_TARGET`이 늘었다. GFM은 `target`을 표현하지 못해 손실로 보고하고, strict 모드는 `target`이 있는 문서를 거절한다.
- core: 본문과 표 셀 두 codec 경로가 `target`을 보존한다. StarterKit의 Link 기본값(`target="_blank"`, `rel`, `class`)을 껐다. 새 링크에 `target`이 생기지 않고, 편집 화면 링크 DOM에서 `target="_blank" rel="noopener noreferrer nofollow"`가 사라진다. 편집 화면 링크 클릭을 직접 처리하는 소비자는 확인한다.
- 구 에디터 HTML을 가져올 때 경고 수가 줄어든다. 링크마다 나던 `target` 경고가 없어지고 `rel` 경고는 남는다.
- 0.2.3 호환(0.2.3 패키지로 실측): `target`이 있는 문서를 0.2.3 model `parseDocument`와 core `createEditor`·`replaceDocument`가 거절하지 않는다. `target`을 오류나 경고 없이 지워 로드하므로, 0.2.3 앱이 열어 저장하면 `target`이 유실된다. 0.2.3 `importHtml`은 `<a target>`의 `target`을 지우고 `UNSAFE_ATTRIBUTE_REMOVED(target)` 경고를 낸다.
