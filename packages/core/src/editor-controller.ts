import {
  type Document as BlockDocument,
  type IdFactory,
  isSupportedLinkHref,
  parseDocument,
  type Result,
  type TextMark,
} from "@cp949/geul-model";
import { Editor, type JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, TextSelection } from "@tiptap/pm/state";
import { CellSelection, isInTable, selectedRect } from "@tiptap/pm/tables";
import StarterKit from "@tiptap/starter-kit";

import { BlockIdExtension } from "./block-id-extension.js";
import type { EditorError } from "./errors.js";
import { LinkPolicyExtension } from "./link-policy-extension.js";
import { modelToTiptap, type TiptapJsonNode } from "./model-to-tiptap.js";
import { RevisionGuardExtension } from "./revision-guard-extension.js";
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
  setTableCellColor as setTableCellColorCommand,
  splitTableCell as splitTableCellCommand,
  type TableCommandError,
  toggleTableHeaderColumn as toggleTableHeaderColumnCommand,
  toggleTableHeaderRow as toggleTableHeaderRowCommand,
} from "./table-commands.js";
import {
  TableCellExtension,
  TableExtension,
  TableRowExtension,
} from "./table-extension.js";
import type { TableCellTarget } from "./table-grid.js";
import { tiptapToModel } from "./tiptap-to-model.js";

export type DocumentChangeEvent = {
  revision: number;
  changedBlockIds: readonly string[];
  reason: "local" | "replace" | "undo" | "redo";
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
  getTableCellSelection(): TableCellSelection | null;
  replaceDocument(next: unknown): Result<void, EditorError>;
  readonly commands: {
    setText(blockId: string, text: string): Result<void, EditorError>;
    insertParagraphAfter(
      blockId: string,
    ): Result<{ blockId: string }, EditorError>;
    setBlockType(
      blockId: string,
      blockType: BlockTypeDescriptor,
      options?: { clearContent?: boolean },
    ): Result<void, EditorError>;
    moveBlockBefore(
      blockId: string,
      beforeBlockId: string | null,
    ): Result<void, EditorError>;
    duplicateBlock(blockId: string): Result<{ blockId: string }, EditorError>;
    deleteBlock(blockId: string): Result<void, EditorError>;
    toggleBold(): Result<void, EditorError>;
    toggleItalic(): Result<void, EditorError>;
    toggleUnderline(): Result<void, EditorError>;
    toggleStrike(): Result<void, EditorError>;
    toggleCode(): Result<void, EditorError>;
    setLink(href: string): Result<void, EditorError>;
    unsetLink(): Result<void, EditorError>;
    insertTable(
      afterBlockId: string,
      size: { rows: number; columns: number },
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
    undo(): Result<void, EditorError>;
    redo(): Result<void, EditorError>;
  };
}

export type BlockTypeDescriptor =
  | { type: "paragraph" }
  | { type: "heading"; level: 1 | 2 | 3 };

// CellSelection이 덮는 서로 다른 기준 셀들을 primitive 값(cellId)만으로
// 나열한다. mergeable은 기준 셀이 2개 이상일 때, splitCellId는 선택이 이미
// 병합된 셀 하나만 덮을 때 그 cellId다. 삼중클릭이 만드는 병합되지 않은
// 단일 셀 CellSelection은 mergeable=false, splitCellId=null이지만
// cellIds는 채워진다 — 서식(색상·정렬)은 여전히 대상이다(spec 7.2).
export type TableCellSelection = {
  tableBlockId: string;
  cellIds: string[];
  mergeable: boolean;
  splitCellId: string | null;
};

// selectedRect가 덮는 좌표들을 훑어 서로 다른 기준 셀의 id만 순서대로
// 모은다. TableMap.map은 좌표마다 그 좌표를 채우는 셀의 시작 위치를 담으므로,
// 병합 셀은 자신이 덮는 모든 좌표에서 같은 값이 반복된다 — 처음 등장하는
// 오프셋에서만 push한다. PM 노드 참조가 아닌 원시값만 클로저 밖으로 낸다
// (PIT-0008).
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
  createId?: IdFactory;
  onChange?: (event: DocumentChangeEvent) => void;
};

