import { parseTableColumns } from "@cp949/geul-core";

import { findElementByAttribute } from "./find-by-attribute.js";

// table-handles.tsx의 hover·드래그·리사이즈 오케스트레이션에서 표 DOM을
// 찾아 좌표로 바꾸는 순수 판독 계층만 모은다. HTMLElement만 받고 React·
// 에디터 마운트에는 의존하지 않는다 — table-handles.test.tsx처럼
// mountTableEditor로 실 편집기를 띄우지 않아도 이 파일만으로 테스트할 수
// 있다(readColumnBounds는 DOM조차 필요 없는 순수 함수다).

// tableBlockId로 표 엘리먼트를 찾는 탐색 로직 자체는 find-by-attribute.ts가
// 소유한다 — 여기서는 "table" + "data-geul-block-id" 조합으로 커링해 표 도메인
// 개념 하나로 노출한다. table-handles.tsx(9곳)와 table-selection-toolbar.tsx
// (1곳)가 공유한다 — 원래 각자 이 조합을 따로 호출했다(그릴링에서 확인).
export const findTable = (
  element: HTMLElement,
  tableBlockId: string,
): HTMLElement | null =>
  findElementByAttribute(element, "table", "data-geul-block-id", tableBlockId);

// G-UI-003/ADR-0012: 오버레이 6종은 position: fixed(viewport-relative
// getBoundingClientRect) 대신 absolute + page-relative 좌표를 쓴다 —
// fixed는 앵커가 뷰포트 밖으로 나가면 네이티브 scrollIntoView·포커스
// 스크롤·Playwright 자동스크롤을 전부 no-op으로 만든다(Issue #163). 이
// 변환을 가장 낮은 판독 지점(getBoundingClientRect 호출부) 한 곳에 모아,
// 그 위 레이어(readSpanlessRowBoxes·readMergedLayout·readColumnBounds·readTableGeometry)는 좌표계를
// 신경 쓰지 않고 "그 rect"를 그대로 쓰면 된다.
export const readPageRect = (element: Element): DOMRect => {
  const rect = element.getBoundingClientRect();
  const view = element.ownerDocument.defaultView;
  if (view === null) return rect;
  return new DOMRect(
    rect.x + view.scrollX,
    rect.y + view.scrollY,
    rect.width,
    rect.height,
  );
};

type RowGeometry = {
  rowId: string;
  index: number;
  top: number;
  height: number;
};
type ResizeSegment = { rowId: string; top: number; height: number };

// 한 행과 그 행 셀들의 화면 좌표. geometry를 읽을 때마다 행/셀마다
// getBoundingClientRect를 정확히 한 번만 호출하려고 먼저 모아둔다.
type CellBox = {
  columnId: string;
  spansColumns: boolean;
  left: number;
  right: number;
  width: number;
};
export type RowBox = {
  rowId: string;
  top: number;
  height: number;
  cells: CellBox[];
};

type ColumnGeometry = {
  columnId: string;
  index: number;
  left: number;
  width: number;
  // 열 오른쪽 경계의 리사이즈 strip을 그릴 세로 구간들. 병합 셀이 경계를
  // 가로지르는 행은 제외한다(아래 readMergedLayout 참고) — 병합 셀
  // 내부를 strip이 덮으면 셀 클릭이 리사이즈 드래그로 가로채인다.
  resizeSegments: ResizeSegment[];
};

export type TableGeometry = {
  tableBlockId: string;
  // 헤더는 표 단위 플래그다(모델 headerRows/headerColumns: 0|1) — 메뉴의
  // 체크 상태를 렌더 DOM에서 그대로 읽는다.
  headerRows: number;
  headerColumns: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  rows: RowGeometry[];
  columns: ColumnGeometry[];
};

// G-TBL-001: 열 순서·개수의 권위는 표에 렌더된 data-geul-columns(모델
// table.columns와 같은 순서)다. columnId 문자열만 뽑아 쓴다.
// 속성 문자열의 해석은 model이 소유하고(Issue #75) DOM 접근만 여기 남는다.
// 해석 불가는 열 없음으로 접는다 — 핸들을 그리지 않으면 그만이고, 이
// 오버레이가 사용자에게 보고할 표면을 갖고 있지 않다.
export const readTableColumnIds = (table: HTMLElement): string[] => {
  const parsed = parseTableColumns(table.getAttribute("data-geul-columns"));
  return parsed.ok ? parsed.value.map((column) => column.id) : [];
};

