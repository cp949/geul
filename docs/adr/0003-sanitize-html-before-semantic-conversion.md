---
status: accepted
---

# HTML은 sanitize 후에만 의미 변환한다

HTML importer는 제거된 위험 요소를 설명하기 위한 warning fact는 raw HAST에서 수집하지만, 독자 문서의 의미는 sanitized HAST에서만 변환한다. raw tree를 직접 변환하면 상세한 경고를 만들기 쉽지만 제거 대상의 text, URL 또는 속성이 안전한 문서 의미로 되살아날 수 있고, sanitize 후 tree만 보면 무엇이 제거됐는지 보고할 수 없다. 두 투영을 분리해 진단 가능성과 보안 경계를 함께 유지하며 raw HAST의 내용은 결과 문서 생성에 사용하지 않는다.

## Consequences

- 위험 요소와 속성은 구조화된 warning으로 보고할 수 있다.
- 안전한 미지원 블록의 downgrade는 sanitized 의미만 사용한다.
- raw HAST와 sanitized HAST의 책임을 합치는 변경은 보안 계약 변경으로 취급한다.

## 보충

raw HAST에서 warning fact를 모으는 이유는 그대로다. sanitize가 지운 것을 보고하려면 raw 트리를 봐야 한다.

변환 손실은 sanitize가 만들지 않는다. 변환기가 sanitized 트리를 읽다가 일으킨다. 그래서 변환기가 sanitized 트리만 보고 직접 알린다.

- 수집기는 raw 트리에서 sanitize가 지운 것과 블록 강등을 모은다. style·bgColor를 읽어도 보고하는 정책은 예외로 수집기에 남는다.
- 블록 강등은 raw 위치 사실이다. sanitize가 벗긴 요소의 자식은 sanitized 트리에서 구분되지 않는다. 그래서 변환기로 옮기지 않는다(Issue #356 RD-006).
- 변환기는 글자 정제, 중첩 평탄화, language metadata 충돌, 쓰지 않은 속성을 알린다.
- 수집기가 변환기의 결과를 예측하지 않는다. 예측이 어긋나면 거짓 경고와 누락이 생긴다. 아직 남은 예측은 G-CNV-002가 적는다.
- raw 순서나 내용은 변환기로 넘기지 않는다. 변환기 warning은 sanitized 트리의 태그와 속성 이름만 쓴다.
- 보안 경계는 그대로다. raw의 text, URL과 속성은 결과 문서 생성에 쓰지 않는다.
- sanitize가 요소째 지운 서브트리(`svg`, `object`, `math` 등)는 변환기가 보지 못한다. 그 안의 속성은 따로 경고하지 않고 요소 제거 warning 하나로 보고한다.
