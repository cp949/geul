import type { TabularData } from "@cp949/geul-io";
import {
  type Document as BlockDocument,
  type HeadingBlock,
  type IdFactory,
  isSupportedLinkHref,
  type Result,
  type TextMark,
} from "@cp949/geul-model";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { CellSelection, isInTable, selectedRect } from "@tiptap/pm/tables";

import {
  type DividerCommandError,
  insertDivider as insertDividerCommand,
} from "./divider-commands.js";
import { selectionIntersectsCodeBlock } from "./code-block-mark-guard-extension.js";
import type { EditorError } from "./errors.js";
import { createGenericBlockCommands } from "./generic-block-commands.js";
import { getBlockNestingActionState } from "./indent-commands.js";
import {
  commandNotApplicable,
  ProductionEditorSession,
} from "./production-editor-session.js";
import type { PasteRejectedReason } from "./table-command-error.js";
import {
  deleteTableColumn as deleteTableColumnCommand,
  deleteTableRow as deleteTableRowCommand,
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

export type DocumentChangeEvent = {
  revision: number;
  changedBlockIds: readonly string[];
  reason: "local" | "replace" | "undo" | "redo";
};

export type BlockNestingActionState = {
  canIndent: boolean;
  canOutdent: boolean;
};

export interface EditorController {
  mount(element: HTMLElement): void;
  unmount(): void;
  destroy(): void;
  getDocument(): BlockDocument;
  getSelectionMarks(): TextMark["type"][];
  getSelectionLink(): { href: string } | null;
  getCaretBlockContext(): {
    blockId: string;
    blockType: BlockTypeDescriptor;
    text: string;
  } | null;
  getSelectionBlockType(): {
    blockId: string;
    blockType: BlockTypeDescriptor;
  } | null;
  getBlockNestingActionState(blockId: string): BlockNestingActionState;
  getTableCellSelection(): TableCellSelection | null;
  replaceDocument(next: unknown): Result<void, EditorError>;
  readonly commands: {
    setText(blockId: string, text: string): Result<void, EditorError>;
    insertParagraphAfter(
      blockId: string,
    ): Result<{ blockId: string }, EditorError>;
    setBlockType(
      blockId: string,
      blockType: SetBlockTypeDescriptor,
      options?: { clearContent?: boolean },
    ): Result<void, EditorError>;
    moveBlockBefore(
      blockId: string,
      beforeBlockId: string | null,
    ): Result<void, EditorError>;
    duplicateBlock(blockId: string): Result<{ blockId: string }, EditorError>;
    deleteBlock(blockId: string): Result<void, EditorError>;
    indentBlock(blockId: string): Result<void, EditorError>;
    outdentBlock(blockId: string): Result<void, EditorError>;
    toggleCheckListItemChecked(blockId: string): Result<void, EditorError>;
    toggleBold(): Result<void, EditorError>;
    toggleItalic(): Result<void, EditorError>;
    toggleUnderline(): Result<void, EditorError>;
    toggleStrike(): Result<void, EditorError>;
    toggleCode(): Result<void, EditorError>;
    setLink(href: string): Result<void, EditorError>;
    unsetLink(): Result<void, EditorError>;
    pasteTabularData(
      data: TabularData,
    ): Result<{ blockId: string }, EditorError>;
    insertTable(
      afterBlockId: string,
      size: { rows: number; columns: number },
      options?: { clearAfterBlockText?: boolean },
    ): Result<{ blockId: string }, EditorError>;
    insertDivider(
      afterBlockId: string,
      options?: { clearAfterBlockText?: boolean },
    ): Result<{ blockId: string }, EditorError>;
    insertTableRow(
      tableBlockId: string,
      atIndex: number,
    ): Result<void, EditorError>;
    insertTableColumn(
      tableBlockId: string,
      atIndex: number,
    ): Result<void, EditorError>;
    moveTableRow(
      tableBlockId: string,
      fromIndex: number,
      toIndex: number,
    ): Result<void, EditorError>;
    moveTableColumn(
      tableBlockId: string,
      fromIndex: number,
      toIndex: number,
    ): Result<void, EditorError>;
    resizeTableColumn(
      tableBlockId: string,
      index: number,
      width: number,
    ): Result<void, EditorError>;
    mergeTableCells(tableBlockId: string): Result<void, EditorError>;
    splitTableCell(
      tableBlockId: string,
      cellId: string,
    ): Result<void, EditorError>;
    deleteTableRow(
      tableBlockId: string,
      index: number,
    ): Result<void, EditorError>;
    deleteTableColumn(
      tableBlockId: string,
      index: number,
    ): Result<void, EditorError>;
    toggleTableHeaderRow(tableBlockId: string): Result<void, EditorError>;
    toggleTableHeaderColumn(tableBlockId: string): Result<void, EditorError>;
    setTableCellTextColor(
      tableBlockId: string,
      target: TableCellTarget,
      color: string | null,
    ): Result<void, EditorError>;
    setTableCellBackgroundColor(
      tableBlockId: string,
      target: TableCellTarget,
      color: string | null,
    ): Result<void, EditorError>;
    setTableCellAlign(
      tableBlockId: string,
      target: TableCellTarget,
      align: "left" | "center" | "right" | null,
    ): Result<void, EditorError>;
    undo(): Result<void, EditorError>;
    redo(): Result<void, EditorError>;
  };
}

// spec §4.1 — heading level 1-6. 모델 HeadingBlock.level 범위를 그대로 파생해
// 두 곳에 리터럴을 복제하지 않는다. 공개 export가 아닌 module-local 별칭이다.
type HeadingLevel = HeadingBlock["level"];

export type SetBlockTypeDescriptor =
  | { type: "paragraph" }
  | { type: "heading"; level: HeadingLevel }
  | { type: "quote" }
  | { type: "codeBlock"; language?: string }
  | { type: "bulletListItem" }
  | { type: "numberedListItem"; startNumber?: number | null };

export type BlockTypeDescriptor =
  | { type: "paragraph" }
  | { type: "heading"; level: HeadingLevel }
  | { type: "quote" }
  | { type: "codeBlock"; language?: string }
  | { type: "bulletListItem" }
  | { type: "numberedListItem"; startNumber?: number };

// react/block-side-menu.tsx의 findBlockTypeDescriptor가 저장 Block에서
// 재구현하던 것과 같은 leaf 매핑이다(아키텍처 리뷰 6차 후보 L3). 입력은
// 진짜 model Block이 아니다 — PM node(아래 blockTypeDescriptorFromNode)와
// 저장 Block 양쪽 모두 이 판별 유니온으로 구조적으로 좁혀지므로(각 호출자가
// 자기 표현에서 이 유니온만 조립), Block 전체를 여기로 들여오거나
// PM→Block 변환을 새로 만들 필요가 없다. table·divider는
// BlockTypeDescriptor가 다루지 않는 종류라 null로 떨어진다 — 두 호출자
// 모두 원래 코드에서 이미 이렇게 동작했다(react는 명시 null 분기, core는
// default 분기).
//
// react/block-side-menu.tsx의 findBlockTypeDescriptor가 저장 Block을 좁히지
// 않고 그대로 넘기므로, model의 Block 유니온이 늘 때마다 이 유니온도 같은
// 멤버를 갖춰야 한다 — 아니면 그 호출부가 컴파일 실패한다. toggleListItem은
// RD-003(Issue #38 슬라이스 6)에서 Block에 추가됐지만 BlockTypeDescriptor가
// 아직 Turn into 대상으로 다루지 않아 table·divider와 같은 자리에서
// null로 떨어진다 — RD-004가 BlockTypeDescriptor에 toggleListItem을 추가하면
// 이 null 분기에서 뺀다. checkListItem도 RD-001(model 저장 계약 DELTA)에서
// 같은 이유로 추가됐다 — Turn into 배선은 이 RD의 react UI DELTA가 맡는다.
export type BlockTypeSource =
  | { type: "paragraph" }
  | { type: "heading"; level: HeadingLevel }
  | { type: "quote" }
  | { type: "codeBlock"; language?: string }
  | { type: "bulletListItem" }
  | { type: "numberedListItem"; startNumber?: number }
  | { type: "checkListItem" }
  | { type: "toggleListItem" }
  | { type: "divider" }
  | { type: "table" };

export const blockTypeDescriptorFromBlock = (
  source: BlockTypeSource,
): BlockTypeDescriptor | null =>
  source.type === "divider" ||
  source.type === "table" ||
  source.type === "checkListItem" ||
  source.type === "toggleListItem"
    ? null
    : source;

// PM block content node를 BlockTypeSource로 좁힌 뒤 blockTypeDescriptorFromBlock에
// 위임한다. PM attrs는 unknown이라 캐스트가 이 지점에서만 필요하다 — caret과
// selection 조회가 같은 타입·attrs 규칙을 공유하고 PM node 자체는 공개하지
// 않는다.
const blockTypeSourceFromNode = (
  node: ProseMirrorNode,
): BlockTypeSource | null => {
  switch (node.type.name) {
    case "paragraph":
      return { type: "paragraph" };
    case "heading":
      return { type: "heading", level: node.attrs.level as HeadingLevel };
    case "quote":
      return { type: "quote" };
    case "codeBlock":
      return {
        type: "codeBlock",
        ...(typeof node.attrs.language === "string"
          ? { language: node.attrs.language }
          : {}),
      };
    case "bulletListItem":
      return { type: "bulletListItem" };
    case "numberedListItem":
      return {
        type: "numberedListItem",
        ...(typeof node.attrs.startNumber === "number"
          ? { startNumber: node.attrs.startNumber }
          : {}),
      };
    case "toggleListItem":
      return { type: "toggleListItem" };
    case "divider":
      return { type: "divider" };
    case "table":
      return { type: "table" };
    default:
      return null;
  }
};

const blockTypeDescriptorFromNode = (
  node: ProseMirrorNode,
): BlockTypeDescriptor | null => {
  const source = blockTypeSourceFromNode(node);
  return source === null ? null : blockTypeDescriptorFromBlock(source);
};

// CellSelection이 덮는 서로 다른 기준 셀들을 primitive 값(cellId)만으로
// 나열한다. 병합 가능 여부는 cellIds.length > 1로 호출부가 직접 파생한다.
// splitCellId는 선택이 이미 병합된 셀 하나만 덮을 때 그 cellId다. 삼중클릭이
// 만드는 병합되지 않은 단일 셀 CellSelection은 cellIds.length가 1이라
// 병합 대상이 아니고 splitCellId=null이지만 cellIds는 채워진다 —
// 서식(색상·정렬)은 여전히 대상이다(spec 7.2).
export type TableCellSelection = {
  tableBlockId: string;
  cellIds: string[];
  splitCellId: string | null;
};

// selectedRect가 덮는 좌표들을 훑어 서로 다른 기준 셀의 id만 순서대로
// 모은다. TableMap.map은 좌표마다 그 좌표를 채우는 셀의 시작 위치를 담으므로,
// 병합 셀은 자신이 덮는 모든 좌표에서 같은 값이 반복된다 — 처음 등장하는
// 오프셋에서만 push한다. PM 노드 참조가 아닌 원시값만 클로저 밖으로 낸다
// (G-EDT-001).
const collectCellSelection = (
  state: EditorState,
  rect: ReturnType<typeof selectedRect>,
): { cellIds: string[]; singleMergedCellId: string | null } => {
  const seenOffsets = new Set<number>();
  const cellIds: string[] = [];
  let firstCellMerged = false;
  for (let row = rect.top; row < rect.bottom; row += 1) {
    for (let column = rect.left; column < rect.right; column += 1) {
      const offset = rect.map.map[row * rect.map.width + column];
      if (offset === undefined || seenOffsets.has(offset)) continue;
      seenOffsets.add(offset);
      const cellNode = state.doc.nodeAt(rect.tableStart + offset);
      const cellId = cellNode?.attrs.cellId;
      if (typeof cellId !== "string" || cellId.length === 0) continue;
      cellIds.push(cellId);
      if (cellIds.length === 1) {
        const rowSpan = (cellNode?.attrs.rowspan as number | undefined) ?? 1;
        const colSpan = (cellNode?.attrs.colspan as number | undefined) ?? 1;
        firstCellMerged = rowSpan > 1 || colSpan > 1;
      }
    }
  }
  const singleMergedCellId =
    cellIds.length === 1 && firstCellMerged ? (cellIds[0] ?? null) : null;
  return { cellIds, singleMergedCellId };
};

export type CreateEditorOptions = {
  initialDocument: BlockDocument;
  /**
   * 매 호출마다 model ID 문자열 계약을 만족하고 현재 문서의 모든
   * block·table column·row·cell ID와 유일한 ID를 반환해야 한다.
   * BlockIdExtension의 누락·중복 block ID 보정과 duplicateBlock은 100회
   * 안에 유효하고 유일한 ID를 얻지 못하면 RangeError를 던진다.
   */
  createId?: IdFactory;
  onChange?: (event: DocumentChangeEvent) => void;
  onPasteRejected?: (reason: PasteRejectedReason) => void;
};

const toggleableMarkTypes: ReadonlyArray<TextMark["type"]> = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
];

