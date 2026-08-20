/**
 * computeColumnAlignments와 그 두 호출부가 "열마다 표 전체를 재순회"하지
 * 않음을 시간이 아니라 관측 가능한 작업량으로 고정한다.
 *
 * 같은 회귀를 시간으로 재던 markdown-column-align-performance.test.ts는
 * pnpm test 동시 실행 부하에서 wall clock이 부풀어(Issue #58 실측:
 * exportMarkdown 5,000열이 무부하 median 87ms → CPU 과포화 median 430ms /
 * max 663ms) 회귀 신호와 부하 잡음을 가르는 임계값이 존재하지 않는다 —
 * 회귀 코드의 무부하 실측이 732ms이기 때문이다(커밋 6ef035f). 이 파일의
 * 단언은 기계 성능과 동시 실행 부하에 전혀 의존하지 않으므로, 회귀 감지의
 * 주 게이트를 시간 상한 대신 여기서 진다.
 *
 * 두 축으로 잡는다.
 * 1. 표 순회량: 계측 표에서 (a) row.cells 참조 획득 횟수가 열 수와 무관하고,
 *    (b) 셀 필드(columnId) 읽기 횟수가 셀 수의 상수 배 안에 머문다.
 *    (a)만 세면 배열 참조를 열 루프 바깥으로 hoist한 뒤 열마다 그 배열을
 *    재순회하는 형태(reads가 행 수로 고정되는데 실제 비용은 quadratic)를
 *    통째로 놓친다. 셀 필드 읽기는 배열 참조를 hoist한 뒤 열마다 재순회하는
 *    형태에는 면역이다. 다만 셀 데이터를 사본으로 옮긴 뒤 그 사본을 열마다
 *    재순회하는 형태는 입력 객체 계측으로 관측할 수 없다 — 이 축을 포함해
 *    어떤 입력 계측도 사본 위에서 벌어지는 작업을 보지 못한다. 두 축을
 *    함께 세야 게이트가 닫히지만, 이 사각지대는 계측 설계로 메울 수 없다.
 * 2. 두 호출부: 표당 computeColumnAlignments 호출 횟수가 열 수와 무관하다.
 *    열마다 헬퍼를 호출하면 횟수가 열 수에 비례하고, 헬퍼를 버리고 자체
 *    quadratic 루프를 인라인하면(원래 회귀의 형태다) 그 호출부 몫만큼
 *    줄어든다 — export 경로는 표당 2회에서 1회로, analyzeMarkdownLoss
 *    경로는 1회에서 0회로.
 *
 * 호출부를 입력 객체 계측이 아니라 모듈 spy로 재는 이유: exportMarkdown은
 * parseDocument가 만든 정규화 사본(parsed.value, export-markdown.ts:179-200)
 * 으로 동작하므로, 호출자가 넘긴 객체에 얹은 getter는 computeColumnAlignments
 * 까지 도달하지 못한다.
 */
import type { Document, TableBlock } from "@cp949/geul-model";
import { describe, expect, it, vi } from "vitest";

import { analyzeMarkdownLoss, exportMarkdown } from "../src/index.js";
import { computeColumnAlignments } from "../src/markdown/column-align.js";
import {
  buildWideMixedAlignDocument,
  buildWideMixedAlignTable,
} from "./fixtures/wide-align-table.js";

vi.mock("../src/markdown/column-align.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/markdown/column-align.js")>();
  return {
    ...actual,
    computeColumnAlignments: vi.fn(actual.computeColumnAlignments),
  };
});

/**
 * 열 수만 다르고 나머지가 같은 두 표를 비교해 복잡도를 판정한다.
 * 두 값 모두 파싱 상한(행수 × 열수 ≤ 10,000) 안이라 exportMarkdown에도
 * 그대로 쓸 수 있다.
 */
const NARROW_COLUMNS = 100;
const WIDE_COLUMNS = 1_000;

/** fixture 표의 행 수. 단언이 fixture 모양에 매직넘버로 결합되지 않게 유도한다. */
const FIXTURE_ROW_COUNT = buildWideMixedAlignTable(1).rows.length;

/** fixture는 모든 행이 열마다 셀을 하나씩 갖는다 — 논리 셀 수는 행 × 열이다. */
const cellCountOf = (columnCount: number): number =>
  FIXTURE_ROW_COUNT * columnCount;

/**
 * 셀 하나당 허용하는 columnId 읽기 횟수의 상한.
 * 셀 필드 읽기는 단일 패스에서도 셀 수에 비례하므로 "열 수와 무관"으로는
 * 잡을 수 없고, 셀 수의 상수 배로 잡는다.
 *
 * 현재 단일 패스 구현의 구조적 상한은 셀당 2회다(Map.get 1회 + Map.set
 * 1회, set은 첫 관측이거나 mixed로 승격할 때만). 실측 평균은 셀당 1.667회
 * (100열 334/200, 1,000열 3,334/2,000)다. 구조적 상한 2에 여유 1회를 더해
 * 3으로 잡는다 — 열마다 표를 재순회하는 형태는 셀당 읽기가 열 수(100배,
 * 1,000배)로 뛰므로 이 상한을 압도적으로 넘는다.
 */
const CELL_FIELD_READ_FACTOR = 3;

type TableReadCounter = {
  cellsArrayReads: number;
  cellFieldReads: number;
};