// G-TBL-001: 행의 권위 있는 DOM 순서는 data-geul-row-id가 붙은 요소들이다
// (열의 data-geul-columns와 대칭). 열과 달리 행에는 별도의 순서 속성이
// 없다 — DOM 자체가 이미 순서의 권위다. table-handles.tsx의 메뉴 무효화
// effect(Issue #65)가 targetId의 현재 위치를 재해석하는 데 쓴다.
export const readTableRowIds = (table: HTMLElement): string[] =>
  Array.from(table.querySelectorAll<HTMLElement>("[data-geul-row-id]")).map(
    (row) => row.getAttribute("data-geul-row-id") ?? "",
  );

export type ColumnBound = { left: number; width: number };

// 첫 행만 보고 열 경계를 읽으면, 첫 행에 colspan>1 병합 셀이 있을 때
// 그 셀이 가리는 논리 열들의 경계를 아예 못 찾는다(핸들 개수가 실제
// 열 개수보다 적어짐). 모든 행을 훑어 각 열에서 처음 만나는 비병합
// (colspan 속성 없음) 셀의 rect를 그 열의 경계로 쓰고, 어느 행에서도
// 비병합 셀을 못 찾은 열(모든 행에서 병합된 열)은 이웃 열 경계 사이로
// 보간한다.
export const readColumnBounds = (
  columnIds: string[],
  rowBoxes: RowBox[],
  tableRect: DOMRect,
): ColumnBound[] => {
  const boundById = new Map<string, ColumnBound>();
  for (const rowBox of rowBoxes) {
    for (const cellBox of rowBox.cells) {
      if (cellBox.spansColumns) continue;
      if (cellBox.columnId === "" || boundById.has(cellBox.columnId)) continue;
      boundById.set(cellBox.columnId, {
        left: cellBox.left,
        width: cellBox.width,
      });
    }
  }
  return interpolateColumnBounds(columnIds, boundById, tableRect);
};

// 열 경계를 못 찾은 열(모든 행에서 병합된 열)을 이웃 열 경계 사이로 메운다.
// 병합 경로(readMergedColumns)도 같은 보간을 쓴다.
const interpolateColumnBounds = (
  columnIds: string[],
  boundById: Map<string, ColumnBound>,
  tableRect: DOMRect,
): ColumnBound[] => {
  const known = columnIds.map((id) => boundById.get(id) ?? null);
  for (let index = 0; index < known.length; index += 1) {
    if (known[index] !== null) continue;
    let before = index - 1;
    while (before >= 0 && known[before] === null) before -= 1;
    let after = index + 1;
    while (after < known.length && known[after] === null) after += 1;
    const beforeBound = before >= 0 ? (known[before] ?? null) : null;
    const afterBound = after < known.length ? (known[after] ?? null) : null;
    const left =
      beforeBound !== null
        ? beforeBound.left + beforeBound.width
        : (afterBound?.left ?? tableRect.left);
    const right = afterBound !== null ? afterBound.left : tableRect.right;
    known[index] = { left, width: Math.max(0, right - left) };
  }

  return known.map((bound) => bound ?? { left: tableRect.left, width: 0 });
};

const RESIZE_BOUNDARY_EPSILON = 1;

// 병합 셀이 없는 표의 열 strip. 모든 행에서 모든 열 경계가 셀 경계라 행 단위로
// 쪼갤 이유가 없다 — 첫 행 top부터 마지막 행 bottom까지 한 구간으로 합친다.
// 행마다 segment를 만들면 100x100 표에서 JSX 요소가 10,000개다(Issue #239).
// rowId는 React key용이라 첫 행 id를 쓴다. 행이 없으면 구간도 없다.
const readSpanlessResizeSegments = (rowBoxes: RowBox[]): ResizeSegment[] => {
  const first = rowBoxes[0];
  const last = rowBoxes[rowBoxes.length - 1];
  if (first === undefined || last === undefined) return [];
  return [
    {
      rowId: first.rowId,
      top: first.top,
      height: last.top + last.height - first.top,
    },
  ];
};

// colspan·rowspan 속성이 하나라도 있으면 병합 표다(span 1은 속성을 내보내지
// 않는다 — table-extension.ts). 10,000셀 표 전체를 훑으므로 geometry 판독
// 한 번에 정확히 한 번만 부르고 결과를 아래 계층에 넘긴다. 열마다 부르면
// 스캔이 열 수만큼 반복된다(Issue #239).
const hasMergedCells = (table: HTMLElement): boolean =>
  table.querySelector("[colspan],[rowspan]") !== null;

const readCellBoxes = (rowElement: HTMLElement): CellBox[] =>
  Array.from(
    rowElement.querySelectorAll<HTMLElement>("[data-geul-column-id]"),
  ).map((cellElement) => {
    const rect = readPageRect(cellElement);
    return {
      columnId: cellElement.getAttribute("data-geul-column-id") ?? "",
      spansColumns: cellElement.hasAttribute("colspan"),
      left: rect.left,
      right: rect.right,
      width: rect.width,
    };
  });

