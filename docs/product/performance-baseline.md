# 성능 기준선

spec 13(`docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md`) "10,000셀 fixture의 로드, 선택, 붙여넣기와 undo를 브라우저 benchmark로 기록한다"의 측정치.

## 측정 환경

- 브라우저: Chromium(Playwright), 로컬 실행
- fixture: 100×100(10,000 논리 셀) TSV 붙여넣기
- 측정 위치: `e2e/table-performance.spec.ts`
- 측정일: 2026-08-19([Issue #33](https://github.com/cp949/geul/issues/33)로 측정 방식 재정비)

## 측정 방식

타이밍은 전부 브라우저 컨텍스트 `performance.now()`로 잰다(Node 쪽 `Date.now()`가 아님). 트리거(이벤트 dispatch)와 완료 감지(DOM 폴링)를 같은 `page.evaluate()` 호출 안에 둬 Playwright IPC 왕복·actionability 재시도 폴링이 측정 구간에 섞이지 않게 한다. 측정 경계는 다음과 같다(`e2e/table-performance.spec.ts` 파일 상단 주석과 동일).

- **포함**: 이벤트가 에디터에 도달한 뒤 트랜잭션 적용, ProseMirror view 업데이트, React 리렌더가 목표 DOM 상태(텍스트/클래스)에 반영되기까지 `requestAnimationFrame` 폴링으로 확인되는 시점까지의 실제 작업 시간.
- **제외**: fixture 준비(TSV 문자열 생성, textarea 채우기), 페이지 내비게이션 자체, Playwright 쪽 IPC/폴링 오버헤드.
- 각 지표는 5회 반복해 표본과 중앙값을 기록한다.

## 측정치

| 작업 | 표본(ms) | 중앙값(ms) |
| --- | --- | --- |
| 로드(100×100 JSON 문서) | 455.0, 460.5, 392.4, 422.4, 437.2 | 437.2 |
| 붙여넣기(TSV 100×100) | 486.3, 388.2, 352.4, 315.6, 316.2 | 352.4 |
| 선택(첫 셀→마지막 셀 드래그) | 20.5, 12.7, 14.3, 11.7, 11.2 | 12.7 |
| undo | 17.2, 16.3, 18.8, 16.9, 14.6 | 16.9 |

이전 방식(Node `Date.now()`로 Playwright 호출을 감싸 측정, `performance.now()` 전환 전)의 최초 측정치는 붙여넣기 2066ms, 선택 5312ms, undo 184ms였다 — 특히 선택 수치의 대부분이 Playwright actionability 폴링 오버헤드였음이 이번 재측정으로 확인됐다(Issue #33). 로드는 이전 방식으로 측정한 적이 없다(슬라이스 12가 로드 경로를 열었지만 방법론 정비를 기다렸다).

## 회귀 게이트

CI에서 이 기준선 대비 중앙값 20% 이상 악화를 회귀로 처리하는 자동 게이트는 슬라이스 13(Chromium/Firefox/WebKit 전체 게이트) 범위다. 이 문서는 측정치 기록까지만 다룬다.

## Issue #12와의 경계

Issue #12(`packages/io/test/markdown-round-trip-limits.test.ts`의 10,000셀 markdown 파서 성능 테스트)의 완료 조건 3번("spec 13 기준선의 최초 측정치를 기록할 위치를 정한다")을 이 문서로 겸해서 해소한다 — io 파서 자체의 로드/파싱 성능은 여기 표에 포함하지 않고 Issue #12 자체 조사 결과(별도 커밋)로 남긴다.
