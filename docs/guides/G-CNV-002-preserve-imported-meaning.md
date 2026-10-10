# G-CNV-002 외부 입력은 sanitize한 의미와 raw warning fact를 분리한다

- 상태: `ACTIVE`
- 적용 조건: HTML·GFM importer, sanitizer, warning 또는 source position recovery 변경

## 구현 규칙

- 독자 문서 의미는 sanitized HAST에서만 만든다.
- HTML importer의 warning 책임은 둘로 나뉜다.
  - 수집기는 raw HAST에서 sanitize가 지운 것을 모은다. 대상은 제거된 요소·속성·URL과 블록 강등이다.
  - 수집기는 style·bgColor를 읽어도 제거를 보고하는 부분 읽기 정책도 맡는다. 이 판정은 변환 경로와 무관하게 raw 트리만 보고 정해진다.
  - 변환기는 sanitized 트리만 보고 변환 손실을 낸다. 대상은 글자 정제, 중첩 평탄화, language metadata 충돌, 변환기가 쓰지 않은 속성이다.
- 수집기는 변환 결과를 예측하지 않는다. 변환기가 손실을 일으키는 지점에서 직접 warning을 낸다.
  - `UNSAFE_CODE_POINT_REMOVED`는 변환기가 글자를 정제할 때 낸다. 판정 값은 공백 접기 뒤 값이다.
  - warning `element`는 텍스트 노드의 sanitized 부모 태그다. 최상위 loose 텍스트는 `"text"`다.
  - 속성 보존 warning은 변환기가 쓴 속성을 노드에 표시하고, 변환 뒤 sanitized 트리를 한 번 돌며 표시되지 않은 감사 대상 속성만 낸다.
  - 한 속성의 warning은 수집기와 감사 중 한 곳에서만 난다. 수집기는 감사 대상 속성을 건너뛴다.
  - `pre`·`code`의 codeBlock 메타(`data-geul-block-id`·`data-language`·`class`·`data-geul-code-wrap`)도 감사 대상이다. codeBlock 분기가 읽은 속성만 표시한다.
  - 블록을 품어 벗겨지는 `font`·`mark`의 `color`·`style`은 벗기는 쪽이 벗기는 순간 낸다. 읽지 못하는 `font` `color`는 수집기만 낸다.
- 블록 강등(`SAFE_BLOCK_DOWNGRADED`)은 수집기가 raw 위치로 판정한다. 루트 인라인과 블록을 품은 `font`·`mark`가 대상이다.
  - sanitize가 벗긴 요소의 자식은 sanitized 트리에서 구분되지 않는다. `<section><b>x</b></section>`와 `<b>x</b>`는 sanitize 뒤 같다. 경고는 각각 `section`, `b`다.
  - 판정 근거는 변환기와 공유한다. 인라인 태그 목록은 `INLINE_PRESENTATION_TAG_NAMES`, 벗길 `font`·`mark`는 `findBlockBearingColorTags`다.
  - 이 밖의 변환 예측을 수집기에 더하지 않는다.
- warning 순서는 수집기 warning, 변환기 warning, 속성 감사 warning이다. 벗기기 warning은 변환 전 단계라 변환기 warning 맨 앞이다. 깊이 절단 warning(`DEEP_TREE_FLATTENED`)은 수집기 warning 맨 앞이다.
- raw HAST의 순서나 내용을 변환기로 넘기지 않는다.
- raw HAST의 text, URL과 attribute를 결과 문서 생성에 사용하지 않는다.
- 미지원 문법도 보이는 text와 block 경계를 보존한다.
- AST가 잃는 reference 형태는 source position과 원문 slice로 복원한다.
- escaped syntax와 실제 reference를 구분하고, 의미 손실은 종류와 위치가 있는 warning으로 반환한다.
- HTML comment를 element나 실행 가능한 text로 취급하지 않는다.

## 검증

unsafe element·attribute·URL, comment, resolved·missing·collapsed·shortcut·escaped·malformed reference를 각각 fixture로 고정한다.