// 병합 셀이 없는 표의 행과 셀 rect. 모든 행이 같은 열 경계를 가지므로 첫 행
// 셀만 읽고 나머지 행은 그 CellBox를 공유한다(Issue #239). 공유한 CellBox는
// 읽기 전용이다. 행마다 셀을 다시 읽으면 getBoundingClientRect 호출이 열 수 x
// 셀 수로 늘어나 10,000셀 표(spec 13)의 드래그 프레임을 잡아먹는다.
const readSpanlessRowBoxes = (rowElements: HTMLElement[]): RowBox[] => {
  let sharedCells: CellBox[] | null = null;
  return rowElements.map((rowElement) => {
    const rowRect = readPageRect(rowElement);
    const cells = sharedCells ?? readCellBoxes(rowElement);
    sharedCells = cells;
    return {
      rowId: rowElement.getAttribute("data-geul-row-id") ?? "",
      top: rowRect.top,
      height: rowRect.height,
      cells,
    };
  });
};

// 병합 표의 한 행. `rights`는 이 행 셀들의 오른쪽 끝을 오름차순으로 모은 것이다.
// `plain`인 행(병합 셀이 없고 열마다 셀이 있다)은 모든 열 경계가 셀 경계라
// rights를 만들지 않는다.
type MergedRow = {
  rowId: string;
  top: number;
  height: number;
  plain: boolean;
  rights: number[];
};

// 오름차순 배열에 x와 RESIZE_BOUNDARY_EPSILON 이내인 값이 있는가.
const hasRightNear = (rights: number[], x: number): boolean => {
  let low = 0;
  let high = rights.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((rights[mid] as number) < x - RESIZE_BOUNDARY_EPSILON) low = mid + 1;
    else high = mid;
  }
  const candidate = rights[low];
  return candidate !== undefined && candidate <= x + RESIZE_BOUNDARY_EPSILON;
};

// 병합 표의 행·열 경계·resize segment를 읽는다(Issue #240). rect는 표 1 + 행 R
// + 병합 셀 M(`[colspan],[rowspan]`) + 열마다 처음 만나는 colspan 없는 셀 중
// 아직 읽지 않은 것(최대 C)만 읽는다. 나머지 셀의 오른쪽 끝은 같은 열 경계에서
// 도출한다 — 병합 셀이 없는 셀은 같은 열 셀과 가로 범위가 같다(table layout).
// 구 경로는 모든 셀 rect를 읽고, 열마다 행 x 셀을 비교해 행 단위 segment를
// 만들었다.
//
// segment 규칙은 구 경로와 영역이 같다. 열 경계 x가 셀 경계인 행만 덮는다.
// 병합 셀이 가로지르는 행은 빠지고(셀 클릭이 리사이즈 드래그로 가로채이지
// 않게), 연속한 "일반 행"(plain)은 하나로 합친다. 병합 셀이 든 행과 rowspan으로
// 셀이 빠진 행은 열마다 경계 여부가 달라 행 단위로 둔다.
const readMergedLayout = (
  rowElements: HTMLElement[],
  columnIds: string[],
  tableRect: DOMRect,
): { rows: MergedRow[]; bounds: ColumnBound[]; boundIds: Set<string> } => {
  const boundById = new Map<string, ColumnBound>();
  const pending = rowElements.map((rowElement) => {
    const rowRect = readPageRect(rowElement);
    const cells: Array<{ columnId: string; right: number | null }> = [];
    let irregular = false;
    for (const cellElement of rowElement.querySelectorAll<HTMLElement>(
      "[data-geul-column-id]",
    )) {
      const columnId = cellElement.getAttribute("data-geul-column-id") ?? "";
      const spansColumns = cellElement.hasAttribute("colspan");
      const merged = spansColumns || cellElement.hasAttribute("rowspan");
      let rect: DOMRect | null = merged ? readPageRect(cellElement) : null;
      if (merged) irregular = true;
      if (columnId === "") irregular = true;
      if (!spansColumns && columnId !== "" && !boundById.has(columnId)) {
        rect = rect ?? readPageRect(cellElement);
        boundById.set(columnId, { left: rect.left, width: rect.width });
      }
      cells.push({
        columnId,
        right: merged && rect !== null ? rect.right : null,
      });
    }
    return {
      rowId: rowElement.getAttribute("data-geul-row-id") ?? "",
      top: rowRect.top,
      height: rowRect.height,
      cells,
      plain: !irregular && cells.length === columnIds.length,
    };
  });

  const rows: MergedRow[] = pending.map((row) => ({
    rowId: row.rowId,
    top: row.top,
    height: row.height,
    plain: row.plain,
    rights: row.plain
      ? []
      : row.cells
          .map((cell) => {
            if (cell.right !== null) return cell.right;
            const bound = boundById.get(cell.columnId);
            return bound === undefined ? null : bound.left + bound.width;
          })
          .filter((right): right is number => right !== null)
          .sort((a, b) => a - b),
  }));

  return {
    rows,
    bounds: interpolateColumnBounds(columnIds, boundById, tableRect),
    boundIds: new Set(boundById.keys()),
  };
};

