import type { Result } from "@cp949/geul-model";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import { CellSelection, isInTable, selectedRect } from "@tiptap/pm/tables";

import {
  createBlockAttributeCommands,
  isTextAlignableMediaBlockKind,
} from "./block-attribute-commands.js";
import { createBlockCrudCommands } from "./block-crud-commands.js";
import {
  findAdjacentInTree,
  findBlockInTree,
  findParentInTree,
  walkBlockTree,
} from "./block-tree.js";
import { createDeferredControllerFacade } from "./deferred-controller-facade.js";
import type {
  CreateEditorOptions,
  EditorController,
} from "./editor-controller-types.js";
import type { EditorError } from "./errors.js";
import { createGenericBlockCommands } from "./generic-block-commands.js";
import { getBlockNestingActionState } from "./indent-commands.js";
import { createInlineMarkCommands } from "./inline-mark-commands.js";
import { createInsertBlockCommands } from "./insert-block-commands.js";
import { isMediaBlockKind } from "./media-block-kind.js";
import type { EnabledBlockTypes } from "./model-to-tiptap.js";
import {
  commandNotApplicable,
  ProductionEditorSession,
} from "./production-editor-session.js";
import { createSelectionCursorCommands } from "./selection-cursor-commands.js";
import {
  blockTypeDescriptorFromNode,
  findSelectionBlock,
  nearestBlockContainerId,
  toggleableMarkTypes,
} from "./selection-query-helpers.js";
import { createTableCommands } from "./table-command-glue.js";

// model-to-tiptap.ts가 정의한 타입이다 — createEditor를 이 파일에서
// 내보내므로(RD-002-DELTA-12), index.ts가 같은 파일에서 함께 재수출할 수
// 있도록 여기서도 내보낸다.
export type { EnabledBlockTypes };

// CellSelection이 덮는 서로 다른 기준 셀들을 primitive 값(cellId)만으로
// 나열한다. 병합 가능 여부는 cellIds.length > 1로 호출부가 직접 파생한다.
// splitCellId는 선택이 이미 병합된 셀 하나만 덮을 때 그 cellId다. 삼중클릭이
// 만드는 병합되지 않은 단일 셀 CellSelection은 cellIds.length가 1이라
// 병합 대상이 아니고 splitCellId=null이지만 cellIds는 채워진다 —
// 서식(색상·정렬)은 여전히 대상이다(spec 7.2).
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

