# 성능 기준선

spec 13(`docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md`) "10,000셀 fixture의 로드, 선택, 붙여넣기와 undo를 브라우저 benchmark로 기록한다"의 측정치.

## 측정 환경

- 브라우저: Chromium(Playwright), 로컬 실행
- fixture: 100×100(10,000 논리 셀) TSV 붙여넣기
- 측정 위치: `e2e/table-performance.spec.ts`
- 측정 명령: `pnpm test:e2e:perf`
- 측정일: 2026-08-27(재측정, 기준 `dev` `05d6c89`, [Issue #78](https://github.com/cp949/geul/issues/78))

이 spec은 `playwright.config.ts`의 `perf` 프로젝트가 단독으로 소유하며 `workers: 1`로 격리해 돈다. `pnpm verify`의 회귀 게이트(`test:e2e`)에는 포함하지 않는다 — 게이트가 아니라 측정 도구이고, 회귀 스위트와 함께 6워커로 돌면 워커 경합이 `performance.now()` 표본에 섞여 아래 수치의 비교 가능성이 깨지기 때문이다([Issue #74](https://github.com/cp949/geul/issues/74)).

## 측정 방식

타이밍은 전부 브라우저 컨텍스트 `performance.now()`로 잰다(Node 쪽 `Date.now()`가 아님). 트리거(이벤트 dispatch)와 완료 감지(DOM 폴링)를 같은 `page.evaluate()` 호출 안에 둬 Playwright IPC 왕복·actionability 재시도 폴링이 측정 구간에 섞이지 않게 한다. 측정 경계는 다음과 같다(`e2e/table-performance.spec.ts` 파일 상단 주석과 동일).

- **포함**: 이벤트가 에디터에 도달한 뒤 트랜잭션 적용, ProseMirror view 업데이트, React 리렌더가 목표 DOM 상태(텍스트/클래스)에 반영되기까지 `requestAnimationFrame` 폴링으로 확인되는 시점까지의 실제 작업 시간.
- **제외**: fixture 준비(TSV 문자열 생성, textarea 채우기), 페이지 내비게이션 자체, Playwright 쪽 IPC/폴링 오버헤드.
- 각 지표는 5회 반복해 표본과 중앙값을 기록한다.

## 측정치

| 작업 | 표본(ms) | 중앙값(ms) |
| --- | --- | --- |
| 로드(100×100 JSON 문서) | 338.3, 349.6, 325.8, 364.9, 349.9 | 349.6 |
| 붙여넣기(TSV 100×100) | 410.7, 328.6, 307.4, 306.5, 329.7 | 328.6 |
| 선택(첫 셀→마지막 셀 드래그) | 21.8, 12.7, 11.5, 10.8, 10.2 | 11.5 |
| undo | 16.8, 14.8, 15.3, 13.6, 13.7 | 14.8 |

위 표는 `perf` 프로젝트(`workers: 1`)로 격리 실행한 표본이다. 이전에는 `perf` 프로젝트 분리(Issue #74) 전, 회귀 스위트와 같은 실행에서 6워커 경합 아래 측정했다 — 당시 spec 자체의 wall-clock은 38.6초였고 격리 후 13.4초로 줄었다(경합이 측정 대상 시간을 2.9배 부풀리고 있었다). 이번 재측정(Issue #78)으로 표를 단일 격리 실행 표본으로 교체했다.

이전 방식(Node `Date.now()`로 Playwright 호출을 감싸 측정, `performance.now()` 전환 전)의 최초 측정치는 붙여넣기 2066ms, 선택 5312ms, undo 184ms였다 — 특히 선택 수치의 대부분이 Playwright actionability 폴링 오버헤드였음이 이번 재측정으로 확인됐다(Issue #33). 로드는 이전 방식으로 측정한 적이 없다(슬라이스 12가 로드 경로를 열었지만 방법론 정비를 기다렸다).

## 회귀 게이트

CI에서 이 기준선 대비 중앙값 20% 이상 악화를 회귀로 처리하는 자동 게이트는 슬라이스 13(Chromium/Firefox/WebKit 전체 게이트) 범위다. 이 문서는 측정치 기록까지만 다룬다.

## Issue #167 roadmap RD-001-DELTA-01 영향 측정

`revisionGuard`(revision-guard-extension.ts)의 appendTransaction 훅이 문서를
바꾸는 모든 transaction마다 구조 검증(`tiptapToModel`)을 추가로 1회 더
실행하도록 바뀌었다(이전에는 `onBeforeChange` 등록 세션만 이 비용을
부담했다). 로드는 `loadNormalizing`일 때 이 검증을 건너뛰므로 영향이 없고,
선택은 `docChanged`가 없는 transaction이라 역시 건너뛴다 — 붙여넣기·undo만
실제로 이 경로를 탄다. 같은 `perf` 프로젝트로 2회 재측정했다(2026-09-10,
작업 브랜치 `fix/167-invalid-transaction-guard`, `dev` 기준 위 표와 동일
fixture).

| 작업 | 1회차 중앙값(ms) | 2회차 중앙값(ms) | 기준선 대비 |
| --- | --- | --- | --- |
| 로드 | 416.1 | 352.1 | 두 값 모두 노이즈 범위(경로 미적용) |
| 붙여넣기 | 349.5 | 351.4 | +6.4%, +6.9% |
| 선택 | 16.8 | 16.1 | 두 값 모두 노이즈 범위(경로 미적용) |
| undo | 15.7 | 20.0 | +6.1%, +35.1%(절대값이 작아(14.8ms) 노이즈 민감) |

붙여넣기는 두 회차 모두 6~7%대로 일관되게 늘었다 — 회귀 게이트 기준(20%)
안이고, 트랜잭션 하나당 추가 `tiptapToModel` 변환 1회라는 예상 비용과
일치한다. undo는 절대값이 작아 회차 간 편차(6%→35%)가 크지만 로드·선택과
같은 절대 ms 스케일의 노이즈로 보인다. 이 표는 참고 기록이며 위 "측정치"
표(공식 기준선)는 갱신하지 않는다 — 단일 로컬 실행 2회는 기존 표의 5표본
방법론을 대체할 근거로 부족하다.

## Issue #12와의 경계

Issue #12(`packages/io/test/markdown-round-trip-limits.test.ts`의 10,000셀 markdown 파서 성능 테스트)의 완료 조건 3번("spec 13 기준선의 최초 측정치를 기록할 위치를 정한다")을 이 문서로 겸해서 해소한다 — io 파서 자체의 로드/파싱 성능은 여기 표에 포함하지 않고 Issue #12 자체 조사 결과(별도 커밋)로 남긴다.