/**
 * row.cells 참조 획득과 셀의 columnId 읽기를 각각 세는 표를 만든다.
 * 셀 getter는 원본 cell을 클로저로 잡으므로 재귀하지 않는다.
 *
 * 단일 패스 구현은 행마다 cells를 한 번씩만 얻고 셀마다 columnId를 상수
 * 번 읽는다. 열마다 표 전체를 재순회하는 구현은 둘 중 최소 하나가 열 수에
 * 비례해 늘어난다 — 그 차이가 기계 성능과 무관하게 드러난다.
 */
const instrumentTableReads = (
  table: TableBlock,
  counter: TableReadCounter,
): TableBlock => ({
  ...table,
  rows: table.rows.map((row) => {
    const cells = row.cells.map((cell) => ({
      ...cell,
      get columnId() {
        counter.cellFieldReads += 1;
        return cell.columnId;
      },
    }));
    return {
      ...row,
      get cells() {
        counter.cellsArrayReads += 1;
        return cells;
      },
    };
  }),
});

/** 계측 표로 run을 한 번 실행하고 두 축의 읽기 횟수를 돌려준다. */
const countTableReads = (
  columnCount: number,
  run: (table: TableBlock) => void,
): TableReadCounter => {
  const counter: TableReadCounter = { cellsArrayReads: 0, cellFieldReads: 0 };
  run(instrumentTableReads(buildWideMixedAlignTable(columnCount), counter));
  return counter;
};

/**
 * 표 하나만 담은 최소 Document를 만든다.
 * fixture의 buildWideMixedAlignDocument는 표를 새로 만들어 계측을 잃으므로,
 * 계측 표를 그대로 넘겨야 하는 경로에서는 이쪽을 쓴다.
 */
const documentOf = (table: TableBlock): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [table],
});

/** 한 번의 exportMarkdown 동안 computeColumnAlignments가 불린 횟수를 센다. */
const countExportAlignCalls = (columnCount: number): number => {
  const spy = vi.mocked(computeColumnAlignments);
  spy.mockClear();
  const result = exportMarkdown(buildWideMixedAlignDocument(columnCount), {
    mode: "lossy",
  });
  expect(result.ok).toBe(true);
  return spy.mock.calls.length;
};

describe("컬럼 정렬 판정 복잡도", () => {
  it("computeColumnAlignments는 열 수와 무관하게 표를 한 번만 훑는다", () => {
    const narrow = countTableReads(NARROW_COLUMNS, (table) => {
      computeColumnAlignments(table);
    });
    const wide = countTableReads(WIDE_COLUMNS, (table) => {
      computeColumnAlignments(table);
    });

    expect(narrow.cellsArrayReads).toBe(FIXTURE_ROW_COUNT);
    expect(wide.cellsArrayReads).toBe(FIXTURE_ROW_COUNT);

    expect(narrow.cellFieldReads).toBeLessThanOrEqual(
      cellCountOf(NARROW_COLUMNS) * CELL_FIELD_READ_FACTOR,
    );
    expect(wide.cellFieldReads).toBeLessThanOrEqual(
      cellCountOf(WIDE_COLUMNS) * CELL_FIELD_READ_FACTOR,
    );
  });

  it("analyzeMarkdownLoss는 열 수와 무관하게 표를 한 번만 훑는다", () => {
    const narrow = countTableReads(NARROW_COLUMNS, (table) => {
      analyzeMarkdownLoss(documentOf(table));
    });
    const wide = countTableReads(WIDE_COLUMNS, (table) => {
      analyzeMarkdownLoss(documentOf(table));
    });

    expect(narrow.cellsArrayReads).toBeGreaterThan(0);
    expect(wide.cellsArrayReads).toBe(narrow.cellsArrayReads);

    expect(narrow.cellFieldReads).toBeLessThanOrEqual(
      cellCountOf(NARROW_COLUMNS) * CELL_FIELD_READ_FACTOR,
    );
    expect(wide.cellFieldReads).toBeLessThanOrEqual(
      cellCountOf(WIDE_COLUMNS) * CELL_FIELD_READ_FACTOR,
    );
  });

  it("analyzeMarkdownLoss의 computeColumnAlignments 호출 횟수는 열 수와 무관하다", () => {
    const spy = vi.mocked(computeColumnAlignments);

    spy.mockClear();
    analyzeMarkdownLoss(buildWideMixedAlignDocument(NARROW_COLUMNS));
    const narrowCalls = spy.mock.calls.length;

    spy.mockClear();
    analyzeMarkdownLoss(buildWideMixedAlignDocument(WIDE_COLUMNS));
    const wideCalls = spy.mock.calls.length;

    expect(narrowCalls).toBeGreaterThanOrEqual(1);
    expect(wideCalls).toBe(narrowCalls);
  });

  // export 경로는 warnings용 analyzeMarkdownLoss와 tableNode 직렬화에서 각각
  // 1회씩, 표당 2회 호출한다. 하한을 1이 아니라 2로 잡는 이유: tableNode가
  // 헬퍼를 버리고 자체 quadratic 루프를 인라인하면(원래 회귀의 형태다)
  // analyzeMarkdownLoss 경로의 1회만 남아 열 수와의 무관성은 그대로
  // 성립하므로, 하한 1로는 그 회귀를 잡지 못한다.
  it("exportMarkdown의 computeColumnAlignments 호출 횟수는 열 수와 무관하다", () => {
    const narrowCalls = countExportAlignCalls(NARROW_COLUMNS);
    const wideCalls = countExportAlignCalls(WIDE_COLUMNS);

    expect(narrowCalls).toBeGreaterThanOrEqual(2);
    expect(wideCalls).toBe(narrowCalls);
  });
});
