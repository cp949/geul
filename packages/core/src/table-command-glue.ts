import type { TabularData } from "@cp949/geul-io";
import type { Result } from "@cp949/geul-model";

import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";
import {
  deleteTableColumn as deleteTableColumnCommand,
  deleteTableRow as deleteTableRowCommand,
  fitTableColumnsToContainer as fitTableColumnsToContainerCommand,
  insertTableColumn as insertTableColumnCommand,
  insertTable as insertTableCommand,
  insertTableRow as insertTableRowCommand,
  mergeTableCells as mergeTableCellsCommand,
  moveTableColumn as moveTableColumnCommand,
  moveTableRow as moveTableRowCommand,
  resizeTableColumn as resizeTableColumnCommand,
  setTableCellAlign as setTableCellAlignCommand,
  setTableCellColor as setTableCellColorCommand,
  splitTableCell as splitTableCellCommand,
  type TableCommandError,
  toggleTableHeaderColumn as toggleTableHeaderColumnCommand,
  toggleTableHeaderRow as toggleTableHeaderRowCommand,
} from "./table-commands.js";
import { pasteTabularData as pasteTabularDataCommand } from "./table-paste-commands.js";
import type { TableCellTarget } from "./table-grid.js";

// 표 명령 15종(table-commands.ts/table-paste-commands.ts에 위임하는 얇은
// wrapper) + 공유 오류 변환기(tableErrorFromCode/tableErrorDetail) +
// 공유 실행기(runTableCommand) 묶음. editor-controller.ts의 createEditor에서
// 분리했다 — 다른 커맨드 그룹과 교차 참조가 없어 session 하나만 받는
// 독립 팩토리로 뗀다.
export const createTableCommands = (session: ProductionEditorSession) => {
  // G-EDT-001 회피 규칙: TableCommandError 같은 객체 타입을 클로저 밖 let에 담아
  // `!== null`로 좁히면 never로 잘못 좁혀진다 — TS 버전과 무관하다. 콜백
  // 안에서만 재대입되는 let을 바깥 스코프의 control-flow analysis가 못
  // 따라가는 구조적 한계다(그릴링: 카드 C9, TS 6.0.3 classic tsc에서도 재현 확인).
  // 클로저를 넘나드는 값은 원시 타입(code 문자열, blockId, width, message)만 쓴다.
  const tableErrorFromCode = (
    code: TableCommandError["code"],
    detail: {
      blockId: string;
      message: string;
      width: number;
      cellId: string;
      color: string;
      align: string;
    },
  ): EditorError => {
    switch (code) {
      case "BLOCK_NOT_FOUND":
        return { code: "BLOCK_NOT_FOUND", blockId: detail.blockId };
      case "TABLE_NOT_FOUND":
        return { code: "TABLE_NOT_FOUND", blockId: detail.blockId };
      case "TABLE_NODE_INVALID":
        return { code: "TABLE_NODE_INVALID", message: detail.message };
      case "INVALID_TABLE_SIZE":
        return { code: "INVALID_TABLE_SIZE" };
      case "INDEX_OUT_OF_RANGE":
        return { code: "INDEX_OUT_OF_RANGE" };
      case "MERGE_BOUNDARY_CROSSED":
        return { code: "MERGE_BOUNDARY_CROSSED" };
      case "COLUMN_WIDTH_OUT_OF_RANGE":
        return { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: detail.width };
      case "NOT_RECTANGULAR":
        return { code: "NOT_RECTANGULAR" };
      case "TABULAR_DATA_INVALID":
        return { code: "TABULAR_DATA_INVALID", message: detail.message };
      case "CELL_NOT_FOUND":
        return { code: "CELL_NOT_FOUND", cellId: detail.cellId };
      case "LAST_ROW":
        return { code: "LAST_ROW" };
      case "LAST_COLUMN":
        return { code: "LAST_COLUMN" };
      case "INVALID_COLOR":
        return { code: "INVALID_COLOR", color: detail.color };
      case "INVALID_ALIGN":
        return { code: "INVALID_ALIGN", align: detail.align };
      case "CELL_LIMIT_EXCEEDED":
        return { code: "CELL_LIMIT_EXCEEDED" };
      case "PASTE_MERGE_CONFLICT":
        return { code: "PASTE_MERGE_CONFLICT" };
      case "PASTE_TARGET_NOT_FOUND":
        return { code: "PASTE_TARGET_NOT_FOUND" };
      case "MERGE_TARGET_NOT_FOUND":
        return { code: "COMMAND_NOT_APPLICABLE", command: "mergeTableCells" };
      case "TRANSACTION_REJECTED":
        return { code: "TRANSACTION_REJECTED" };
      // 아래 세 case는 spec §11.3의 "core는 자체 TableGridError를 최상위
      // EditorError에 flatten만 한다"는 원칙에 따라 새 EditorError variant를
      // 만들지 않고 COMMAND_NOT_APPLICABLE로 흡수한다(MERGE_TARGET_NOT_FOUND와
      // 동형) — EditorError는 spec이 고정한 21개 코드 표면이라 TableCommandError
      // 쪽에서 새 코드가 늘어도 그대로 넓히지 않는다.
      case "CLIPBOARD_CONTENT_INVALID":
        // 오늘은 도달 불가 — pasteClipboardContent(table-paste-extension.ts)의
        // 거절은 onPasteRejected로 전달되고(Issue #36) 이 switch(runTableCommand
        // 전용)는 거치지 않는다.
        return { code: "COMMAND_NOT_APPLICABLE", command: "table" };
      case "TABLE_GRID_INVALID":
        // 도달 가능 — mergeCells·resolveTargetCellIds(setCellFormat 경유,
        // table-grid.ts)가 projectTableGrid 실패를 그대로 전파해 mergeTableCells·
        // setTableCellTextColor/BackgroundColor/Align 네 명령까지 이어진다.
        // DOCUMENT_INVALID로 매핑하지 않는다 — 그건 parseSupportedDocument의
        // load 경계 전용이고, 실행 중 grid 손상은 §11.3이 정의한
        // COMMAND_NOT_APPLICABLE("현재 상태에서 적용 불가능한 모든 명령이 공유")
        // 범주다.
        return { code: "COMMAND_NOT_APPLICABLE", command: "table" };
      case "CONTAINER_WIDTH_INVALID":
        // 도달 가능(Issue #176 RD-001-DELTA-02) — fitTableColumnsToContainer가
        // react에서 실측한 containerWidth를 그대로 받는다. 측정 시점에 표
        // DOM이 아직 붙지 않았거나(clientWidth 0) 컨테이너가 숨겨진 경우
        // 0 이하 값이 넘어올 수 있다.
        return { code: "COMMAND_NOT_APPLICABLE", command: "table" };
      default: {
        // TableCommandError에 새 variant가 추가되면 여기서 컴파일 실패한다 —
        // 위 매핑을 빠뜨린 채 조용히 COMMAND_NOT_APPLICABLE로 뭉개지던 gap을
        // 막는다(그릴링: 카드 M).
        const _exhaustive: never = code;
        throw new Error(
          `Unhandled TableCommandError code: ${String(_exhaustive)}`,
        );
      }
    }
  };

  // 표 명령 실패의 detail 추출은 한때 runVoidTableCommand·pasteTabularData·
  // insertTable 세 클로저가 각자 복제하다 캡처 누락 drift가 생겼던 자리다
  // (pasteTabularData만 TABLE_NODE_INVALID의 message가 ""로 나갔다) — 판별과
  // 추출을 여기 하나로 모으고, 아래 runTableCommand가 그 결과를 소비한다.
  const tableErrorDetail = (
    error: TableCommandError,
  ): Parameters<typeof tableErrorFromCode>[1] => ({
    blockId:
      error.code === "BLOCK_NOT_FOUND" || error.code === "TABLE_NOT_FOUND"
        ? error.blockId
        : "",
    message:
      error.code === "TABLE_NODE_INVALID" ||
      error.code === "TABULAR_DATA_INVALID"
        ? error.message
        : "",
    width: error.code === "COLUMN_WIDTH_OUT_OF_RANGE" ? error.width : 0,
    cellId: error.code === "CELL_NOT_FOUND" ? error.cellId : "",
    color: error.code === "INVALID_COLOR" ? error.color : "",
    align: error.code === "INVALID_ALIGN" ? error.align : "",
  });

  // 표 명령 12개(void 반환)와 pasteTabularData/insertTable(blockId 반환)가
  // 공유하는 실행기. session.runDocumentCommand의 boolean 결과 위에서 표 명령
  // 고유의 실패 detail(tableErrorDetail)과 성공 값을 함께 클로저 밖으로
  // 끌어낸다.
  //
  // G-EDT-001 회피 규칙: 클로저를 넘나드는 좁히기 대상은 원시 값(errorCode)만
  // 쓰고, detail은 null 좁히기 없이 mutate만 하는 const 객체에 담는다.
  // 성공 값(T)은 void거나 {blockId}뿐이라 원시 캡처로 우회할 수 없다 —
  // `result.ok`가 참이면 invoke()가 성공해 value가 반드시 채워졌다는 불변식을
  // 아래 `as T` 캐스트 한 곳에만 문서화한다. TS가 함수 경계를 넘는 이 불변식을
  // 구조적으로 증명하지 못하는 한계는 이 캐스트가 유일하게 아는 곳으로 남는다.
  const runTableCommand = <T = void>(
    command: string,
    invoke: () => Result<T, TableCommandError>,
  ): Result<T, EditorError> => {
    let errorCode: TableCommandError["code"] | null = null;
    const errorDetail = tableErrorDetail({ code: "INDEX_OUT_OF_RANGE" });
    let value: T | undefined;

    const result = session.runDocumentCommand(command, "local", () => {
      const outcome = invoke();
      if (!outcome.ok) {
        errorCode = outcome.error.code;
        Object.assign(errorDetail, tableErrorDetail(outcome.error));
        return false;
      }
      value = outcome.value;
      return true;
    });

    if (errorCode !== null) {
      return {
        ok: false,
        error: tableErrorFromCode(errorCode, errorDetail),
      };
    }
    if (!result.ok) return result;
    return { ok: true, value: value as T };
  };

  const pasteTabularData = (
    data: TabularData,
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("pasteTabularData");
    return runTableCommand("pasteTabularData", () =>
      pasteTabularDataCommand(session.editor, data, session.createId),
    );
  };
  const insertTable = (
    afterBlockId: string,
    size: { rows: number; columns: number },
    options?: { clearAfterBlockText?: boolean },
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("insertTable");
    return runTableCommand("insertTable", () =>
      insertTableCommand(
        session.editor,
        afterBlockId,
        size,
        session.createId,
        options,
      ),
    );
  };
  const insertTableRow = (
    tableBlockId: string,
    atIndex: number,
  ): Result<void, EditorError> =>
    runTableCommand("insertTableRow", () =>
      insertTableRowCommand(
        session.editor,
        tableBlockId,
        atIndex,
        session.createId,
      ),
    );
  const insertTableColumn = (
    tableBlockId: string,
    atIndex: number,
  ): Result<void, EditorError> =>
    runTableCommand("insertTableColumn", () =>
      insertTableColumnCommand(
        session.editor,
        tableBlockId,
        atIndex,
        session.createId,
      ),
    );
  const moveTableRow = (
    tableBlockId: string,
    fromIndex: number,
    toIndex: number,
  ): Result<void, EditorError> =>
    runTableCommand("moveTableRow", () =>
      moveTableRowCommand(session.editor, tableBlockId, fromIndex, toIndex),
    );
  const moveTableColumn = (
    tableBlockId: string,
    fromIndex: number,
    toIndex: number,
  ): Result<void, EditorError> =>
    runTableCommand("moveTableColumn", () =>
      moveTableColumnCommand(session.editor, tableBlockId, fromIndex, toIndex),
    );
  const resizeTableColumn = (
    tableBlockId: string,
    index: number,
    width: number,
  ): Result<void, EditorError> =>
    runTableCommand("resizeTableColumn", () =>
      resizeTableColumnCommand(session.editor, tableBlockId, index, width),
    );
  const fitTableColumnsToContainer = (
    tableBlockId: string,
    containerWidth: number,
  ): Result<void, EditorError> =>
    runTableCommand("fitTableColumnsToContainer", () =>
      fitTableColumnsToContainerCommand(
        session.editor,
        tableBlockId,
        containerWidth,
      ),
    );
  const mergeTableCells = (tableBlockId: string): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("mergeTableCells");
    return runTableCommand("mergeTableCells", () =>
      mergeTableCellsCommand(session.editor, tableBlockId),
    );
  };
  const splitTableCell = (
    tableBlockId: string,
    cellId: string,
  ): Result<void, EditorError> =>
    runTableCommand("splitTableCell", () =>
      splitTableCellCommand(
        session.editor,
        tableBlockId,
        cellId,
        session.createId,
      ),
    );
  const deleteTableRow = (
    tableBlockId: string,
    index: number,
  ): Result<void, EditorError> =>
    runTableCommand("deleteTableRow", () =>
      deleteTableRowCommand(session.editor, tableBlockId, index),
    );
  const deleteTableColumn = (
    tableBlockId: string,
    index: number,
  ): Result<void, EditorError> =>
    runTableCommand("deleteTableColumn", () =>
      deleteTableColumnCommand(session.editor, tableBlockId, index),
    );
  const toggleTableHeaderRow = (
    tableBlockId: string,
  ): Result<void, EditorError> =>
    runTableCommand("toggleTableHeaderRow", () =>
      toggleTableHeaderRowCommand(session.editor, tableBlockId),
    );
  const toggleTableHeaderColumn = (
    tableBlockId: string,
  ): Result<void, EditorError> =>
    runTableCommand("toggleTableHeaderColumn", () =>
      toggleTableHeaderColumnCommand(session.editor, tableBlockId),
    );
  const setTableCellTextColor = (
    tableBlockId: string,
    target: TableCellTarget,
    color: string | null,
  ): Result<void, EditorError> =>
    runTableCommand("setTableCellTextColor", () =>
      setTableCellColorCommand(
        session.editor,
        tableBlockId,
        target,
        "textColor",
        color,
      ),
    );
  const setTableCellBackgroundColor = (
    tableBlockId: string,
    target: TableCellTarget,
    color: string | null,
  ): Result<void, EditorError> =>
    runTableCommand("setTableCellBackgroundColor", () =>
      setTableCellColorCommand(
        session.editor,
        tableBlockId,
        target,
        "backgroundColor",
        color,
      ),
    );
  const setTableCellAlign = (
    tableBlockId: string,
    target: TableCellTarget,
    align: "left" | "center" | "right" | null,
  ): Result<void, EditorError> =>
    runTableCommand("setTableCellAlign", () =>
      setTableCellAlignCommand(session.editor, tableBlockId, target, align),
    );

  return {
    pasteTabularData,
    insertTable,
    insertTableRow,
    insertTableColumn,
    moveTableRow,
    moveTableColumn,
    resizeTableColumn,
    fitTableColumnsToContainer,
    mergeTableCells,
    splitTableCell,
    deleteTableRow,
    deleteTableColumn,
    toggleTableHeaderRow,
    toggleTableHeaderColumn,
    setTableCellTextColor,
    setTableCellBackgroundColor,
    setTableCellAlign,
  };
};
