// @vitest-environment jsdom

/**
 * TableHandles의 렌더 비용을 결정적 횟수로 고정한다(Issue #240). wall-clock
 * 상한은 걸지 않는다(PIT-0034). 시간은 e2e perf 로그와 기준선 문서에 남긴다.
 *
 * 100x100 표에서 선택 한 번이 control(그립 클러스터 없음)의 약 4배 걸렸다.
 * 프로파일로 보면 rect 읽기가 아니라 오버레이 항목 약 300개의 React 요소
 * 생성과 커밋이 비용이었다. 활성 바가 옮겨가면 바뀌는 항목은 둘뿐인데 전부
 * 다시 렌더했다. 이 파일은 "바뀐 항목만 렌더한다"를 표 크기와 무관한 횟수로
 * 증명한다.
 *
 * 렌더 횟수는 IconButton 호출 수로 센다. 오버레이 항목마다 IconButton이 하나라
 * 항목 렌더 수와 같고, 항목 안에서 다른 컴포넌트가 늘어도 영향받지 않는다.
 * CellSelection은 packages/react가 @tiptap/pm/tables에 의존할 수 없어
 * (ADR-0002) 세우지 못한다 — 캐럿을 다른 셀로 옮기는 것이 같은 selection
 * 갱신 경로(selectionchange → 활성 행·열 상태)를 탄다.
 */

import { cleanup, fireEvent } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TableHandles } from "../src/table-handles.js";
import { mountTableEditor, placeCaret } from "./mount-editor.js";

// vitest 설정에 globals가 없어 testing-library 자동 cleanup이 걸리지 않는다
// (table-handles.test.tsx 상단 주석 참고).
afterEach(cleanup);

const counts = vi.hoisted(() => ({ iconButton: 0 }));

vi.mock("../src/icon-button.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/icon-button.js")>();
  return {
    ...actual,
    IconButton: (props: Parameters<typeof actual.IconButton>[0]) => {
      counts.iconButton += 1;
      return actual.IconButton(props);
    },
  };
});

const cellAt = (
  table: HTMLElement,
  row: number,
  column: number,
): HTMLElement => {
  const rowElement = table.querySelectorAll("[data-geul-row-id]")[row];
  const cell = rowElement?.querySelectorAll<HTMLElement>(
    "[data-geul-column-id]",
  )[column];
  if (cell === undefined) throw new Error(`셀 ${row},${column}를 찾지 못했다`);
  return cell;
};

/** 모든 요소의 getBoundingClientRect 호출을 센다. 값은 그대로 돌려준다. */
const countRects = (root: HTMLElement) => {
  const state = { reads: 0 };
  for (const element of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
    const original = element.getBoundingClientRect.bind(element);
    element.getBoundingClientRect = () => {
      state.reads += 1;
      return original();
    };
  }
  return state;
};

/** size x size 표를 마운트하고 캐럿을 첫 셀에 둔 뒤 측정 도구를 돌려준다. */
const mountHandles = (size: number) => {
  const profile = { commits: 0 };
  const rendered = mountTableEditor({
    rows: size,
    columns: size,
    children: (
      <Profiler id="handles" onRender={() => (profile.commits += 1)}>
        <TableHandles onBlockAdded={vi.fn()} />
      </Profiler>
    ),
  });
  rendered.restubGeometry();
  placeCaret(cellAt(rendered.table, 0, 0));
  return {
    ...rendered,
    profile,
    rects: countRects(rendered.host),
    /** 측정 구간을 시작한다: 카운터를 0으로 돌린다. */
    reset: () => {
      profile.commits = 0;
      counts.iconButton = 0;
    },
  };
};

describe.each([10, 40])("TableHandles 렌더 비용 (%d x %d 표)", (size) => {
  it("캐럿을 마지막 셀로 옮겨도 TableHandles는 한 번만 커밋한다", () => {
    const mounted = mountHandles(size);
    mounted.reset();

    placeCaret(cellAt(mounted.table, size - 1, size - 1));

    expect(mounted.profile.commits).toBeLessThanOrEqual(1);
  });

  it("캐럿을 옮기면 활성 행·열 항목만 다시 렌더한다(표 크기와 무관)", () => {
    const mounted = mountHandles(size);
    mounted.reset();

    placeCaret(cellAt(mounted.table, size - 1, size - 1));

    // 옛 활성 행·열 항목 둘, 새 활성 행·열 항목 둘, 확장 버튼 둘이다.
    // 모든 항목을 다시 렌더하면 2 x size + 2다(10 → 22, 40 → 82).
    expect(counts.iconButton).toBeLessThanOrEqual(6);
  });

  it("레이아웃이 그대로인 스크롤은 행·열·리사이즈 항목을 다시 렌더하지 않는다", () => {
    const mounted = mountHandles(size);
    mounted.reset();

    fireEvent.scroll(mounted.host);

    // 항목이 아닌 확장 버튼(행 추가·열 추가) 둘만 렌더한다. 모든 항목이면
    // 2 x size + 2다(10 → 22, 40 → 82).
    expect(counts.iconButton).toBeLessThanOrEqual(2);
  });

  it("한 번 렌더하는 rect 판독이 행과 열 수에 선형이다", () => {
    const mounted = mountHandles(size);
    mounted.rects.reads = 0;

    placeCaret(cellAt(mounted.table, size - 1, size - 1));

    // 표 1 + 행 size + 첫 행 셀 size + 클립 동기화. 셀 전체를 읽으면 size^2다.
    expect(mounted.rects.reads).toBeLessThanOrEqual(2 * (2 * size) + 2);
  });
});

describe("TableHandles 활성 표시", () => {
  it("캐럿을 옮기면 활성 표시가 새 행·열로 옮겨가고 옛 행·열에서는 사라진다", () => {
    const mounted = mountHandles(10);
    const activeRows = () =>
      Array.from(
        document.querySelectorAll("[data-geul-table-row-handle-active]"),
      );
    const activeColumns = () =>
      Array.from(
        document.querySelectorAll("[data-geul-table-column-handle-active]"),
      );
    const rowHits = Array.from(
      document.querySelectorAll("[data-geul-table-row-handle-hit]"),
    );
    const columnHits = Array.from(
      document.querySelectorAll("[data-geul-table-column-handle-hit]"),
    );
    expect(activeRows()).toEqual([rowHits[0]]);
    expect(activeColumns()).toEqual([columnHits[0]]);

    placeCaret(cellAt(mounted.table, 9, 9));

    expect(activeRows()).toEqual([rowHits[9]]);
    expect(activeColumns()).toEqual([columnHits[9]]);
  });
});
