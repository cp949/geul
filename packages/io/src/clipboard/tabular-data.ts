import {
  appendOrMergeInlineItem,
  type InlineContent,
  isCanonicalCellAlign,
  isCanonicalCellColor,
  isValidInlineText,
  validateGridCoverage,
} from "@cp949/geul-model";

import type { ClipboardParseError } from "../errors.js";
import type { Result } from "../result.js";

export type TabularCell = {
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
  content: InlineContent;
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
};

export type TabularData = {
  columnCount: number;
  rows: Array<{ cells: TabularCell[] }>;
};

const invalidTable = (message: string): Result<never, ClipboardParseError> => ({
  ok: false,
  error: { code: "CLIPBOARD_TABLE_INVALID", message },
});

// TabularData 자체의 구조 검증(직사각형, 0셀 아님) — 대상 표와의 병합
// 충돌 검사(core의 TableGrid.pasteInto)와는 다른 층위다.
export const validateTabularData = (
  data: TabularData,
): Result<undefined, ClipboardParseError> => {
  // NaN은 `=== 0`도 `< 1`도 false라 아래 빈 데이터 가드를 통과하고,
  // validateGridCoverage의 new Array(rowCount * columnCount)가 RangeError를
  // 던져 Result 계약 밖으로 예외가 새어나간다 — 산술에 쓰기 전에 막는다.
  if (!Number.isInteger(data.columnCount) || data.columnCount < 0) {
    return invalidTable("columnCount must be a positive integer");
  }
  if (data.rows.length === 0 || data.columnCount === 0) {
    return {
      ok: false,
      error: { code: "CLIPBOARD_TABLE_INVALID", message: "Table is empty" },
    };
  }

  // 셀 텍스트가 model의 인라인 텍스트 계약을 어기면 붙여넣기 결과가 문서로
  // 커밋될 때 parseDocument가 터진다 — 뮤테이션 전에 여기서 거절한다.
  for (const [rowIndex, row] of data.rows.entries()) {
    for (const [cellIndex, cellEntry] of row.cells.entries()) {
      for (const item of cellEntry.content) {
        if (isValidInlineText(item.text)) continue;
        return {
          ok: false,
          error: {
            code: "CLIPBOARD_TABLE_INVALID",
            message: `Cell text at row ${rowIndex}, cell ${cellIndex} is not valid inline text`,
          },
        };
      }
    }
  }

  // 서식 값이 model의 정규 형식(대문자 #RRGGBB, left|center|right)을 어기면
  // 텍스트 계약 위반과 똑같이 parseDocument가 커밋 시점에 거절한다 — 문서를
  // 건드리기 전에 여기서 막아야 model과 에디터가 영구 desync되지 않는다.
  for (const [rowIndex, row] of data.rows.entries()) {
    for (const [cellIndex, cellEntry] of row.cells.entries()) {
      const at = `row ${rowIndex}, cell ${cellIndex}`;
      if (
        cellEntry.textColor !== undefined &&
        !isCanonicalCellColor(cellEntry.textColor)
      ) {
        return invalidTable(`Cell textColor at ${at} is not a canonical color`);
      }
      if (
        cellEntry.backgroundColor !== undefined &&
        !isCanonicalCellColor(cellEntry.backgroundColor)
      ) {
        return invalidTable(
          `Cell backgroundColor at ${at} is not a canonical color`,
        );
      }
      if (
        cellEntry.align !== undefined &&
        !isCanonicalCellAlign(cellEntry.align)
      ) {
        return invalidTable(`Cell align at ${at} is not a canonical align`);
      }
    }
  }

  // TableGrid.pasteInto는 각 행의 cells가 columnIndex 오름차순이라고 보고
  // 배열 순서대로 열에 대응시킨다. 정렬을 조용히 고쳐주면 계약이 흐려지므로
  // 경계에서 거절한다.
  for (const [rowIndex, row] of data.rows.entries()) {
    let previousColumnIndex = -1;
    for (const cellEntry of row.cells) {
      if (cellEntry.columnIndex <= previousColumnIndex) {
        return invalidTable(
          `Cells in row ${rowIndex} are not sorted by ascending columnIndex`,
        );
      }
      previousColumnIndex = cellEntry.columnIndex;
    }
  }

  const cells = data.rows.flatMap((row, rowIndex) =>
    row.cells.map((cellEntry) => ({
      row: rowIndex,
      column: cellEntry.columnIndex,
      rowSpan: cellEntry.rowSpan,
      columnSpan: cellEntry.columnSpan,
    })),
  );

  const validation = validateGridCoverage(
    data.rows.length,
    data.columnCount,
    cells,
  );
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_TABLE_INVALID",
        message: `Table layout is invalid: ${validation.error.reason}`,
      },
    };
  }
  return { ok: true, value: undefined };
};

