# PIT-0018 복잡도 회귀는 wall-clock 상한이 아니라 결정적 단언으로 잡는다

- 상태: `ACTIVE`
- 적용 영역: io·test
- 최초 근거: Issue #58

## 상황과 징후

O(columns × cells) → O(cells) 같은 알고리즘 복잡도 회귀를 `performance.now()` wall-clock 상한 `expect(elapsedMs).toBeLessThan(...)`으로 게이트하면, 단독 실행에서는 통과하다가 `pnpm test`(모노레포 전체 동시 실행)에서만 간헐적으로 상한을 근소하게 넘겨 회귀와 무관한 변경을 빨갛게 만든다. `packages/io/test/markdown-column-align-performance.test.ts`가 `exportMarkdown` 5,000열 500ms 상한에서 `expected 501.2670549999999 to be less than 500`으로 실패했다(Issue #58). 상한을 단순히 올리면 이번엔 회귀 자체가 상한 아래로 숨는다.

## 근본 원인

측정된 wall-clock 시간은 (a) 알고리즘 비용, (b) 같은 표에 대한 무관한 고정 비용(파싱 검증, 직렬화), (c) 동시 실행 중인 다른 fork 프로세스와의 코어 경쟁 세 가지의 합이다. 단언은 이 셋을 구분하지 못하고 합계만 본다.

Issue #58 2026-08-20 실측(12코어, burn 프로세스로 CPU 포화, 10회 반복)이 이를 수치로 보여준다.

| 테스트 | 무부하 wall median | 무부하 wall max | 과포화 wall median | 과포화 wall max | 과포화 cpu median | 과포화 cpu max |
| --- | --- | --- | --- | --- | --- | --- |
| `analyzeMarkdownLoss` 10,000열 | 4.59ms | 19.11ms | 23.47ms | 94.99ms | 16.01ms | 80.78ms |
| `exportMarkdown` 5,000열 | 86.76ms | 114.75ms | 429.63ms | 662.97ms | 225.44ms | 497.65ms |

`exportMarkdown` 쪽 정상 코드의 과포화 wall max(662.97ms)가 회귀 코드의 **무부하** 실측(732ms, 커밋 `6ef035f` 수정 전 측정)과 겹친다 — 정상과 회귀를 가르는 wall-clock 임계값이 존재하지 않는다는 뜻이다. median도 부하에 함께 밀린다(86.76ms → 429.63ms, 5.0배).

`process.cpuUsage()`로 바꿔도 완전히는 못 피한다. wall보다 안정적이지만(median 증가율 wall 5.0배 vs cpu 1.9배) 과포화 cpu max가 497.65ms로 500ms 상한에 0.5%까지 붙어 여유가 없다 — V8 동시 GC와 백그라운드 JIT 스레드가 `process.cpuUsage()`에도 합산되기 때문이다.

신호 대 잡음비가 나쁜 근본 이유도 있다. `exportMarkdown` 5,000열 135ms 중 컬럼 정렬 판정 자체는 ~1ms이고 나머지는 `parseDocument` 검증과 `remark-stringify`의 10,000셀 직렬화다. 게다가 이 표는 `parseDocument`의 "행수 × 열수 ≤ 10,000"(`MAX_TABLE_LOGICAL_CELLS`, `packages/model/src/table-grid-validation.ts:10`) 상한 때문에 더 넓힐 수 없어, 표를 키워 비율을 개선할 방법도 없다.

## 예방 규칙

- 복잡도 회귀는 "작업량이 입력 크기에 비례하는가"를 결정적으로 단언한다. 시간이 아니라 관측 가능한 작업량을 센다.
  - 계측 getter로 자료구조 접근 횟수를 센다(`row.cells` 참조 획득 횟수, 셀 필드 읽기 횟수 등).
  - 모듈 spy(`vi.mock` + `vi.fn(actual)`)로 헬퍼 호출 횟수를 센다.
  - 크기가 다른 두 입력(예: 열 100개 vs 1,000개)에서 그 값이 입력 크기와 무관하거나 상수 배 안에 머무는지 비교한다.
- 단언 축을 하나만 두지 않는다. "무엇을 세는가"를 잘못 고르면 결정적 단언도 동어반복이 되어 특정 회귀 형태만 통과시킨다(아래 실제 근거의 mutation C 참고).
- 단언을 작성한 뒤 반드시 mutation으로 RED를 실증한다. 회귀 형태를 하나만 가정하지 않는다 — 최소한 "헬퍼가 재순회한다", "호출부가 헬퍼를 버리고 인라인한다", "배열 참조만 hoist하고 내부는 그대로 재순회한다" 세 형태를 각각 시도한다.
- 시간 상한을 완전히 없애지 않는다. 역할을 "심각한 성능 붕괴" 검출로 한정하고, 상수 옆에 실측 근거(무부하/과포화 median·max)와 그 역할을 주석으로 남긴다.
- 상한 값을 잡을 때 `pnpm test` 동시 실행에서 wall clock이 최대 5배까지 부풀 수 있다고 전제한다(Issue #58 실측 median 증가율 5.0배).
- 모든 시간 상한이 나쁜 것은 아니다. 입력 크기가 다른 상한(`MAX_TABLE_LOGICAL_CELLS` 같은 구조적 제약)으로 이미 고정되어 있고 병목이 자체 코드가 아니라 최적화 불가능한 서드파티 내부에 있다면, 실측 최악값에 안전 여유를 더한 타임아웃 상향은 타당하다(아래 Issue #12 선례). 문제는 시간 상한 자체가 아니라 **그것으로 복잡도 회귀를 게이트하는 용도**다.
- 입력 객체 계측은 사본 위에서 벌어지는 작업을 보지 못한다. 계측 getter는 원본 입력에 대한 접근만 재므로, 구현이 셀 데이터를 사본으로 옮긴 뒤 그 사본을 재순회하면 어떤 계측 축도 그 재순회를 관측할 수 없다. 계측 축을 설계할 때 이 한계를 전제하고, 관측 불가능한 회귀 형태가 무엇인지 문서에 남긴다.

## 검증 방법

새 성능 테스트에 시간 상한을 추가하기 전에 분리 배수를 계산한다.

```txt
분리 배수 = 정상 코드의 (동시 실행 부하 하) wall max / 회귀 코드의 (무부하) wall 실측
```

이 배수가 5배 미만이면 시간 단언만으로는 회귀와 부하 잡음을 구분할 수 없다고 판단하고, `## 예방 규칙`의 결정적 단언을 추가한다.

mutation 절차:

```bash
# 1. 구현을 회귀 형태로 임시 치환한다 (예: computeColumnAlignments 호출부를
#    자체 quadratic 루프로 인라인)
# 2. 결정적 단언이 실제로 FAIL하는지 확인한다
pnpm --filter @cp949/geul-io test markdown-column-align-complexity

# 3. 되돌린다
git checkout -- packages/io/src/markdown/export-markdown.ts

# 4. 소스 트리에 잔여 변경이 없는지 확인한다
git diff --stat -- packages/*/src
```

시간 기반 게이트를 저장소 전체에서 훑는다. `toBeLessThan(...TIME_LIMIT` 형태만 찾으면 `markdown-round-trip-limits.test.ts`처럼 상한을 `it(title, fn, timeoutMs)` 위치 인자로 넘기는 선례를 놓친다 — 아래 패턴으로 넓힌다.

```bash
grep -rnE "toBeLessThan\(.*(TIME_LIMIT|LIMIT_MS)|performance\.now\(\)|[Tt]imeout" packages/*/test/
```

새로 걸리는 시간 상한마다 분리 배수 계산과 상수 주석 근거가 있는지 확인한다.

## 실제 근거

- 커밋 `6ef035f`(원래 성능 회귀 수정) — `export-markdown.ts`의 `columnAlign()`과 `loss-analysis.ts`의 `columnAlignAgrees()`를 공유 헬퍼 `computeColumnAlignments()`(`packages/io/src/markdown/column-align.ts`)로 통합해 O(columns × cells)를 O(cells)로 낮췄다. 회귀 코드 실측 1265ms/732ms → 수정 후 11ms/135ms.
- Issue #58 — 위 수정에 추가한 wall-clock 500ms 상한 2개가 `pnpm test` 동시 실행에서 간헐 실패했다. 재설계로 커밋 `db92656`(결정적 단언 도입), `c7a73fe`(셀 필드 읽기 축 추가), `7f095d5`(exportMarkdown 시간 상한 3,000ms로 재설정)이 나왔다. 결과물은 `packages/io/test/markdown-column-align-complexity.test.ts`(결정적 단언, 열 100개 vs 1,000개 비교)와 축소된 역할의 `packages/io/test/markdown-column-align-performance.test.ts`.
- 설계 중 실제로 겪은 두 자기 함정:
  - `exportMarkdown` 경로의 `computeColumnAlignments` 호출 횟수 하한을 처음엔 1로 뒀는데, "헬퍼를 버리고 자체 quadratic 루프를 인라인"하는 mutation에서 호출 횟수가 2 → 1로 줄어도 하한 1을 통과해 회귀를 놓쳤다. 하한을 2(warnings용 `analyzeMarkdownLoss` 1회 + `tableNode` 직렬화 1회)로 강화하고 나서야 RED가 됐다.
  - 첫 설계는 `row.cells` 참조 획득 횟수 축 하나만 있었는데, "배열 참조만 열 루프 바깥으로 hoist하고 내부는 여전히 열마다 재순회"하는 mutation이 그 축을 포함한 4개 단언을 전부 통과했다 — hoist된 배열은 참조 획득 횟수를 행 수로 고정시키면서 실제 비용은 그대로 quadratic으로 남기기 때문이다. 셀 필드(`columnId`) 읽기 횟수 축을 추가하고 나서야 이 형태가 잡혔다.
- Issue #12 / `packages/io/test/markdown-round-trip-limits.test.ts:20`(`oversizedTableTimeoutMs`) — 같은 함정을 먼저 만난 선례이지만 결론이 갈렸다가 나중에 합류했다. 발견 당시(Issue #12)에는 병목이 서드파티 `remark-gfm`(`micromark-extension-gfm-table`)의 `EditMap.addImplementation` 선형 스캔 내부라 자체 코드로는 최적화할 수 없다고 판단해 `MAX_TABLE_LOGICAL_CELLS`(`packages/model/src/table-grid-validation.ts:10`)로 입력 크기 상한을 고정하고, 실측 최악값(병렬 7.0~7.9초)에 여유를 더한 타임아웃 상향(20,000ms)으로만 대응했다 — Issue #58과 달리 게이트 대상이 복잡도 회귀가 아니라 고정 비용의 절대 상한이라 여겼기 때문이다. Issue #26이 이 판단을 뒤집었다: `pnpm patch`로 `EditMap`이 `at -> index` `Map` 기반 O(1) 조회를 쓰도록 서드파티 코드 자체를 고쳐(`patches/micromark-extension-gfm-table@2.1.1.patch`) 20,000셀 표 파싱이 15.3s→0.43s(약 35배)로 개선됐고, 타임아웃은 5,000ms로 되돌렸다 — "서드파티 병목은 자체 코드로 손댈 수 없다"는 전제 자체가 항상 참은 아니다.

## 관련 문서

- Issue #12(선례) — `packages/io/test/markdown-round-trip-limits.test.ts`
- Issue #26(선례를 뒤집은 후속) — `patches/micromark-extension-gfm-table@2.1.1.patch`, `packages/io/test/markdown-round-trip-limits.test.ts`