// 열 경계 x에서 resize strip을 그릴 세로 구간들. readMergedLayout 설명 참고.
const readMergedResizeSegments = (
  rows: MergedRow[],
  boundaryX: number,
  columnHasCell: boolean,
): ResizeSegment[] => {
  const segments: ResizeSegment[] = [];
  let run: { first: MergedRow; last: MergedRow } | null = null;
  const flush = () => {
    if (run === null) return;
    segments.push({
      rowId: run.first.rowId,
      top: run.first.top,
      height: run.last.top + run.last.height - run.first.top,
    });
    run = null;
  };
  for (const row of rows) {
    if (row.plain && columnHasCell) {
      if (run === null) run = { first: row, last: row };
      else run.last = row;
    } else if (!row.plain && hasRightNear(row.rights, boundaryX)) {
      flush();
      segments.push({ rowId: row.rowId, top: row.top, height: row.height });
    } else {
      flush();
    }
  }
  flush();
  return segments;
};

export const readTableGeometry = (table: HTMLElement): TableGeometry | null => {
  const tableBlockId = table.getAttribute("data-geul-block-id");
  if (tableBlockId === null) return null;

  const tableRect = readPageRect(table);
  const spanless = !hasMergedCells(table);
  const rowElements = Array.from(
    table.querySelectorAll<HTMLElement>("[data-geul-row-id]"),
  );
  const columnIds = readTableColumnIds(table);

  let rows: RowGeometry[];
  let bounds: ColumnBound[];
  let segmentsFor: (columnId: string, bound: ColumnBound) => ResizeSegment[];
  if (spanless) {
    const rowBoxes = readSpanlessRowBoxes(rowElements);
    rows = rowBoxes.map((rowBox, index) => ({
      rowId: rowBox.rowId,
      index,
      top: rowBox.top,
      height: rowBox.height,
    }));
    bounds = readColumnBounds(columnIds, rowBoxes, tableRect);
    segmentsFor = () => readSpanlessResizeSegments(rowBoxes);
  } else {
    const layout = readMergedLayout(rowElements, columnIds, tableRect);
    rows = layout.rows.map((row, index) => ({
      rowId: row.rowId,
      index,
      top: row.top,
      height: row.height,
    }));
    bounds = layout.bounds;
    segmentsFor = (columnId, bound) =>
      readMergedResizeSegments(
        layout.rows,
        bound.left + bound.width,
        layout.boundIds.has(columnId),
      );
  }

  const columns: ColumnGeometry[] = columnIds.map((columnId, index) => {
    const bound = bounds[index] ?? { left: tableRect.left, width: 0 };
    return {
      columnId,
      index,
      left: bound.left,
      width: bound.width,
      resizeSegments: segmentsFor(columnId, bound),
    };
  });

  return {
    tableBlockId,
    headerRows: Number(table.getAttribute("data-geul-header-rows") ?? "0"),
    headerColumns: Number(
      table.getAttribute("data-geul-header-columns") ?? "0",
    ),
    left: tableRect.left,
    top: tableRect.top,
    right: tableRect.right,
    bottom: tableRect.bottom,
    rows,
    columns,
  };
};

// "표 찾기 + geometry 판독" 2단계를 한 호출로 묶는다. table-handles.tsx
// 안에서 이 조합이 3곳(렌더 본문 geometry, readFreshGeometry,
// computeReorderTargetIndex)에 반복돼 있었다 — computeReorderTargetIndex는
// useCallback 안정화 때문에 컴포넌트 밖 모듈 스코프 함수라 element를 인자로
// 받는 형태가 아니면 공유할 수 없다(그릴링에서 확인). table 자체만 필요한
// 자리(hover 판정, 리사이즈 폭 읽기 등)는 readTableGeometry의 강제 레이아웃
// 비용을 피하려고 findTable만 계속 직접 쓴다.
export const readGeometryFor = (
  element: HTMLElement,
  tableBlockId: string,
): TableGeometry | null => {
  const table = findTable(element, tableBlockId);
  return table === null ? null : readTableGeometry(table);
};
