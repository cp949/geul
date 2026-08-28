import type { TabularData } from "@cp949/geul-io";
import {
  type Block,
  type Document as BlockDocument,
  createRandomDocumentId,
  type IdFactory,
  isSupportedLinkHref,
  parseDocument,
  type Result,
  type TextMark,
} from "@cp949/geul-model";
import { Editor, mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { type EditorState, TextSelection } from "@tiptap/pm/state";
import { CellSelection, isInTable, selectedRect } from "@tiptap/pm/tables";
import StarterKit from "@tiptap/starter-kit";

import {
  BlockContainerExtension,
  BlockGroupExtension,
} from "./block-container-extension.js";
import { BlockIdExtension } from "./block-id-extension.js";
import { findBlockPosition } from "./block-position.js";
import { BlockSplitExtension } from "./block-split-extension.js";
import type { EditorError } from "./errors.js";
import { indentBlockCommand, outdentBlockCommand } from "./indent-commands.js";
import { IndentKeyboardExtension } from "./indent-keyboard-extension.js";
import { LinkPolicyExtension } from "./link-policy-extension.js";
import { modelToTiptap, type TiptapJsonNode } from "./model-to-tiptap.js";
import { RevisionGuardExtension } from "./revision-guard-extension.js";
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
import {
  TableCellExtension,
  TableExtension,
  TableRowExtension,
} from "./table-extension.js";
import type { TableCellTarget } from "./table-grid.js";
import { TableKeyboardNavigationExtension } from "./table-keyboard-extension.js";
import { TablePasteExtension } from "./table-paste-extension.js";
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
    indentBlock(blockId: string): Result<void, EditorError>;
    outdentBlock(blockId: string): Result<void, EditorError>;
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

export type BlockTypeDescriptor =
  { type: "paragraph" } | { type: "heading"; level: 1 | 2 | 3 };

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
  createId?: IdFactory;
  onChange?: (event: DocumentChangeEvent) => void;
  onPasteRejected?: (reason: PasteRejectedReason) => void;
};

type ChangeReason = DocumentChangeEvent["reason"];

const toggleableMarkTypes: ReadonlyArray<TextMark["type"]> = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
];

// D19: paragraph/heading의 group을 "block"에서 "blockContent"로 바꾼다 —
// blockId identity는 blockContainer로 옮겨갔다(block-container-extension.ts).
// StarterKit.configure()는 addOptions() 런타임 옵션만 오버라이드하고
// group·content 같은 스키마 필드는 바꾸지 못한다(실측: @tiptap/starter-kit이
// 내부적으로 Paragraph.configure(...)/Heading.configure(...)만 호출한다 —
// node_modules/.pnpm/@tiptap+starter-kit.../dist/index.js 확인). 원본
// @tiptap/extension-paragraph·extension-heading을 .extend({ group: ... })로
// 재사용하는 대안은 두 패키지가 core의 선언된 dependency가 아니라
// (package.json에 없음) pnpm strict 해석에서 막힌다(실측: 별도 스크립트로
// import 시도 시 ERR_MODULE_NOT_FOUND). 새 dependency를 추가하는 대신
// StarterKit의 paragraph/heading을 끄고(`paragraph: false, heading: false`)
// 그 자리를 대신할 최소 재구현을 둔다 — Tiptap 3.30.1
// extension-paragraph/extension-heading의 parseHTML·renderHTML·attrs만
// 재현했다. addCommands(setParagraph/setHeading/toggleHeading)·
// addKeyboardShortcuts(Mod-Alt-N)·addInputRules("# " 마크다운 규칙)는 이
// 코드베이스 어디서도 호출되지 않아(실측: grep 0건) 이번 DELTA 범위에서
// 제외한다 — 필요해지면 이 자리에 복원한다.
const ParagraphExtension = Node.create({
  name: "paragraph",
  group: "blockContent",
  content: "inline*",
  parseHTML() {
    return [{ tag: "p" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes), 0];
  },
});

