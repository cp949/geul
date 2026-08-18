# 성능 기준선

spec 13(`docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md`) "10,000셀 fixture의 로드, 선택, 붙여넣기와 undo를 브라우저 benchmark로 기록한다"의 최초 측정치.

## 측정 환경

- 브라우저: Chromium(Playwright), 로컬 실행
- fixture: 100×100(10,000 논리 셀) TSV 붙여넣기
- 측정 위치: `e2e/table-performance.spec.ts`
- 측정일: 2026-08-19

## 측정치(최초 기준선)

| 작업 | 시간(ms) |
| --- | --- |
| 붙여넣기(TSV 100x100) | 2066 |
| 선택(전체 범위 shift-click) | 5312 |
| undo | 184 |

로드 성능 기준선은 아직 없다. 슬라이스 12가 표 문서 로드 차단을 해제해 측정 경로는 열렸지만, 현재 측정 방식 자체가 [Issue #33](https://github.com/cp949/geul/issues/33)(e2e 측정을 `performance.now()`로) 대상이므로 로드 기준선은 그 방법론 정비와 함께 추가한다.

## 회귀 게이트

CI에서 이 기준선 대비 중앙값 20% 이상 악화를 회귀로 처리하는 자동 게이트는 슬라이스 13(Chromium/Firefox/WebKit 전체 게이트) 범위다. 이 문서는 최초 측정치 기록까지만 다룬다.

## Issue #12와의 경계

Issue #12(`packages/io/test/markdown-round-trip-limits.test.ts`의 10,000셀 markdown 파서 성능 테스트)의 완료 조건 3번("spec 13 기준선의 최초 측정치를 기록할 위치를 정한다")을 이 문서로 겸해서 해소한다 — io 파서 자체의 로드/파싱 성능은 여기 표에 포함하지 않고 Issue #12 자체 조사 결과(별도 커밋)로 남긴다.