// 인라인 런을 이어 붙이되 이웃한 같은 마크 런은 하나로 합치고 빈 런은
// 버린다 — 호출자(core)가 표에 커밋하기 전 인라인 검증에서 인접 동일 마크
// 런과 빈 텍스트 런을 모두 거절하므로, 여기서 병합하지 않으면 그 검증에
// 걸린다. appendOrMergeInlineItem은 push할 때 항상 새 조각을 만들어 넣으므로
// (원본 run 참조를 그대로 담지 않는다) 호출자가 넘긴 데이터를 건드리지 않기
// 위한 별도 교체 로직이 필요 없다.
const appendInlineRuns = (target: InlineContent, runs: InlineContent): void => {
  for (const run of runs) {
    appendOrMergeInlineItem(target, run.text, run.marks);
  }
};

// 세그먼트들을 LF 하나로 이어 붙인다. 빈 세그먼트는 건너뛰므로 빈 셀 앞뒤에
// 구분자만 남는 일이 없다. 셀 안 줄바꿈을 LF로 표현하는 것은 기존 셀 텍스트
// 계약과 같다.
const joinInlineSegments = (segments: InlineContent[]): InlineContent => {
  const joined: InlineContent = [];
  for (const segment of segments) {
    if (segment.every((run) => run.text.length === 0)) continue;
    if (joined.length > 0) appendInlineRuns(joined, [{ text: "\n" }]);
    appendInlineRuns(joined, segment);
  }
  return joined;
};

// 논리 열 좌표가 가장 작은/큰 셀의 배열 인덱스. TabularData.rows[].cells의
// 배열 순서는 열 순서의 권위가 아니므로(공개 API로 직접 들어온 데이터는
// 정렬돼 있지 않을 수 있다) columnIndex로 판정한다.
const extremeCellIndex = (
  cells: TabularCell[],
  pick: "min" | "max",
): number | null => {
  let found: number | null = null;
  for (const [index, cell] of cells.entries()) {
    const current = cells[found ?? -1];
    if (
      current === undefined ||
      (pick === "min"
        ? cell.columnIndex < current.columnIndex
        : cell.columnIndex > current.columnIndex)
    ) {
      found = index;
    }
  }
  return found;
};

// 표 셀은 블록 자식을 가질 수 없다(model `TableCell.content: InlineContent`).
// 표를 감싼 문단이 표 안/밖 경계에서 사라지지 않도록, 읽기 순서를 지켜 셀
// 인라인 콘텐츠에 합친다 — 앞쪽 콘텐츠는 좌상단 셀 앞에, 뒤쪽 콘텐츠는
// 마지막 셀 뒤에 붙는다. 1×1 표에서는 두 셀이 같으므로 앞뒤가 한 셀에
// 순서대로 쌓인다.
export const withParagraphsMergedIntoCells = (
  data: TabularData,
  leading: InlineContent[],
  trailing: InlineContent[],
): TabularData => {
  if (leading.length === 0 && trailing.length === 0) return data;

  const rows = data.rows.map((row) => ({ cells: [...row.cells] }));
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  if (firstRow === undefined || lastRow === undefined) return data;

  if (leading.length > 0) {
    const index = extremeCellIndex(firstRow.cells, "min");
    const cell = index === null ? undefined : firstRow.cells[index];
    if (index !== null && cell !== undefined) {
      firstRow.cells[index] = {
        ...cell,
        content: joinInlineSegments([...leading, cell.content]),
      };
    }
  }

  if (trailing.length > 0) {
    const index = extremeCellIndex(lastRow.cells, "max");
    const cell = index === null ? undefined : lastRow.cells[index];
    if (index !== null && cell !== undefined) {
      lastRow.cells[index] = {
        ...cell,
        content: joinInlineSegments([cell.content, ...trailing]),
      };
    }
  }

  return { columnCount: data.columnCount, rows };
};