const HeadingExtension = Node.create({
  name: "heading",
  group: "blockContent",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      level: { default: 1, rendered: false },
    };
  },
  parseHTML() {
    return [1, 2, 3].map((level) => ({ tag: `h${level}`, attrs: { level } }));
  },
  renderHTML({ node, HTMLAttributes }) {
    const level = [1, 2, 3].includes(node.attrs.level as number)
      ? (node.attrs.level as number)
      : 1;
    return [`h${level}`, mergeAttributes(HTMLAttributes), 0];
  },
});

const commandNotApplicable = (command: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

// blockId로 찾은 노드가 편집 대상 콘텐츠 그 자체인지, 아니면 그 콘텐츠를
// 감싼 컨테이너인지 이원화해 실제로 텍스트/타입을 다루는 노드를 반환한다
// (D19). blockContainer는 identity(blockId)만 소유하고 텍스트·타입은 항상
// 그 첫 자식(blockContent — paragraph/heading)에 있다. table은 컨테이너로
// 감싸이지 않으므로(D19) 매치된 노드 자신이 곧 대상이다 — setText/
// setBlockType은 이후 textblock/paragraph·heading 검사로 표를 자연히
// 걸러낸다.
const findEditableBlockContent = (
  document: ProseMirrorNode,
  blockId: string,
): { position: number; node: ProseMirrorNode } | null => {
  const matchPosition = findBlockPosition(document, blockId);
  if (matchPosition === null) return null;
  const matchNode = document.nodeAt(matchPosition);
  if (matchNode === null) return null;
  if (matchNode.type.name !== "blockContainer") {
    return { position: matchPosition, node: matchNode };
  }
  const contentPosition = matchPosition + 1;
  const contentNode = document.nodeAt(contentPosition);
  if (contentNode === null) return null;
  return { position: contentPosition, node: contentNode };
};

// 모델 트리(BlockDocument.blocks, 임의 깊이 children)에서 blockId를 가진
// 블록을 찾아 그 블록이 속한 형제 배열(siblings)과 그 안 인덱스를 함께
// 반환한다. 최상위 블록은 siblings === document.blocks, 중첩 블록은 부모의
// children이 siblings다 — moveBlockBefore의 "같은 부모 형제" 판정과
// insertParagraphAfter/duplicateBlock의 "새로 생긴 다음 형제 조회"가 이
// 반환값 하나로 both 처리된다(평면 인덱스 산술의 깊이-무관 대체).
const findBlockInTree = (
  blocks: readonly Block[],
  blockId: string,
): { block: Block; siblings: readonly Block[]; index: number } | null => {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index !== -1) {
    const block = blocks[index];
    return block === undefined ? null : { block, siblings: blocks, index };
  }
  for (const block of blocks) {
    if (block.type === "table" || block.children === undefined) continue;
    const found = findBlockInTree(block.children, blockId);
    if (found !== null) return found;
  }
  return null;
};