// $pos 조상 중 가장 가까운 blockContainer의 blockId를 찾는다.
// paragraph/heading은 더 이상 blockId를 직접 갖지 않는다(D19) — 조상인
// blockContainer가 identity를 소유한다.
const nearestBlockContainerId = (position: ResolvedPos): string | null => {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    const node = position.node(depth);
    if (node.type.name === "blockContainer") {
      const blockId = node.attrs.blockId;
      return typeof blockId === "string" && blockId.length > 0 ? blockId : null;
    }
  }
  return null;
};

// getSelectionBlockType 전용: [from, to] 범위를 완전히 포함하는 가장 깊은
// blockContainer(그 첫 자식이 paragraph/heading/quote/codeBlock인 경우)를 재귀로 찾는다.
// blockGroup?이 없는 컨테이너는 자신의 nodeSize 전체(닫는 태그 포함)까지
// 상한으로 받아들인다 — collapsed 캐럿뿐 아니라 AllSelection(전체 선택)의
// to가 컨테이너 자신의 닫는 경계까지 닿는 경우도 "그 블록 전체 선택"으로
// 인정해야 하기 때문이다. blockGroup이 있으면 상한을 blockContent 끝으로
// 좁혀 자식 쪽으로 범위가 새어 들어가는 선택은 컨테이너 자신이 아니라
// blockGroup 재귀로 넘긴다 — 부모·자식에 걸친 선택은 어느 쪽과도 매치되지
// 않아 null로 남는다(기존 "여러 최상위 블록에 걸치면 null" 계약의 재귀판).
const findSelectionBlock = (
  node: ProseMirrorNode,
  nodeStart: number,
  from: number,
  to: number,
): { blockId: string; blockType: BlockTypeDescriptor } | null => {
  let result: { blockId: string; blockType: BlockTypeDescriptor } | null = null;
  node.forEach((child, childOffset) => {
    if (result !== null) return;
    const childStart = nodeStart + childOffset;
    const childEnd = childStart + child.nodeSize;
    if (from < childStart || to > childEnd) return;

    if (child.type.name === "blockGroup") {
      result = findSelectionBlock(child, childStart + 1, from, to);
      return;
    }
    if (child.type.name !== "blockContainer") return;

    const blockId = child.attrs.blockId;
    if (typeof blockId !== "string" || blockId.length === 0) return;
    const blockContent = child.firstChild;
    if (blockContent === null) return;
    const contentStart = childStart + 1;
    const contentEnd = contentStart + blockContent.nodeSize;
    const hasGroupChild = child.childCount > 1;

    if (to <= (hasGroupChild ? contentEnd : childEnd)) {
      const blockType = blockTypeDescriptorFromNode(blockContent);
      if (blockType !== null) {
        result = {
          blockId,
          blockType,
        };
      }
      return;
    }

    if (hasGroupChild) {
      result = findSelectionBlock(child.child(1), contentEnd + 1, from, to);
    }
  });
  return result;
};