export const createEditor = (
  options: CreateEditorOptions,
): EditorController => {
  const { facade: controllerFacade, box: controllerBox } =
    createDeferredControllerFacade();
  const session = new ProductionEditorSession(options, controllerFacade);
  // spec §5(EXT-005), RD-001-DELTA-01 — 등록된 각 함수에 controllerFacade를
  // partial-apply해 소비자가 나머지 인자만 넘기게 한다. customBlocks의
  // NodeView와 달리 이 함수들은 controller 완성 전(dummy mount 구간)에
  // 호출될 일이 없어 facade의 지연 바인딩 제약(동기 호출 금지)에 걸리지
  // 않는다. 조회 테이블 자체는 공개하지 않는다 — runCustomCommand만
  // 노출한다(editor-controller-types.ts의 필드 주석 참고).
  const customCommandFns: Record<
    string,
    (...args: unknown[]) => Result<void, EditorError>
  > = {};
  for (const [name, run] of Object.entries(options.commands ?? {})) {
    customCommandFns[name] = (...args) => run(controllerFacade, ...args);
  }
  const genericBlockCommands = createGenericBlockCommands(session);
  const inlineMarkCommands = createInlineMarkCommands(session);
  const blockAttributeCommands = createBlockAttributeCommands(session);
  const tableCommands = createTableCommands(session);
  const insertBlockCommands = createInsertBlockCommands(session);
  const blockCrudCommands = createBlockCrudCommands(session);
  const selectionCursorCommands = createSelectionCursorCommands(session);

  const controller: EditorController = {
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
    getBlock(blockId) {
      return findBlockInTree(session.getDocument().blocks, blockId);
    },
    getPrevBlock(blockId) {
      return findAdjacentInTree(session.getDocument().blocks, blockId, "prev");
    },
    getNextBlock(blockId) {
      return findAdjacentInTree(session.getDocument().blocks, blockId, "next");
    },
    getParentBlock(blockId) {
      return findParentInTree(session.getDocument().blocks, blockId);
    },
    forEachBlock(callback, options) {
      walkBlockTree(
        session.getDocument().blocks,
        null,
        callback,
        options?.reverse ?? false,
      );
    },
    insertBlocks(blocksToInsert, referenceBlockId, placement) {
      return blockCrudCommands.insertBlocks(
        blocksToInsert,
        referenceBlockId,
        placement,
      );
    },
    updateBlock(blockId, update) {
      return blockCrudCommands.updateBlock(blockId, update);
    },
    replaceBlocks(blockIdsToRemove, blocksToInsert) {
      return blockCrudCommands.replaceBlocks(blockIdsToRemove, blocksToInsert);
    },
    removeBlocks(blockIds) {
      return blockCrudCommands.removeBlocks(blockIds);
    },
    moveBlocksUp(blockIds) {
      return blockCrudCommands.moveBlocksUp(blockIds);
    },
    moveBlocksDown(blockIds) {
      return blockCrudCommands.moveBlocksDown(blockIds);
    },
    setTextCursorPosition(blockId, placement) {
      return selectionCursorCommands.setTextCursorPosition(blockId, placement);
    },
    setSelection(startBlockId, endBlockId) {
      return selectionCursorCommands.setSelection(startBlockId, endBlockId);
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
    getSelectionMediaBlock() {
      if (session.isDestroyed) return null;
      const { selection } = session.editor.state;
      if (!(selection instanceof NodeSelection)) return null;
      const { node } = selection;
      if (!isMediaBlockKind(node.type.name)) return null;
      const blockId = node.attrs.blockId;
      if (typeof blockId !== "string" || blockId.length === 0) return null;
      return {
        blockId,
        kind: node.type.name,
        url: typeof node.attrs.url === "string" ? node.attrs.url : null,
        name: typeof node.attrs.name === "string" ? node.attrs.name : null,
        caption:
          typeof node.attrs.caption === "string" ? node.attrs.caption : null,
        showPreview:
          node.type.name === "file" ? null : node.attrs.showPreview !== false,
        textAlignment:
          isTextAlignableMediaBlockKind(node.type.name) &&
          typeof node.attrs.textAlignment === "string"
            ? (node.attrs.textAlignment as "left" | "center" | "right")
            : null,
      };
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
    getBlockSelection() {
      if (session.isDestroyed) return null;
      return session.getBlockSelection();
    },
    getMediaUploadState(blockId) {
      if (session.isDestroyed) return null;
      return session.getMediaUploadState(blockId);
    },
    isUploadEnabled() {
      if (session.isDestroyed) return false;
      return session.uploadFile !== undefined;
    },
    replaceDocument(next) {
      return session.replaceDocument(next);
    },
    get isEditable() {
      return session.isEditable;
    },
    set isEditable(value) {
      session.isEditable = value;
    },
    commands: {
      ...genericBlockCommands,
      ...inlineMarkCommands,
      ...blockAttributeCommands,
      ...tableCommands,
      ...insertBlockCommands,
      undo: () =>
        session.runDocumentCommand("undo", "undo", () =>
          session.editor.commands.undo(),
        ),
      redo: () =>
        session.runDocumentCommand("redo", "redo", () =>
          session.editor.commands.redo(),
        ),
    },
    runCustomCommand(name, ...args) {
      const run = customCommandFns[name];
      return run === undefined ? commandNotApplicable(name) : run(...args);
    },
  };
  // customBlocks NodeView가 dummy mount 구간에서 캡처한 지연 참조를 이제
  // 완성한다 — 실사용 mount()가 만드는 NodeView부터는 완전히 동작한다
  // (DELTA-11.md "결정" 2).
  controllerBox.current = controller;
  return controller;
};
