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

## 타이핑 지연(composite 샘플 로드 후)

`/examples/composite`에서 샘플을 불러온 뒤 문자를 입력할 때의 처리 비용이다. 샘플 로드 후 키 입력이 느려졌다. 원인은 예제 `ResultPanel`이었다. `packages/*`는 수정하지 않았다.

원인은 세 가지다.

- 숨긴 HTML 탭의 `Highlight`(prism)가 키마다 렌더됐다.
- `exportHtml()`이 키마다 계산됐다.
- 미리보기 `dangerouslySetInnerHTML={{ __html }}`가 렌더마다 새 객체를 받았다. react-dom 19.2.8은 prop 객체 정체성만 비교하므로 같은 문자열이어도 `innerHTML`을 다시 대입했다. 미리보기 DOM이 키마다 통째로 재생성됐다.

수정은 세 가지다. 셋 다 필요하다.

- 활성 탭만 마운트한다. HTML 탭의 pretty-print도 활성일 때만 계산한다.
- 결과 패널의 `revision`에 200ms 트레일링 디바운스를 건다.
- `{ __html }` 객체를 `useMemo`로 고정한다.

디바운스 없이 `useMemo`만 두면 효과가 없다. `html`이 키마다 바뀌어 `useMemo`가 매번 새 객체를 만들기 때문이다.

### 측정 환경

- 브라우저: Chromium 153.0.8010.12(Playwright, headless, Desktop Chrome).
- 머신: Intel Core i7-8700, 12 논리 코어.
- 측정일: 2026-10-03, 기준 `dev` `94318d61`.
- 렌더링은 헤드리스 소프트웨어 렌더링이다. 실제 GPU의 Paint는 알 수 없다.

### 프레임 기준 측정(spec)

- 측정 위치: `e2e/typing-performance.spec.ts`.
- 측정 명령: `pnpm test:e2e:perf`(`perf` 프로젝트 소유, `workers: 1`).
- 서버: `apps/showcase` vite dev(5174). production 빌드가 아니다.
- 방식:
  - 샘플 불러오기 → 2초 대기 → 문서 끝으로 캐럿 이동 → 워밍업 20키 → `a` 100키 입력.
  - 키마다 `page.keyboard.press("a")` 뒤 `requestAnimationFrame` 두 번을 기다린다.
  - 페이지 안 keydown 캡처 리스너가 `event.timeStamp`를 기준점으로 잡는다.
  - 첫·두 번째 rAF 콜백까지의 `performance.now()` 차이를 키마다 기록한다.
- 값은 프레임 주기(약 16.7ms)로 양자화된다.
- 수치는 단언하지 않는다. 단언은 입력이 반영됐는지뿐이다([PIT-0034](../pitfalls/PIT-0034-verify-wall-clock-limits-separate-regression-from-load-noise.md)).
- 회귀 게이트는 결정적 구조 테스트다. `apps/showcase/test/examples/00-composite.test.tsx`가 다음을 검증한다.
  - 미리보기 탭이 활성인 동안 HTML 패널이 DOM에 없다.
  - html이 같으면 미리보기 DOM을 다시 만들지 않는다.
  - revision이 연속으로 올라도 `exportHtml`은 디바운스 지연 뒤 한 번만 호출된다(fake timers).
  - 탭을 왕복해 미리보기가 다시 마운트돼도 `data-geul-*` 스타일이 유지된다.

| 구성 | 회차 | keydown→첫 프레임 중앙값(ms) | p90(ms) | keydown→두 번째 프레임 중앙값(ms) |
| --- | --- | --- | --- | --- |
| 작업 전 | 1 | 27.5 | 60.5 | 33.1 |
| 작업 전 | 2 | 27.6 | 60.0 | 33.0 |
| 작업 후 | 1 | 16.5 | 16.6 | 32.2 |
| 작업 후 | 2 | 16.4 | 16.5 | 32.2 |
| 작업 후 | 3 | 16.4 | 16.7 | 32.1 |

- 작업 전: `ResultPanel`을 `HEAD`(`94318d61`) 버전으로 되돌리고 같은 spec으로 측정했다.
- 작업 후: 첫·두 번째 프레임이 모두 프레임 주기에 붙는다. 입력이 프레임을 놓치지 않는다.
- 이 지표는 입력이 프레임을 막는 시간이다. 키당 총 작업량은 재지 않는다. 총 작업량은 아래 표가 다룬다.

### 33ms 주기 입력 측정(일회성)

a키를 누르고 있는 상황의 대용이다. OS 키 반복 간격(약 33ms)으로 100키를 입력하고 렌더러 메인스레드 작업량을 trace로 잰다. 저장소 밖 임시 하네스로 측정했다. 재현 spec이 아니다. `perf` 프로젝트 기록과 달리 이 표는 재현 도구가 저장소에 없다.

- 조건: 샘플 로드 후 문서 끝에서 입력한다.
- 키당 작업량: `CrRendererMain` 스레드의 `RunTask` 합을 키 수로 나눈 값이다.
- 점유율: 입력 구간의 키당 작업량을 33ms로 나눈 값이다.
- 값은 2회 측정(수정 전 dev도 2회)의 `/` 구분이다.

| 구성 | dev 키당 작업량(ms) | dev 점유율 | production 키당 작업량(ms) | production 점유율 |
| --- | --- | --- | --- | --- |
| 수정 전 | 42.9 / 41.6 | 99.5% | 알 수 없음 | 알 수 없음 |
| `useDeferredValue`만 | 32.0 / 31.5 | 94.8% / 93.9% | 27.0 / 27.3 | 80.3% / 81.2% |
| 디바운스만(`innerHTML` 재대입 잔존) | 28.3 / 27.9 | 84.1% / 82.7% | 23.8 / 23.5 | 70.1% / 69.4% |
| 디바운스 + `useMemo`(최종) | 15.8 / 15.6 | 46.4% / 45.9% | 11.0 / 10.9 | 31.7% / 31.5% |
| `ResultPanel` 제거 | 알 수 없음 | 알 수 없음 | 9.4 | 28.6% |

- 수정 전 dev는 33ms 입력을 따라가지 못한다. 마지막 글자 반영이 이상 값(99×33ms)보다 548ms와 606ms 늦다. 50ms가 넘는 task가 13개다.
- 최종 코드는 100키가 모두 이상 값 안팎(−0.5–+0.4ms)에 반영된다. 입력 중 패널 DOM 변경은 0회다. 미리보기는 마지막 keydown 뒤 205–208ms에 현재 문서를 반영한다.
- 입력 중 미리보기는 이전 내용에 머문다. 입력·선택·툴바 상태는 즉시 갱신된다.
- CSS 격리(`contain`, `content-visibility`)는 효과가 없었다. 패널 내용이 실제로 새로 만들어지기 때문이다.

## Issue #12와의 경계

Issue #12(`packages/io/test/markdown-round-trip-limits.test.ts`의 10,000셀 markdown 파서 성능 테스트)의 완료 조건 3번("spec 13 기준선의 최초 측정치를 기록할 위치를 정한다")을 이 문서로 겸해서 해소한다 — io 파서 자체의 로드/파싱 성능은 여기 표에 포함하지 않고 Issue #12 자체 조사 결과(별도 커밋)로 남긴다.