type ChangeReason = DocumentChangeEvent["reason"];

const defaultIdFactory: IdFactory = () => globalThis.crypto.randomUUID();

const toggleableMarkTypes: ReadonlyArray<TextMark["type"]> = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
];

const commandNotApplicable = (command: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

const parseSupportedDocument = (
  input: unknown,
): Result<BlockDocument, EditorError> => {
  const parsed = parseDocument(input);
  if (!parsed.ok) {
    return {
      ok: false,
      error: { code: "DOCUMENT_INVALID", message: parsed.error.message },
    };
  }

  const converted = modelToTiptap(parsed.value);
  return converted.ok ? { ok: true, value: parsed.value } : converted;
};

const blockChanges = (
  previous: BlockDocument,
  next: BlockDocument,
): string[] => {
  const previousBlocks = new Map(
    previous.blocks.map((block, index) => [
      block.id,
      { index, json: JSON.stringify(block) },
    ]),
  );
  const nextBlocks = new Map(
    next.blocks.map((block, index) => [
      block.id,
      { index, json: JSON.stringify(block) },
    ]),
  );
  const changed: string[] = [];

  for (const [index, block] of previous.blocks.entries()) {
    const nextBlock = nextBlocks.get(block.id);
    if (
      nextBlock === undefined ||
      nextBlock.index !== index ||
      nextBlock.json !== JSON.stringify(block)
    ) {
      changed.push(block.id);
    }
  }
  for (const block of next.blocks) {
    if (!previousBlocks.has(block.id)) changed.push(block.id);
  }

  return changed;
};

const sameDocumentContent = (
  previous: BlockDocument,
  next: BlockDocument,
): boolean => blockChanges(previous, next).length === 0;

const findTopLevelBlockPosition = (
  document: ProseMirrorNode,
  blockId: string,
): number | null => {
  let blockPosition: number | null = null;
  document.forEach((node, offset) => {
    if (node.attrs.blockId === blockId) blockPosition = offset;
  });
  return blockPosition;
};

export const createEditor = (
  options: CreateEditorOptions,
): EditorController => {
  const parsedInitialDocument = parseSupportedDocument(options.initialDocument);
  if (!parsedInitialDocument.ok) {
    throw new TypeError(
      parsedInitialDocument.error.code === "DOCUMENT_INVALID"
        ? parsedInitialDocument.error.message
        : "Tables are not available in the R0 editor",
    );
  }

  const createId = options.createId ?? defaultIdFactory;
  let sessionRevision = parsedInitialDocument.value.revision;
  let currentDocument = structuredClone(parsedInitialDocument.value);
  let destroyed = false;
  let mountedElement: HTMLElement | null = null;
  let activeReason: ChangeReason | null = null;
  let pendingDocument: BlockDocument | null = null;

  const readEditorDocument = (editor: Editor): BlockDocument => {
    const converted = tiptapToModel(
      editor.getJSON() as TiptapJsonNode,
      sessionRevision,
      createId,
    );
    if (!converted.ok) {
      throw new TypeError(
        converted.error.code === "DOCUMENT_INVALID"
          ? converted.error.message
          : "Tables are not available in the R0 editor",
      );
    }
    return converted.value;
  };

  const commitDocument = (
    nextDocument: BlockDocument,
    reason: ChangeReason,
  ): boolean => {
    const changedBlockIds = blockChanges(currentDocument, nextDocument);
    if (changedBlockIds.length === 0) return false;
    if (sessionRevision >= Number.MAX_SAFE_INTEGER) return false;

    sessionRevision += 1;
    currentDocument = structuredClone({
      ...nextDocument,
      revision: sessionRevision,
    });
    options.onChange?.({ revision: sessionRevision, changedBlockIds, reason });
    return true;
  };

  const onTiptapUpdate = (editor: Editor) => {
    const nextDocument = readEditorDocument(editor);
    if (activeReason === null) {
      commitDocument(nextDocument, "local");
      return;
    }
    pendingDocument = nextDocument;
  };

  const createTiptapEditor = (document: BlockDocument): Editor => {
    const converted = modelToTiptap(document);
    if (!converted.ok) throw new TypeError("Tables are not available in R0");

    const editor = new Editor({
      element: null,
      content: converted.value as JSONContent,
      injectCSS: false,
      extensions: [
        StarterKit.configure({
          blockquote: false,
          bulletList: false,
          codeBlock: false,
          hardBreak: false,
          horizontalRule: false,
          listItem: false,
          orderedList: false,
          heading: { levels: [1, 2, 3] },
          link: {
            openOnClick: false,
            isAllowedUri: (url) => isSupportedLinkHref(url),
            shouldAutoLink: (url) => isSupportedLinkHref(url),
          },
          trailingNode: false,
        }),
        BlockIdExtension.configure({ createId }),
        TableExtension,
        TableRowExtension,
        TableCellExtension,
        LinkPolicyExtension,
        RevisionGuardExtension.configure({
          canApplyDocumentChange: () =>
            sessionRevision < Number.MAX_SAFE_INTEGER,
        }),
      ],
      onUpdate: ({ editor }) => onTiptapUpdate(editor),
    });
    editor.mount(globalThis.document.createElement("div"));
    editor.unmount();
    return editor;
  };

  let tiptapEditor = createTiptapEditor(currentDocument);

  const runDocumentCommand = (
    command: string,
    reason: ChangeReason,
    run: () => boolean,
  ): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable(command);
    if (sessionRevision >= Number.MAX_SAFE_INTEGER) {
      return commandNotApplicable(command);
    }

    activeReason = reason;
    pendingDocument = null;
    let applied = false;
    try {
      applied = run();
    } finally {
      activeReason = null;
    }

    if (!applied) return commandNotApplicable(command);
    const nextDocument = pendingDocument ?? readEditorDocument(tiptapEditor);
    pendingDocument = null;
    return commitDocument(nextDocument, reason)
      ? { ok: true, value: undefined }
      : commandNotApplicable(command);
  };

  const setText = (
    blockId: string,
    text: string,
  ): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("setText");

    let targetPosition: number | null = null;
    let targetIsTextblock = false;
    let targetSize = 0;
    let currentText = "";
    tiptapEditor.state.doc.forEach((node, offset) => {
      if (node.attrs.blockId !== blockId) return;
      targetPosition = offset;
      targetIsTextblock = node.isTextblock;
      targetSize = node.content.size;
      currentText = node.textContent;
    });

    if (targetPosition === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    // 표처럼 textblock이 아닌 블록의 content를 텍스트로 교체하면 스키마가
    // 깨진 노드가 남아 이후 모든 트랜잭션이 실패한다.
    if (!targetIsTextblock) return commandNotApplicable("setText");
    if (currentText === text) return commandNotApplicable("setText");

    return runDocumentCommand("setText", "local", () => {
      if (targetPosition === null) return false;

      const from = targetPosition + 1;
      const to = from + targetSize;
      const transaction = tiptapEditor.state.tr;
      if (text.length === 0) {
        transaction.delete(from, to);
      } else {
        transaction.replaceWith(from, to, tiptapEditor.schema.text(text));
      }
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const insertParagraphAfter = (
    blockId: string,
  ): Result<{ blockId: string }, EditorError> => {
    if (destroyed) return commandNotApplicable("insertParagraphAfter");

    const blockIndex = currentDocument.blocks.findIndex(
      (block) => block.id === blockId,
    );
    if (blockIndex === -1) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    let insertPosition: number | null = null;
    tiptapEditor.state.doc.forEach((node, offset) => {
      if (node.attrs.blockId !== blockId) return;
      insertPosition = offset + node.nodeSize;
    });
    if (insertPosition === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    const result = runDocumentCommand("insertParagraphAfter", "local", () => {
      if (insertPosition === null) return false;
      const paragraphType = tiptapEditor.schema.nodes.paragraph;
      if (paragraphType === undefined) return false;
      const paragraph = paragraphType.create();
      const transaction = tiptapEditor.state.tr.insert(
        insertPosition,
        paragraph,
      );
      transaction.setSelection(
        TextSelection.create(transaction.doc, insertPosition + 1),
      );
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;

    const createdBlock = currentDocument.blocks[blockIndex + 1];
    if (createdBlock === undefined) {
      return commandNotApplicable("insertParagraphAfter");
    }
    return { ok: true, value: { blockId: createdBlock.id } };
  };

  const setBlockType = (
    blockId: string,
    blockType: BlockTypeDescriptor,
    options?: { clearContent?: boolean },
  ): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("setBlockType");

    let targetPosition: number | null = null;
    let currentTypeName: string | null = null;
    let currentLevel: number | null = null;
    let currentContentSize = 0;
    tiptapEditor.state.doc.forEach((node, offset) => {
      if (node.attrs.blockId !== blockId) return;
      targetPosition = offset;
      currentTypeName = node.type.name;
      currentLevel =
        typeof node.attrs.level === "number" ? node.attrs.level : null;
      currentContentSize = node.content.size;
    });

    if (targetPosition === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    // 표 블록은 paragraph/heading으로 변환할 수 없다 — 셀 콘텐츠가
    // 인라인 스키마에 맞지 않아 변환 시도 자체가 예외를 던진다.
    if (currentTypeName !== "paragraph" && currentTypeName !== "heading") {
      return commandNotApplicable("setBlockType");
    }

    const clearContent = options?.clearContent ?? false;
    const isSameType =
      blockType.type === "paragraph"
        ? currentTypeName === "paragraph"
        : currentTypeName === "heading" && currentLevel === blockType.level;
    if (isSameType && (!clearContent || currentContentSize === 0)) {
      return commandNotApplicable("setBlockType");
    }

    return runDocumentCommand("setBlockType", "local", () => {
      if (targetPosition === null) return false;
      const nodeType =
        blockType.type === "paragraph"
          ? tiptapEditor.schema.nodes.paragraph
          : tiptapEditor.schema.nodes.heading;
      if (nodeType === undefined) return false;
      const attrs =
        blockType.type === "paragraph"
          ? { blockId }
          : { blockId, level: blockType.level };

      let transaction = tiptapEditor.state.tr;
      if (clearContent && currentContentSize > 0) {
        transaction = transaction.delete(
          targetPosition + 1,
          targetPosition + 1 + currentContentSize,
        );
      }
      transaction = transaction.setNodeMarkup(targetPosition, nodeType, attrs);
      transaction.setSelection(
        TextSelection.create(transaction.doc, targetPosition + 1),
      );
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const moveBlockBefore = (
    blockId: string,
    beforeBlockId: string | null,
  ): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("moveBlockBefore");

    const blocks = currentDocument.blocks;
    const sourceIndex = blocks.findIndex((block) => block.id === blockId);
    if (sourceIndex === -1) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    let targetIndex = blocks.length;
    if (beforeBlockId !== null) {
      targetIndex = blocks.findIndex((block) => block.id === beforeBlockId);
      if (targetIndex === -1) {
        return {
          ok: false,
          error: { code: "BLOCK_NOT_FOUND", blockId: beforeBlockId },
        };
      }
    }
    if (targetIndex === sourceIndex || targetIndex === sourceIndex + 1) {
      return commandNotApplicable("moveBlockBefore");
    }

    return runDocumentCommand("moveBlockBefore", "local", () => {
      const sourcePosition = findTopLevelBlockPosition(
        tiptapEditor.state.doc,
        blockId,
      );
      if (sourcePosition === null) return false;
      const sourceNode = tiptapEditor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;

      let transaction = tiptapEditor.state.tr.delete(
        sourcePosition,
        sourcePosition + sourceNode.nodeSize,
      );
      let insertPosition = transaction.doc.content.size;
      if (beforeBlockId !== null) {
        const mappedTargetPosition = findTopLevelBlockPosition(
          transaction.doc,
          beforeBlockId,
        );
        if (mappedTargetPosition === null) return false;
        insertPosition = mappedTargetPosition;
      }
      transaction = transaction.insert(insertPosition, sourceNode);
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const duplicateBlock = (
    blockId: string,
  ): Result<{ blockId: string }, EditorError> => {
    if (destroyed) return commandNotApplicable("duplicateBlock");

    const blockIndex = currentDocument.blocks.findIndex(
      (block) => block.id === blockId,
    );
    if (blockIndex === -1) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    // blockId만 재발급하는 복제는 표의 row/cell/column id를 그대로 복사해
    // 문서 전체 id 유일성 불변식을 깨뜨린다. 표 복제는 전용 명령이 생길
    // 때까지 거부한다.
    if (currentDocument.blocks[blockIndex]?.type === "table") {
      return commandNotApplicable("duplicateBlock");
    }

    const result = runDocumentCommand("duplicateBlock", "local", () => {
      const sourcePosition = findTopLevelBlockPosition(
        tiptapEditor.state.doc,
        blockId,
      );
      if (sourcePosition === null) return false;
      const sourceNode = tiptapEditor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;

      const insertPosition = sourcePosition + sourceNode.nodeSize;
      const duplicateNode = sourceNode.type.create(
        { ...sourceNode.attrs, blockId: createId() },
        sourceNode.content,
        sourceNode.marks,
      );
      const transaction = tiptapEditor.state.tr.insert(
        insertPosition,
        duplicateNode,
      );
      transaction.setSelection(
        TextSelection.create(
          transaction.doc,
          insertPosition + duplicateNode.nodeSize - 1,
        ),
      );
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;

    const createdBlock = currentDocument.blocks[blockIndex + 1];
    if (createdBlock === undefined) {
      return commandNotApplicable("duplicateBlock");
    }
    return { ok: true, value: { blockId: createdBlock.id } };
  };

  const deleteBlock = (blockId: string): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("deleteBlock");
    if (currentDocument.blocks.length <= 1) {
      return commandNotApplicable("deleteBlock");
    }

    const blockIndex = currentDocument.blocks.findIndex(
      (block) => block.id === blockId,
    );
    if (blockIndex === -1) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    return runDocumentCommand("deleteBlock", "local", () => {
      const sourcePosition = findTopLevelBlockPosition(
        tiptapEditor.state.doc,
        blockId,
      );
      if (sourcePosition === null) return false;
      const sourceNode = tiptapEditor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;

      const transaction = tiptapEditor.state.tr.delete(
        sourcePosition,
        sourcePosition + sourceNode.nodeSize,
      );
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const runSelectionCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    if (tiptapEditor.state.selection.empty) {
      return commandNotApplicable(command);
    }
    return runDocumentCommand(command, "local", run);
  };

  const runLinkCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    if (tiptapEditor.state.selection.empty && !tiptapEditor.isActive("link")) {
      return commandNotApplicable(command);
    }
    return runDocumentCommand(command, "local", run);
  };

  // PIT-0008 회피: TableCommandError 같은 객체 타입을 클로저 밖 let에 담아
  // `!== null`로 좁히면 이 저장소의 TS7 컴파일러가 never로 잘못 좁힌다.
  // 클로저를 넘나드는 값은 원시 타입(code 문자열, blockId, width, message)만 쓴다.
  const tableErrorFromCode = (
    code: TableCommandError["code"],
    detail: {
      blockId: string;
      message: string;
      width: number;
      cellId: string;
      color: string;
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
      case "CELL_NOT_FOUND":
        return { code: "CELL_NOT_FOUND", cellId: detail.cellId };
      case "LAST_ROW":
        return { code: "LAST_ROW" };
      case "LAST_COLUMN":
        return { code: "LAST_COLUMN" };
      case "INVALID_COLOR":
        return { code: "INVALID_COLOR", color: detail.color };
      default:
        return { code: "COMMAND_NOT_APPLICABLE", command: "table" };
    }
  };

  const runVoidTableCommand = (
    command: string,
    invoke: () => Result<void, TableCommandError>,
  ): Result<void, EditorError> => {
    let errorCode: TableCommandError["code"] | null = null;
    let errorBlockId = "";
    let errorMessage = "";
    let errorWidth = 0;
    let errorCellId = "";
    let errorColor = "";

    const result = runDocumentCommand(command, "local", () => {
      const outcome = invoke();
      if (outcome.ok) return true;
      errorCode = outcome.error.code;
      if (
        outcome.error.code === "BLOCK_NOT_FOUND" ||
        outcome.error.code === "TABLE_NOT_FOUND"
      ) {
        errorBlockId = outcome.error.blockId;
      }
      if (outcome.error.code === "TABLE_NODE_INVALID") {
        errorMessage = outcome.error.message;
      }
      if (outcome.error.code === "COLUMN_WIDTH_OUT_OF_RANGE") {
        errorWidth = outcome.error.width;
      }
      if (outcome.error.code === "CELL_NOT_FOUND") {
        errorCellId = outcome.error.cellId;
      }
      if (outcome.error.code === "INVALID_COLOR") {
        errorColor = outcome.error.color;
      }
      return false;
    });

    if (errorCode !== null) {
      return {
        ok: false,
        error: tableErrorFromCode(errorCode, {
          blockId: errorBlockId,
          message: errorMessage,
          width: errorWidth,
          cellId: errorCellId,
          color: errorColor,
        }),
      };
    }
    return result;
  };

  return {
    mount(element) {
      if (destroyed) return;
      if (mountedElement !== null) tiptapEditor.unmount();
      tiptapEditor.mount(element);
      mountedElement = element;
    },
    unmount() {
      if (destroyed || mountedElement === null) return;
      tiptapEditor.unmount();
      mountedElement = null;
    },
    destroy() {
      if (destroyed) return;
      currentDocument = readEditorDocument(tiptapEditor);
      currentDocument.revision = sessionRevision;
      tiptapEditor.destroy();
      mountedElement = null;
      destroyed = true;
    },
    getDocument() {
      return structuredClone(currentDocument);
    },
    getSelectionMarks() {
      if (destroyed) return [];
      return toggleableMarkTypes.filter((type) => tiptapEditor.isActive(type));
    },
    getSelectionLink() {
      if (destroyed) return null;
      const href = tiptapEditor.getAttributes("link").href;
      return typeof href === "string" ? { href } : null;
    },
    getCaretBlockContext() {
      if (destroyed) return null;
      const { selection } = tiptapEditor.state;
      if (!selection.empty) return null;

      const node = selection.$from.parent;
      if (node.type.name !== "paragraph" && node.type.name !== "heading") {
        return null;
      }
      const blockId = node.attrs.blockId;
      if (typeof blockId !== "string" || blockId.length === 0) return null;

      const blockType: BlockTypeDescriptor =
        node.type.name === "heading"
          ? { type: "heading", level: node.attrs.level as 1 | 2 | 3 }
          : { type: "paragraph" };
      return { blockId, blockType, text: node.textContent };
    },
    getSelectionBlockType() {
      if (destroyed) return null;
      const { selection, doc } = tiptapEditor.state;
      const { from, to } = selection;

      let result: { blockId: string; blockType: BlockTypeDescriptor } | null =
        null;
      doc.forEach((node, offset) => {
        if (result !== null) return;
        if (from < offset || to > offset + node.nodeSize) return;
        if (node.type.name !== "paragraph" && node.type.name !== "heading") {
          return;
        }
        const blockId = node.attrs.blockId;
        if (typeof blockId !== "string" || blockId.length === 0) return;

        const blockType: BlockTypeDescriptor =
          node.type.name === "heading"
            ? { type: "heading", level: node.attrs.level as 1 | 2 | 3 }
            : { type: "paragraph" };
        result = { blockId, blockType };
      });
      return result;
    },
    getTableCellSelection() {
      if (destroyed) return null;
      const state = tiptapEditor.state;
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
          mergeable: cellIds.length > 1,
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
        mergeable: false,
        splitCellId: cellId,
      };
    },
    replaceDocument(next) {
      if (destroyed) return commandNotApplicable("replaceDocument");

      const parsed = parseSupportedDocument(next);
      if (!parsed.ok) return parsed;
      if (sameDocumentContent(currentDocument, parsed.value)) {
        return commandNotApplicable("replaceDocument");
      }
      if (sessionRevision >= Number.MAX_SAFE_INTEGER) {
        return commandNotApplicable("replaceDocument");
      }

      const replacement = createTiptapEditor(parsed.value);
      tiptapEditor.destroy();
      tiptapEditor = replacement;
      if (mountedElement !== null) tiptapEditor.mount(mountedElement);

      commitDocument(parsed.value, "replace");
      return { ok: true, value: undefined };
    },
    commands: {
      setText,
      insertParagraphAfter,
      setBlockType,
      moveBlockBefore,
      duplicateBlock,
      deleteBlock,
      toggleBold: () =>
        runSelectionCommand("toggleBold", () =>
          tiptapEditor.commands.toggleBold(),
        ),
      toggleItalic: () =>
        runSelectionCommand("toggleItalic", () =>
          tiptapEditor.commands.toggleItalic(),
        ),
      toggleUnderline: () =>
        runSelectionCommand("toggleUnderline", () =>
          tiptapEditor.commands.toggleUnderline(),
        ),
      toggleStrike: () =>
        runSelectionCommand("toggleStrike", () =>
          tiptapEditor.commands.toggleStrike(),
        ),
      toggleCode: () =>
        runSelectionCommand("toggleCode", () =>
          tiptapEditor.commands.toggleCode(),
        ),
      setLink: (href) => {
        if (!isSupportedLinkHref(href)) {
          return { ok: false, error: { code: "LINK_HREF_REJECTED", href } };
        }
        if (tiptapEditor.isActive("link", { href })) {
          return commandNotApplicable("setLink");
        }
        return runLinkCommand("setLink", () => {
          const chain = tiptapEditor.chain();
          if (tiptapEditor.state.selection.empty) {
            chain.extendMarkRange("link");
          }
          return chain.setLink({ href }).run();
        });
      },
      unsetLink: () =>
        runLinkCommand("unsetLink", () => {
          const chain = tiptapEditor.chain();
          if (tiptapEditor.state.selection.empty) {
            chain.extendMarkRange("link");
          }
          return chain.unsetLink().run();
        }),
      insertTable: (afterBlockId, size, options) => {
        if (destroyed) return commandNotApplicable("insertTable");

        let errorCode: TableCommandError["code"] | null = null;
        let errorBlockId = "";
        let insertedBlockId = "";

        const result = runDocumentCommand("insertTable", "local", () => {
          const outcome = insertTableCommand(
            tiptapEditor,
            afterBlockId,
            size,
            createId,
            options,
          );
          if (!outcome.ok) {
            errorCode = outcome.error.code;
            if (outcome.error.code === "BLOCK_NOT_FOUND") {
              errorBlockId = outcome.error.blockId;
            }
            return false;
          }
          insertedBlockId = outcome.value.blockId;
          return true;
        });

        if (errorCode !== null) {
          return {
            ok: false,
            error: tableErrorFromCode(errorCode, {
              blockId: errorBlockId,
              message: "",
              width: 0,
              cellId: "",
              color: "",
            }),
          };
        }
        if (!result.ok) return result;
        return { ok: true, value: { blockId: insertedBlockId } };
      },
      insertTableRow: (tableBlockId, atIndex) =>
        runVoidTableCommand("insertTableRow", () =>
          insertTableRowCommand(tiptapEditor, tableBlockId, atIndex, createId),
        ),
      insertTableColumn: (tableBlockId, atIndex) =>
        runVoidTableCommand("insertTableColumn", () =>
          insertTableColumnCommand(
            tiptapEditor,
            tableBlockId,
            atIndex,
            createId,
          ),
        ),
      moveTableRow: (tableBlockId, fromIndex, toIndex) =>
        runVoidTableCommand("moveTableRow", () =>
          moveTableRowCommand(tiptapEditor, tableBlockId, fromIndex, toIndex),
        ),
      moveTableColumn: (tableBlockId, fromIndex, toIndex) =>
        runVoidTableCommand("moveTableColumn", () =>
          moveTableColumnCommand(
            tiptapEditor,
            tableBlockId,
            fromIndex,
            toIndex,
          ),
        ),
      resizeTableColumn: (tableBlockId, index, width) =>
        runVoidTableCommand("resizeTableColumn", () =>
          resizeTableColumnCommand(tiptapEditor, tableBlockId, index, width),
        ),
      mergeTableCells: (tableBlockId) => {
        if (destroyed) return commandNotApplicable("mergeTableCells");
        // 병합 범위의 유일한 권위는 현재 CellSelection이다(spec 6.2) — React는
        // 좌표를 다시 계산해 넘기지 않는다. 클릭 시점에 선택이 이미 바뀌었거나
        // 다른 표를 가리키면 조작 불가로 거절한다.
        if (!(tiptapEditor.state.selection instanceof CellSelection)) {
          return commandNotApplicable("mergeTableCells");
        }
        const rect = selectedRect(tiptapEditor.state);
        if (rect.table.attrs.blockId !== tableBlockId) {
          return commandNotApplicable("mergeTableCells");
        }
        return runVoidTableCommand("mergeTableCells", () =>
          mergeTableCellsCommand(
            tiptapEditor,
            tableBlockId,
            { row: rect.top, column: rect.left },
            { row: rect.bottom - 1, column: rect.right - 1 },
          ),
        );
      },
      splitTableCell: (tableBlockId, cellId) =>
        runVoidTableCommand("splitTableCell", () =>
          splitTableCellCommand(tiptapEditor, tableBlockId, cellId, createId),
        ),
      deleteTableRow: (tableBlockId, index) =>
        runVoidTableCommand("deleteTableRow", () =>
          deleteTableRowCommand(tiptapEditor, tableBlockId, index),
        ),
      deleteTableColumn: (tableBlockId, index) =>
        runVoidTableCommand("deleteTableColumn", () =>
          deleteTableColumnCommand(tiptapEditor, tableBlockId, index),
        ),
      toggleTableHeaderRow: (tableBlockId) =>
        runVoidTableCommand("toggleTableHeaderRow", () =>
          toggleTableHeaderRowCommand(tiptapEditor, tableBlockId),
        ),
      toggleTableHeaderColumn: (tableBlockId) =>
        runVoidTableCommand("toggleTableHeaderColumn", () =>
          toggleTableHeaderColumnCommand(tiptapEditor, tableBlockId),
        ),
      setTableCellTextColor: (tableBlockId, target, color) =>
        runVoidTableCommand("setTableCellTextColor", () =>
          setTableCellColorCommand(
            tiptapEditor,
            tableBlockId,
            target,
            "textColor",
            color,
          ),
        ),
      setTableCellBackgroundColor: (tableBlockId, target, color) =>
        runVoidTableCommand("setTableCellBackgroundColor", () =>
          setTableCellColorCommand(
            tiptapEditor,
            tableBlockId,
            target,
            "backgroundColor",
            color,
          ),
        ),
      undo: () =>
        runDocumentCommand("undo", "undo", () => tiptapEditor.commands.undo()),
      redo: () =>
        runDocumentCommand("redo", "redo", () => tiptapEditor.commands.redo()),
    },
  };
};
