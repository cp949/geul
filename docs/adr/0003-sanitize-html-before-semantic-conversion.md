---
status: accepted
---

# HTML은 sanitize 후에만 의미 변환한다

HTML importer는 제거된 위험 요소를 설명하기 위한 warning fact는 raw HAST에서 수집하지만, 독자 문서의 의미는 sanitized HAST에서만 변환한다. raw tree를 직접 변환하면 상세한 경고를 만들기 쉽지만 제거 대상의 text, URL 또는 속성이 안전한 문서 의미로 되살아날 수 있고, sanitize 후 tree만 보면 무엇이 제거됐는지 보고할 수 없다. 두 투영을 분리해 진단 가능성과 보안 경계를 함께 유지하며 raw HAST의 내용은 결과 문서 생성에 사용하지 않는다.

## Consequences

- 위험 요소와 속성은 구조화된 warning으로 보고할 수 있다.
- 안전한 미지원 블록의 downgrade는 sanitized 의미만 사용한다.
- raw HAST와 sanitized HAST의 책임을 합치는 변경은 보안 계약 변경으로 취급한다.