export const createEditor = (
  options: CreateEditorOptions,
): EditorController => {
  const session = new ProductionEditorSession(options);
  const genericBlockCommands = createGenericBlockCommands(session);

  const rejectCodeBlockMark = (): Result<void, EditorError> | null => {
    if (session.isDestroyed) return null;
    const state = session.editor.state;
    return selectionIntersectsCodeBlock(state.doc, state.selection)
      ? { ok: false, error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" } }
      : null;
  };

  const runSelectionCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    const rejected = rejectCodeBlockMark();
    if (rejected !== null) return rejected;
    if (session.editor.state.selection.empty) {
      return commandNotApplicable(command);
    }
    return session.runDocumentCommand(command, "local", run);
  };

  const runApplicableLinkCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    if (
      session.editor.state.selection.empty &&
      !session.editor.isActive("link")
    ) {
      return commandNotApplicable(command);
    }
    return session.runDocumentCommand(command, "local", run);
  };

  const runLinkCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    const rejected = rejectCodeBlockMark();
    if (rejected !== null) return rejected;
    return runApplicableLinkCommand(command, run);
  };

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
      // 아래 두 case는 spec §11.3의 "core는 자체 TableGridError를 최상위
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

  // divider 삽입 명령(divider-commands.ts)의 Result를 session.runDocumentCommand의
  // boolean 위에서 꺼내는 래퍼. runTableCommand를 재사용하지 않는다 — 그
  // 실행기는 TableCommandError 전체(격자 오류 detail 추출·tableErrorFromCode
  // 분기)를 전제하는데 divider 명령의 오류는 BLOCK_NOT_FOUND·
  // TRANSACTION_REJECTED 둘뿐이라 표 의미를 빌릴 이유가 없다.
  //
  // G-EDT-001 회피 규칙: 클로저 밖으로 나오는 값은 mutate만 하는 const 홀더
  // 객체(captured)에 담는다 — runTableCommand의 errorDetail과 같은 형태다.
  // `let x: T | null = null` 원시 캡처는 TS가 클로저 안 대입을 보지 못해
  // 초기 리터럴 null로 좁히고, `x !== null` 블록 안에서 x가 never가 된다 —
  // 비교식이 통과하는 건 never가 모든 타입과 comparable이기 때문이지 좁히기가
  // 옳아서가 아니다(속성 접근·switch로 바꾸면 깨진다). 홀더 객체의 속성은
  // 초기 리터럴로 좁혀지지 않아 클로저 대입 뒤에도 정상 narrowing이다.
  // BLOCK_NOT_FOUND의 blockId는 명령이 조회하는 유일한 블록인 afterBlockId
  // 그 자체라 따로 캡처하지 않는다.
  const insertDivider = (
    afterBlockId: string,
    options?: { clearAfterBlockText?: boolean },
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("insertDivider");
    const captured: {
      code: DividerCommandError["code"] | null;
      blockId: string | null;
    } = { code: null, blockId: null };

    const result = session.runDocumentCommand("insertDivider", "local", () => {
      const outcome = insertDividerCommand(
        session.editor,
        afterBlockId,
        session.createId,
        options,
      );
      if (!outcome.ok) {
        captured.code = outcome.error.code;
        return false;
      }
      captured.blockId = outcome.value.blockId;
      return true;
    });

    if (captured.code !== null) {
      return captured.code === "BLOCK_NOT_FOUND"
        ? {
            ok: false,
            error: { code: "BLOCK_NOT_FOUND", blockId: afterBlockId },
          }
        : { ok: false, error: { code: "TRANSACTION_REJECTED" } };
    }
    if (!result.ok) return result;
    if (captured.blockId === null) {
      return commandNotApplicable("insertDivider");
    }
    return { ok: true, value: { blockId: captured.blockId } };
  };

  return {
    mount(element) {
      session.mount(element);
    },
    unmount() {
      session.unmount();
    },
    destroy() {
      session.destroy();
    },
    getDocument() {
      return session.getDocument();
    },
    getSelectionMarks() {
      if (session.isDestroyed) return [];
      return toggleableMarkTypes.filter((type) =>
        session.editor.isActive(type),
      );
    },
    getSelectionLink() {
      if (session.isDestroyed) return null;
      const href = session.editor.getAttributes("link").href;
      return typeof href === "string" ? { href } : null;
    },
    getCaretBlockContext() {
      if (session.isDestroyed) return null;
      const { selection } = session.editor.state;
      if (!selection.empty) return null;

      const node = selection.$from.parent;
      const blockType = blockTypeDescriptorFromNode(node);
      if (blockType === null) return null;
      // blockId는 더 이상 이 노드(paragraph/heading/quote) 자신의 attrs가
      // 아니다(D19) — 가장 가까운 blockContainer 조상이 소유한다.
      const blockId = nearestBlockContainerId(selection.$from);
      if (blockId === null) return null;

      return { blockId, blockType, text: node.textContent };
    },
    getSelectionBlockType() {
      if (session.isDestroyed) return null;
      const { selection, doc } = session.editor.state;
      return findSelectionBlock(doc, 0, selection.from, selection.to);
    },
    getBlockNestingActionState(blockId) {
      if (session.isDestroyed || session.revision >= Number.MAX_SAFE_INTEGER) {
        return { canIndent: false, canOutdent: false };
      }
      return getBlockNestingActionState(session.editor.state.doc, blockId);
    },
    getTableCellSelection() {
      if (session.isDestroyed) return null;
      const state = session.editor.state;
      if (!isInTable(state)) return null;

      const rect = selectedRect(state);
      const tableBlockId = rect.table.attrs.blockId;
      if (typeof tableBlockId !== "string" || tableBlockId.length === 0) {
        return null;
      }

      if (state.selection instanceof CellSelection) {
        const { cellIds, singleMergedCellId } = collectCellSelection(
          state,
          rect,
        );
        if (cellIds.length === 0) return null;
        return {
          tableBlockId,
          cellIds,
          splitCellId: singleMergedCellId,
        };
      }

      // 캐럿이 이미 병합된 셀 안에 있으면(선택 없이도) 분할과 서식(색상·
      // 정렬) 컨트롤을 노출한다. 병합되지 않은 셀 안의 캐럿(일반 입력 중)은
      // null — 표에 타이핑하는 내내 툴바가 떠 있지 않게 한다(spec 7.2).
      const cellPosition =
        rect.tableStart +
        (rect.map.map[rect.top * rect.map.width + rect.left] ?? -1);
      const cellNode =
        cellPosition < rect.tableStart ? null : state.doc.nodeAt(cellPosition);
      if (cellNode === null || cellNode === undefined) return null;
      const rowSpan = cellNode.attrs.rowspan as number;
      const colSpan = cellNode.attrs.colspan as number;
      if (rowSpan <= 1 && colSpan <= 1) return null;
      const cellId = cellNode.attrs.cellId;
      if (typeof cellId !== "string" || cellId.length === 0) return null;
      return {
        tableBlockId,
        cellIds: [cellId],
        splitCellId: cellId,
      };
    },
    replaceDocument(next) {
      return session.replaceDocument(next);
    },
    commands: {
      ...genericBlockCommands,
      toggleBold: () =>
        runSelectionCommand("toggleBold", () =>
          session.editor.commands.toggleBold(),
        ),
      toggleItalic: () =>
        runSelectionCommand("toggleItalic", () =>
          session.editor.commands.toggleItalic(),
        ),
      toggleUnderline: () =>
        runSelectionCommand("toggleUnderline", () =>
          session.editor.commands.toggleUnderline(),
        ),
      toggleStrike: () =>
        runSelectionCommand("toggleStrike", () =>
          session.editor.commands.toggleStrike(),
        ),
      toggleCode: () =>
        runSelectionCommand("toggleCode", () =>
          session.editor.commands.toggleCode(),
        ),
      setLink: (href) => {
        const rejected = rejectCodeBlockMark();
        if (rejected !== null) return rejected;
        if (!isSupportedLinkHref(href)) {
          return { ok: false, error: { code: "LINK_HREF_REJECTED", href } };
        }
        if (session.editor.isActive("link", { href })) {
          return commandNotApplicable("setLink");
        }
        return runApplicableLinkCommand("setLink", () => {
          const chain = session.editor.chain();
          if (session.editor.state.selection.empty) {
            chain.extendMarkRange("link");
          }
          return chain.setLink({ href }).run();
        });
      },
      unsetLink: () =>
        runLinkCommand("unsetLink", () => {
          const chain = session.editor.chain();
          if (session.editor.state.selection.empty) {
            chain.extendMarkRange("link");
          }
          return chain.unsetLink().run();
        }),
      pasteTabularData: (data) => {
        if (session.isDestroyed)
          return commandNotApplicable("pasteTabularData");
        return runTableCommand("pasteTabularData", () =>
          pasteTabularDataCommand(session.editor, data, session.createId),
        );
      },
      insertTable: (afterBlockId, size, options) => {
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
      },
      insertDivider,
      insertTableRow: (tableBlockId, atIndex) =>
        runTableCommand("insertTableRow", () =>
          insertTableRowCommand(
            session.editor,
            tableBlockId,
            atIndex,
            session.createId,
          ),
        ),
      insertTableColumn: (tableBlockId, atIndex) =>
        runTableCommand("insertTableColumn", () =>
          insertTableColumnCommand(
            session.editor,
            tableBlockId,
            atIndex,
            session.createId,
          ),
        ),
      moveTableRow: (tableBlockId, fromIndex, toIndex) =>
        runTableCommand("moveTableRow", () =>
          moveTableRowCommand(session.editor, tableBlockId, fromIndex, toIndex),
        ),
      moveTableColumn: (tableBlockId, fromIndex, toIndex) =>
        runTableCommand("moveTableColumn", () =>
          moveTableColumnCommand(
            session.editor,
            tableBlockId,
            fromIndex,
            toIndex,
          ),
        ),
      resizeTableColumn: (tableBlockId, index, width) =>
        runTableCommand("resizeTableColumn", () =>
          resizeTableColumnCommand(session.editor, tableBlockId, index, width),
        ),
      mergeTableCells: (tableBlockId) => {
        if (session.isDestroyed) return commandNotApplicable("mergeTableCells");
        return runTableCommand("mergeTableCells", () =>
          mergeTableCellsCommand(session.editor, tableBlockId),
        );
      },
      splitTableCell: (tableBlockId, cellId) =>
        runTableCommand("splitTableCell", () =>
          splitTableCellCommand(
            session.editor,
            tableBlockId,
            cellId,
            session.createId,
          ),
        ),
      deleteTableRow: (tableBlockId, index) =>
        runTableCommand("deleteTableRow", () =>
          deleteTableRowCommand(session.editor, tableBlockId, index),
        ),
      deleteTableColumn: (tableBlockId, index) =>
        runTableCommand("deleteTableColumn", () =>
          deleteTableColumnCommand(session.editor, tableBlockId, index),
        ),
      toggleTableHeaderRow: (tableBlockId) =>
        runTableCommand("toggleTableHeaderRow", () =>
          toggleTableHeaderRowCommand(session.editor, tableBlockId),
        ),
      toggleTableHeaderColumn: (tableBlockId) =>
        runTableCommand("toggleTableHeaderColumn", () =>
          toggleTableHeaderColumnCommand(session.editor, tableBlockId),
        ),
      setTableCellTextColor: (tableBlockId, target, color) =>
        runTableCommand("setTableCellTextColor", () =>
          setTableCellColorCommand(
            session.editor,
            tableBlockId,
            target,
            "textColor",
            color,
          ),
        ),
      setTableCellBackgroundColor: (tableBlockId, target, color) =>
        runTableCommand("setTableCellBackgroundColor", () =>
          setTableCellColorCommand(
            session.editor,
            tableBlockId,
            target,
            "backgroundColor",
            color,
          ),
        ),
      setTableCellAlign: (tableBlockId, target, align) =>
        runTableCommand("setTableCellAlign", () =>
          setTableCellAlignCommand(session.editor, tableBlockId, target, align),
        ),
      undo: () =>
        session.runDocumentCommand("undo", "undo", () =>
          session.editor.commands.undo(),
        ),
      redo: () =>
        session.runDocumentCommand("redo", "redo", () =>
          session.editor.commands.redo(),
        ),
    },
  };
};