// D20: moveBlockBefore/duplicateBlock은 자식 딸린 블록을 거절한다(슬라이스
// 7a #125가 하위 트리 인지 이동·복제를 완성할 때까지). table은 애초에
// children을 가질 수 없어(model 계층) 검사 대상에서 자연히 빠진다.
const hasChildren = (block: Block): boolean =>
  block.type !== "table" &&
  block.children !== undefined &&
  block.children.length > 0;

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
// blockContainer(그 첫 자식이 paragraph/heading인 경우만)를 재귀로 찾는다.
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
      if (
        blockContent.type.name === "paragraph" ||
        blockContent.type.name === "heading"
      ) {
        result = {
          blockId,
          blockType:
            blockContent.type.name === "heading"
              ? {
                  type: "heading",
                  level: blockContent.attrs.level as 1 | 2 | 3,
                }
              : { type: "paragraph" },
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

// Document는 문자열·숫자·리터럴유니온·배열·평문 객체로만 구성된 순수 JSON
// 트리다(Map/Set/함수/circular 없음, packages/model/src/types.ts 확인).
// Chrome75가 지원하지 않는 네이티브 전역 deep-clone 함수 대신 JSON 직렬화
// 왕복으로 clone한다 — 이 트리에 명시적 undefined 값이 없어(생략된 optional
// 필드만 존재) JSON.stringify가 그 키를 그대로 빠뜨리므로
// exactOptionalPropertyTypes와도 충돌하지 않는다. 인자가 스프레드 등으로 얕은
// 복사된 객체여도 직렬화 왕복이 blocks 등 중첩 배열까지 전부 새 참조로
// 만든다.
const cloneDocument = (document: BlockDocument): BlockDocument =>
  JSON.parse(JSON.stringify(document)) as BlockDocument;

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

// blockChanges의 헬퍼: 트리 전체를 재귀 평탄화해 Map(id → {parentId, index, ownJson})으로
// 변환한다. ownJson은 children 필드를 제외한 블록 자신의 직렬화다(깊이 무관
// diff를 위해 자식의 변경이 부모 ownJson을 오염하지 않도록).
const flattenBlockTree = (
  blocks: readonly Block[],
  parentId: string | null = null,
): Map<string, { parentId: string | null; index: number; ownJson: string }> => {
  const map = new Map<
    string,
    { parentId: string | null; index: number; ownJson: string }
  >();

  blocks.forEach((block, index) => {
    // ownJson: children 필드를 제외한 블록 자신의 직렬화. TableBlock은
    // children을 선언하지 않으므로 union 그대로는 구조분해 대상 필드가
    // 아니다 — schema.ts:415와 같은 패턴으로 좁힌다.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { children, ...blockWithoutChildren } = block as Block & {
      children?: unknown;
    };
    const ownJson = JSON.stringify(blockWithoutChildren);

    map.set(block.id, { parentId, index, ownJson });

    // 자식이 있으면 재귀 평탄화
    if ("children" in block && block.children !== undefined) {
      const childMap = flattenBlockTree(block.children, block.id);
      for (const [childId, childData] of childMap) {
        map.set(childId, childData);
      }
    }
  });

  return map;
};

const blockChanges = (
  previous: BlockDocument,
  next: BlockDocument,
): string[] => {
  const previousMap = flattenBlockTree(previous.blocks);
  const nextMap = flattenBlockTree(next.blocks);
  const changed: string[] = [];

  // 기존에 있던 블록 검사
  for (const [blockId, previousData] of previousMap) {
    const nextData = nextMap.get(blockId);
    if (
      nextData === undefined ||
      nextData.parentId !== previousData.parentId ||
      nextData.index !== previousData.index ||
      nextData.ownJson !== previousData.ownJson
    ) {
      changed.push(blockId);
    }
  }

  // 신규 블록 검사
  for (const [blockId] of nextMap) {
    if (!previousMap.has(blockId)) {
      changed.push(blockId);
    }
  }

  return changed;
};

const sameDocumentContent = (
  previous: BlockDocument,
  next: BlockDocument,
): boolean => blockChanges(previous, next).length === 0;

export const createEditor = (
  options: CreateEditorOptions,
): EditorController => {
  const parsedInitialDocument = parseSupportedDocument(options.initialDocument);
  if (!parsedInitialDocument.ok) {
    throw new TypeError(
      parsedInitialDocument.error.code === "DOCUMENT_INVALID"
        ? parsedInitialDocument.error.message
        : parsedInitialDocument.error.code,
    );
  }

  const createId = options.createId ?? createRandomDocumentId;
  let sessionRevision = parsedInitialDocument.value.revision;
  let currentDocument = cloneDocument(parsedInitialDocument.value);
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
          : converted.error.code,
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
    currentDocument = cloneDocument({
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
    // 호출자(createEditor/replaceDocument)가 parseSupportedDocument로 이미
    // 변환 가능성을 확정한 뒤라 이 실패는 도달 불가 방어선이다.
    const converted = modelToTiptap(document);
    if (!converted.ok) {
      throw new TypeError(
        converted.error.code === "DOCUMENT_INVALID"
          ? converted.error.message
          : converted.error.code,
      );
    }

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
          paragraph: false,
          heading: false,
          link: {
            openOnClick: false,
            isAllowedUri: (url) => isSupportedLinkHref(url),
            shouldAutoLink: (url) => isSupportedLinkHref(url),
          },
          trailingNode: false,
        }),
        ParagraphExtension,
        HeadingExtension,
        BlockContainerExtension,
        BlockGroupExtension,
        BlockIdExtension.configure({ createId }),
        BlockSplitExtension,
        TableExtension,
        TableRowExtension,
        TableCellExtension,
        TableKeyboardNavigationExtension.configure({ createId }),
        IndentKeyboardExtension,
        TablePasteExtension.configure({
          createId,
          ...(options.onPasteRejected === undefined
            ? {}
            : { onPasteRejected: options.onPasteRejected }),
        }),
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
    let applied: boolean;
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

    const target = findEditableBlockContent(tiptapEditor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const targetPosition = target.position;
    const targetIsTextblock = target.node.isTextblock;
    const targetSize = target.node.content.size;
    const currentText = target.node.textContent;

    // 표처럼 textblock이 아닌 블록의 content를 텍스트로 교체하면 스키마가
    // 깨진 노드가 남아 이후 모든 트랜잭션이 실패한다.
    if (!targetIsTextblock) return commandNotApplicable("setText");
    if (currentText === text) return commandNotApplicable("setText");

    return runDocumentCommand("setText", "local", () => {
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

    if (findBlockInTree(currentDocument.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    // "블록 뒤" = 그 노드의 nodeSize 뒤 = 자식 딸린 블록이면 하위 트리
    // 전체 뒤(컨테이너 nodeSize가 blockGroup을 포함한다, D20) — 별도 가드
    // 없이 안전하다.
    const sourcePosition = findBlockPosition(tiptapEditor.state.doc, blockId);
    if (sourcePosition === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const sourceNode = tiptapEditor.state.doc.nodeAt(sourcePosition);
    if (sourceNode === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const insertPosition = sourcePosition + sourceNode.nodeSize;

    const result = runDocumentCommand("insertParagraphAfter", "local", () => {
      const paragraphType = tiptapEditor.schema.nodes.paragraph;
      if (paragraphType === undefined) return false;
      const paragraph = paragraphType.create();
      // 삽입되는 문단은 컨테이너로 감싸이지 않은 맨몸 노드다 — "block" 그룹
      // 슬롯에 들어가며 PM의 slice-fitting이 새 blockContainer로 자동
      // 감싼다(block-container-extension.ts 계약). 감싸진 뒤
      // BlockIdExtension.appendTransaction이 같은 dispatch 안에서 그
      // 컨테이너에 blockId를 사후 배정한다 — insertParagraphAfter는 그
      // 배정이 끝난 뒤의 blockId를 아래에서 형제 배열 재조회로 회수한다.
      const transaction = tiptapEditor.state.tr.insert(
        insertPosition,
        paragraph,
      );
      // insertPosition은 fitting 뒤 새 blockContainer 자신의 위치가 된다 —
      // +1로 컨테이너에 들어가면 blockContent(문단) 자신, +2로 그 문단의
      // (비어 있는) 텍스트 안에 캐럿이 놓인다.
      transaction.setSelection(
        TextSelection.create(transaction.doc, insertPosition + 2),
      );
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;

    // 부모의 children(또는 최상위 blocks) 기준 "다음 형제"로 새 블록을
    // 찾는다 — 평면 인덱스 산술은 중첩 부모에서 깨진다(DELTA-02a).
    const after = findBlockInTree(currentDocument.blocks, blockId);
    const createdBlock =
      after === null ? undefined : after.siblings[after.index + 1];
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

    // 대상은 컨테이너가 아니라 내부 blockContent 노드다(D19) — blockId는
    // 컨테이너 attrs 소유라 타입 변경이 identity·자식 귀속을 건드릴 구조적
    // 경로가 없다.
    const target = findEditableBlockContent(tiptapEditor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const targetPosition = target.position;
    const currentTypeName = target.node.type.name;
    const currentLevel =
      typeof target.node.attrs.level === "number"
        ? target.node.attrs.level
        : null;
    const currentContentSize = target.node.content.size;

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
      const nodeType =
        blockType.type === "paragraph"
          ? tiptapEditor.schema.nodes.paragraph
          : tiptapEditor.schema.nodes.heading;
      if (nodeType === undefined) return false;
      // blockId는 더 이상 이 노드의 attrs가 아니다(D19) — 컨테이너가
      // identity를 소유해 여기서 건드릴 필요도, 경로도 없다.
      const attrs =
        blockType.type === "paragraph" ? {} : { level: blockType.level };

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

    const source = findBlockInTree(currentDocument.blocks, blockId);
    if (source === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    // D20(D7 축소 잔존): 자식 딸린 블록의 하위 트리 인지 이동은 슬라이스
    // 7a(#125) 소관이다 — 그때까지 거절한다.
    if (hasChildren(source.block)) {
      return commandNotApplicable("moveBlockBefore");
    }

    // 컨테이너 구조에서 "평면 인접성"은 같은-부모 형제 간 이동으로
    // 재정의된다 — beforeBlockId도 source와 같은 형제 배열에 속해야 한다.
    let targetIndex = source.siblings.length;
    if (beforeBlockId !== null) {
      const target = findBlockInTree(currentDocument.blocks, beforeBlockId);
      if (target === null) {
        return {
          ok: false,
          error: { code: "BLOCK_NOT_FOUND", blockId: beforeBlockId },
        };
      }
      if (target.siblings !== source.siblings) {
        return commandNotApplicable("moveBlockBefore");
      }
      targetIndex = target.index;
    }
    if (targetIndex === source.index || targetIndex === source.index + 1) {
      return commandNotApplicable("moveBlockBefore");
    }

    return runDocumentCommand("moveBlockBefore", "local", () => {
      const sourcePosition = findBlockPosition(tiptapEditor.state.doc, blockId);
      if (sourcePosition === null) return false;
      const sourceNode = tiptapEditor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;

      let transaction = tiptapEditor.state.tr.delete(
        sourcePosition,
        sourcePosition + sourceNode.nodeSize,
      );
      let insertPosition: number;
      if (beforeBlockId !== null) {
        const mappedTargetPosition = findBlockPosition(
          transaction.doc,
          beforeBlockId,
        );
        if (mappedTargetPosition === null) return false;
        insertPosition = mappedTargetPosition;
      } else {
        // beforeBlockId가 null이면 "자신의 부모 형제 목록 끝"으로 옮긴다 —
        // 최상위 블록은 부모가 문서 자신이라 기존 "문서 끝" 의미와 같다.
        // 삭제 직후 doc에서 남은 마지막 형제를 다시 찾아 그 뒤에 끼운다
        // (형제 배열 끝 = 그 마지막 형제의 nodeSize 뒤).
        const lastSiblingId = source.siblings[source.siblings.length - 1]?.id;
        if (lastSiblingId === undefined) return false;
        const mappedLastSiblingPosition = findBlockPosition(
          transaction.doc,
          lastSiblingId,
        );
        if (mappedLastSiblingPosition === null) return false;
        const lastSiblingNode = transaction.doc.nodeAt(
          mappedLastSiblingPosition,
        );
        if (lastSiblingNode === null) return false;
        insertPosition = mappedLastSiblingPosition + lastSiblingNode.nodeSize;
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

    const source = findBlockInTree(currentDocument.blocks, blockId);
    if (source === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    // blockId만 재발급하는 복제는 표의 row/cell/column id를 그대로 복사해
    // 문서 전체 id 유일성 불변식을 깨뜨린다. 표 복제는 전용 명령이 생길
    // 때까지 거부한다. D20(D7 축소 잔존): 자식 딸린 블록의 복제는 후손
    // blockId 전면 중복을 낳는다(재귀 id 재발급은 슬라이스 7a #125 소관) —
    // 그때까지 거절한다.
    if (source.block.type === "table" || hasChildren(source.block)) {
      return commandNotApplicable("duplicateBlock");
    }

    const result = runDocumentCommand("duplicateBlock", "local", () => {
      const sourcePosition = findBlockPosition(tiptapEditor.state.doc, blockId);
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
      // 복제본은 항상 자식 없는 blockContainer(위 hasChildren/table 가드)라
      // 유일한 자식이 blockContent다. 텍스트 끝은 컨테이너 닫힘(-1)이 아니라
      // 그 안쪽 blockContent 닫힘 직전(-2)이다 — D19 이전 flat 스키마의 -1
      // 산술을 그대로 두면 캐럿이 비-textblock 경계에 놓인다.
      transaction.setSelection(
        TextSelection.create(
          transaction.doc,
          insertPosition + duplicateNode.nodeSize - 2,
        ),
      );
      tiptapEditor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;

    const after = findBlockInTree(currentDocument.blocks, blockId);
    const createdBlock =
      after === null ? undefined : after.siblings[after.index + 1];
    if (createdBlock === undefined) {
      return commandNotApplicable("duplicateBlock");
    }
    return { ok: true, value: { blockId: createdBlock.id } };
  };

  const deleteBlock = (blockId: string): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("deleteBlock");

    const target = findBlockInTree(currentDocument.blocks, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    // R0("문서는 최소 블록 1개")는 최상위 blocks 배열에 대한 불변식이다
    // (modelToTiptap 확인) — 대상이 그 유일한 최상위 블록일 때만 걸린다.
    // 중첩 블록 삭제는 최상위 개수를 건드리지 않아 이 가드와 무관하다
    // (깊이와 무관하게 top-level과 동일 동작 — 완료 조건 2).
    if (
      target.siblings === currentDocument.blocks &&
      target.siblings.length <= 1
    ) {
      return commandNotApplicable("deleteBlock");
    }

    return runDocumentCommand("deleteBlock", "local", () => {
      // D20: 컨테이너 삭제 = 하위 트리 동반 삭제가 기본이다 — nodeSize가
      // 자식(blockGroup) 포함이라 별도 가드 없이 이 delete 하나로 끝난다.
      const sourcePosition = findBlockPosition(tiptapEditor.state.doc, blockId);
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

  // DELTA-03: deleteBlock과 같은 순서(가드 → findBlockInTree/findBlockPosition
  // → 순수 함수 위임)를 따른다. indentBlockCommand/outdentBlockCommand는 이미
  // EditorError 모양의 Result를 반환하고(D2 — 신규 코드 없음), BLOCK_NOT_FOUND는
  // 이 모델 트리 가드가 앞서 잡아내므로 그 아래에서 실패하는 경로는 전부
  // COMMAND_NOT_APPLICABLE로 수렴한다 — runDocumentCommand의 기본 실패값과
  // 코드가 일치해 별도로 캡처해 되돌릴 필요가 없다(runTableCommand의
  // 클로저 좁히기 회피가 여기선 불필요).
  const indentBlock = (blockId: string): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("indentBlock");

    if (findBlockInTree(currentDocument.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    return runDocumentCommand("indentBlock", "local", () => {
      const outcome = indentBlockCommand(tiptapEditor, blockId);
      return outcome.ok;
    });
  };

  const outdentBlock = (blockId: string): Result<void, EditorError> => {
    if (destroyed) return commandNotApplicable("outdentBlock");

    if (findBlockInTree(currentDocument.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    return runDocumentCommand("outdentBlock", "local", () => {
      const outcome = outdentBlockCommand(tiptapEditor, blockId);
      return outcome.ok;
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
  // 공유하는 실행기. runDocumentCommand의 boolean 결과 위에서 표 명령
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

    const result = runDocumentCommand(command, "local", () => {
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
      return cloneDocument(currentDocument);
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
      // blockId는 더 이상 이 노드(paragraph/heading) 자신의 attrs가
      // 아니다(D19) — 가장 가까운 blockContainer 조상이 소유한다.
      const blockId = nearestBlockContainerId(selection.$from);
      if (blockId === null) return null;

      const blockType: BlockTypeDescriptor =
        node.type.name === "heading"
          ? { type: "heading", level: node.attrs.level as 1 | 2 | 3 }
          : { type: "paragraph" };
      return { blockId, blockType, text: node.textContent };
    },
    getSelectionBlockType() {
      if (destroyed) return null;
      const { selection, doc } = tiptapEditor.state;
      return findSelectionBlock(doc, 0, selection.from, selection.to);
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
      indentBlock,
      outdentBlock,
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
      pasteTabularData: (data) => {
        if (destroyed) return commandNotApplicable("pasteTabularData");
        return runTableCommand("pasteTabularData", () =>
          pasteTabularDataCommand(tiptapEditor, data, createId),
        );
      },
      insertTable: (afterBlockId, size, options) => {
        if (destroyed) return commandNotApplicable("insertTable");
        return runTableCommand("insertTable", () =>
          insertTableCommand(
            tiptapEditor,
            afterBlockId,
            size,
            createId,
            options,
          ),
        );
      },
      insertTableRow: (tableBlockId, atIndex) =>
        runTableCommand("insertTableRow", () =>
          insertTableRowCommand(tiptapEditor, tableBlockId, atIndex, createId),
        ),
      insertTableColumn: (tableBlockId, atIndex) =>
        runTableCommand("insertTableColumn", () =>
          insertTableColumnCommand(
            tiptapEditor,
            tableBlockId,
            atIndex,
            createId,
          ),
        ),
      moveTableRow: (tableBlockId, fromIndex, toIndex) =>
        runTableCommand("moveTableRow", () =>
          moveTableRowCommand(tiptapEditor, tableBlockId, fromIndex, toIndex),
        ),
      moveTableColumn: (tableBlockId, fromIndex, toIndex) =>
        runTableCommand("moveTableColumn", () =>
          moveTableColumnCommand(
            tiptapEditor,
            tableBlockId,
            fromIndex,
            toIndex,
          ),
        ),
      resizeTableColumn: (tableBlockId, index, width) =>
        runTableCommand("resizeTableColumn", () =>
          resizeTableColumnCommand(tiptapEditor, tableBlockId, index, width),
        ),
      mergeTableCells: (tableBlockId) => {
        if (destroyed) return commandNotApplicable("mergeTableCells");
        return runTableCommand("mergeTableCells", () =>
          mergeTableCellsCommand(tiptapEditor, tableBlockId),
        );
      },
      splitTableCell: (tableBlockId, cellId) =>
        runTableCommand("splitTableCell", () =>
          splitTableCellCommand(tiptapEditor, tableBlockId, cellId, createId),
        ),
      deleteTableRow: (tableBlockId, index) =>
        runTableCommand("deleteTableRow", () =>
          deleteTableRowCommand(tiptapEditor, tableBlockId, index),
        ),
      deleteTableColumn: (tableBlockId, index) =>
        runTableCommand("deleteTableColumn", () =>
          deleteTableColumnCommand(tiptapEditor, tableBlockId, index),
        ),
      toggleTableHeaderRow: (tableBlockId) =>
        runTableCommand("toggleTableHeaderRow", () =>
          toggleTableHeaderRowCommand(tiptapEditor, tableBlockId),
        ),
      toggleTableHeaderColumn: (tableBlockId) =>
        runTableCommand("toggleTableHeaderColumn", () =>
          toggleTableHeaderColumnCommand(tiptapEditor, tableBlockId),
        ),
      setTableCellTextColor: (tableBlockId, target, color) =>
        runTableCommand("setTableCellTextColor", () =>
          setTableCellColorCommand(
            tiptapEditor,
            tableBlockId,
            target,
            "textColor",
            color,
          ),
        ),
      setTableCellBackgroundColor: (tableBlockId, target, color) =>
        runTableCommand("setTableCellBackgroundColor", () =>
          setTableCellColorCommand(
            tiptapEditor,
            tableBlockId,
            target,
            "backgroundColor",
            color,
          ),
        ),
      setTableCellAlign: (tableBlockId, target, align) =>
        runTableCommand("setTableCellAlign", () =>
          setTableCellAlignCommand(tiptapEditor, tableBlockId, target, align),
        ),
      undo: () =>
        runDocumentCommand("undo", "undo", () => tiptapEditor.commands.undo()),
      redo: () =>
        runDocumentCommand("redo", "redo", () => tiptapEditor.commands.redo()),
    },
  };
};
