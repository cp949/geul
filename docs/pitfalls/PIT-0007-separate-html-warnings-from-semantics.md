# PIT-0007 HTML 경고 수집과 의미 변환을 분리한다

- 상태: `ACTIVE`
- 적용 영역: HTML import, sanitize, warning, security
- 최초 근거: R0 commit `49fed67`

## 상황과 징후

제거된 unsafe element를 경고하려다 script text나 unsafe URL이 문서 내용으로 되살아나거나, 반대로 sanitize 이후 tree만 사용해 무엇이 제거됐는지 경고하지 못한다. HTML comment 내부 문자를 실제 위험 요소로 오판할 수도 있다.

## 근본 원인

위험 입력의 존재를 진단하는 사실 수집과 안전한 문서 의미 생성은 서로 다른 투영이다. 둘을 같은 HAST에서 처리하면 진단 정보나 보안 경계 중 하나가 깨진다.

## 예방 규칙

- warning fact는 raw HAST 구조에서 수집한다.
- 독자 문서 의미는 sanitized HAST에서만 생성한다.
- raw HAST의 text, URL과 속성을 결과 문서 생성에 사용하지 않는다.
- HTML comment를 element 또는 실행 가능한 text로 취급하지 않는다.

## 검증 방법

unsafe element·attribute·URL, 안전한 미지원 block, comment-only HTML과 comment 속 script 문자열을 별도 fixture로 검증한다.

```bash
pnpm --filter @cp949/geul-io test
```

## 실제 근거

- `packages/io/src/html/import-html.ts`
- `packages/io/src/html/import-warnings.ts`
- `packages/io/src/html/sanitize-schema.ts`
- `packages/io/test/html-security.test.ts`
- commit `49fed67`에서 raw warning 수집과 sanitized 의미 변환을 분리하고 HTML comment가 의미와 warning을 오염시키지 않는 회귀를 고정했다.

## 관련 문서

- [HTML sanitize ADR](../adr/0003-sanitize-html-before-semantic-conversion.md)
