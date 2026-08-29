# Issue #139 HTML import 인라인 거짓 강등 경고 제거

## 목표

`div`·`li`·`blockquote`·`ul`·`ol` 경계 안의 지원 인라인 요소가 실제 의미 손실 없이 `SAFE_BLOCK_DOWNGRADED`로 보고되는 결함을 제거한다.

## 확정 커밋

- `4e30ce9` — `fix(io): 인라인 거짓 강등 경고를 제거한다`

## 변경

- `packages/io/src/html/import-warnings.ts`: warning 수집기 소유의 지원 인라인 집합과 경계 내부 상태를 추가했다. 지원 인라인 자체의 거짓 경고는 억제하면서 그 아래 실제 미지원 블록 탐지는 유지한다.
- `packages/io/test/html-security-block-boundary.test.ts`: 5개 경계와 7개 지원 인라인의 무경고, mark 보존, 지원 인라인 아래 미지원 블록 경고, 기존 중복 억제 계약을 공개 `importHtml` seam에서 고정했다.
- `HtmlImportWarning` union, sanitizer 정책, HTML 의미 변환과 공개 API는 바꾸지 않았다.

## 검증

- RED: 기존 결함 회귀 8건과 리뷰에서 발견한 중첩 미지원 블록 회귀 1건이 각각 정확한 warning 차이로 실패했다.
- focused HTML security 테스트: 32/32 통과.
- `@cp949/geul-io` 전체: 31파일 297/297 통과.
- `pnpm --filter @cp949/geul-io typecheck`: 통과.
- `pnpm verify`: lint, format, build, escompat, typecheck, unit 1500/1500, package boundary, license, Chromium E2E 89/89 통과.
- `git diff --check`: 통과.

## 남은 제한

없음. 신규 guide·pitfall·후속 이슈 등록 대상도 없다.

## 이슈

- Issue #139에 완료 댓글을 등록하고 종료했다.
