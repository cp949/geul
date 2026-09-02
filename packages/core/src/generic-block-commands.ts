import {
  canonicalizeCodeBlockLanguage,
  isInlineContentBlockType,
  isListEntryBlockType,
  isNestableBlockType,
  isValidCodeBlockLanguage,
  isValidInlineText,
  parseDocument,
  type Block,
  type Result,
} from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";

import {
  findBlockPosition,
  findEditableBlockContent,
} from "./block-position.js";
import { toggleCheckListItemCheckedCommand } from "./check-list-item-commands.js";
import {
  toggleHeadingCollapseCommand,
  toggleListItemCollapseCommand,
} from "./toggle-collapse-commands.js";
import {
  collectDocumentIdentityIds,
  createUniqueDocumentId,
} from "./document-id-factory.js";
import type { EditorError } from "./errors.js";
import type { SetBlockTypeDescriptor } from "./editor-controller.js";
import { indentBlockCommand, outdentBlockCommand } from "./indent-commands.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

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
    if (!("children" in block) || block.children === undefined) {
      continue;
    }
    const found = findBlockInTree(block.children, blockId);
    if (found !== null) return found;
  }
  return null;
};

const hasChildren = (block: Block): boolean =>
  "children" in block &&
  block.children !== undefined &&
  block.children.length > 0;

type BlockSelectionRangeResolution = {
  siblings: readonly Block[];
  startIndex: number;
  endIndex: number;
  rangeBlocks: readonly Block[];
};

// blockSelection이 가리키는 fromBlockId/toBlockId를 현재 documentBlocks에서
// 다시 찾아 범위를 확정한다. deleteSelectedBlocks·moveSelectedBlocksBefore가
// 호출 시점마다 공유하는 mutation 전 판정이다(DELTA-02 완료 조건 13) —
// blockSelection은 runDocumentCommand를 거치지 않는 세션 필드라 외부 명령
// (예: indentBlock으로 범위 안 블록이 다른 부모로 옮겨짐, 또는 deleteBlock으로
// 범위 안 블록이 사라짐)이 stale하게 만들 수 있다. blockId 자체가
// 사라졌으면 BLOCK_NOT_FOUND, 더 이상 같은 부모 형제가 아니면
// COMMAND_NOT_APPLICABLE로 구분한다. findBlockInTree·hasChildren처럼 순수
// 함수로 두어 session 없이도 테스트하기 쉽게 한다.
const resolveBlockSelectionRange = (
  documentBlocks: readonly Block[],
  selection: { fromBlockId: string; toBlockId: string },
  command: string,
): Result<BlockSelectionRangeResolution, EditorError> => {
  const from = findBlockInTree(documentBlocks, selection.fromBlockId);
  if (from === null) {
    return {
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: selection.fromBlockId },
    };
  }
  const to = findBlockInTree(documentBlocks, selection.toBlockId);
  if (to === null) {
    return {
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: selection.toBlockId },
    };
  }
  if (from.siblings !== to.siblings) {
    return commandNotApplicable(command);
  }
  const startIndex = Math.min(from.index, to.index);
  const endIndex = Math.max(from.index, to.index);
  return {
    ok: true,
    value: {
      siblings: from.siblings,
      startIndex,
      endIndex,
      rangeBlocks: from.siblings.slice(startIndex, endIndex + 1),
    },
  };
};

export const createGenericBlockCommands = (
  session: ProductionEditorSession,
) => {
  const setText = (
    blockId: string,
    text: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("setText");
    const target = findEditableBlockContent(session.editor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const targetPosition = target.position;
    const targetSize = target.node.content.size;
    if (
      !isNestableBlockType(target.node.type.name) ||
      !isValidInlineText(text) ||
      target.node.textContent === text
    ) {
      return commandNotApplicable("setText");
    }
    return session.runDocumentCommand("setText", "local", () => {
      const from = targetPosition + 1;
      const to = from + targetSize;
      const transaction = session.editor.state.tr;
      if (text.length === 0) transaction.delete(from, to);
      else transaction.replaceWith(from, to, session.editor.schema.text(text));
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const insertParagraphAfter = (
    blockId: string,
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("insertParagraphAfter");
    }
    if (findBlockInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const sourcePosition = findBlockPosition(session.editor.state.doc, blockId);
    const sourceNode =
      sourcePosition === null
        ? null
        : session.editor.state.doc.nodeAt(sourcePosition);
    if (sourcePosition === null || sourceNode === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const insertPosition = sourcePosition + sourceNode.nodeSize;
    const result = session.runDocumentCommand(
      "insertParagraphAfter",
      "local",
      () => {
        const paragraphType = session.editor.schema.nodes.paragraph;
        if (paragraphType === undefined) return false;
        const transaction = session.editor.state.tr.insert(
          insertPosition,
          paragraphType.create(),
        );
        transaction.setSelection(
          TextSelection.create(transaction.doc, insertPosition + 2),
        );
        session.editor.view.dispatch(closeHistory(transaction));
        return true;
      },
    );
    if (!result.ok) return result;
    const after = findBlockInTree(session.document.blocks, blockId);
    const createdBlock =
      after === null ? undefined : after.siblings[after.index + 1];
    return createdBlock === undefined
      ? commandNotApplicable("insertParagraphAfter")
      : { ok: true, value: { blockId: createdBlock.id } };
  };

  const setBlockType = (
    blockId: string,
    blockType: SetBlockTypeDescriptor,
    options?: { clearContent?: boolean },
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("setBlockType");
    const modelTarget = findBlockInTree(session.document.blocks, blockId);
    if (modelTarget === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const target = findEditableBlockContent(session.editor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const currentTypeName = target.node.type.name;
    if (!isInlineContentBlockType(currentTypeName)) {
      return commandNotApplicable("setBlockType");
    }
    const currentLevel =
      typeof target.node.attrs.level === "number"
        ? target.node.attrs.level
        : null;
    // level만 바뀌는 호출(같은 heading 안 레벨 변경)에서 isToggleable을
    // 생략하면 currentTypeName이 heading일 때만 현재 값을 캐리포워드한다.
    // numberedListItem.startNumber와 같은 이유: setNodeMarkup에 attrs를
    // 부분만 넘기면 PM이 나머지를 schema default(null)로 채워 기존 값을
    // 지운다(RD-003 트랙-3 결함 탐지 F1). heading이 아닌 타입에서 heading으로
    // 새로 바뀌는 경우는 캐리포워드할 원본이 없으므로 null(토글 아님)이 맞다.
    const currentIsToggleable =
      currentTypeName === "heading"
        ? ((target.node.attrs.isToggleable as boolean | null | undefined) ??
          null)
        : null;
    const currentCollapsed =
      currentTypeName === "heading"
        ? ((target.node.attrs.collapsed as boolean | null | undefined) ?? null)
        : null;
    // isToggleable 자체는 RD-004 DELTA-02부터 SetBlockTypeDescriptor가 받는
    // 값이다(numberedListItem.startNumber와 같은 캐리포워드 패턴, 위 주석).
    // 최종 값을 여기서 한 번에 boolean으로 좁혀 attrs 조립과 isSameType
    // 비교가 같은 값을 쓰게 한다.
    const headingIsToggleable =
      blockType.type === "heading"
        ? (blockType.isToggleable ?? currentIsToggleable ?? false)
        : false;
    // isToggleable이 true가 아닌 모든 경로(명시 해제·캐리포워드 대상 없음)에서
    // collapsed도 함께 null로 되돌린다 — 그러지 않으면 model 불변식(collapsed는
    // isToggleable:true인 heading만 가능, model/schema.ts validateBlocksAt)을
    // 어긴 DOCUMENT_INVALID 문서가 만들어져 production-editor-session.ts의
    // readEditorDocument가 매 커밋마다 호출하는 tiptapToModel에서 TypeError를
    // 던진다(G-CNV-001 — 불변식 판정은 여전히 model 한 곳에서만 하고, 여기서는
    // 그 불변식을 어기지 않는 값만 쓴다).
    const headingCollapsed = headingIsToggleable ? currentCollapsed : null;
    const currentContentSize = target.node.content.size;
    const clearContent = options?.clearContent ?? false;
    // bulletListItem/numberedListItem/checkListItem/toggleListItem 넷 다
    // "목록"이다(spec 글머리·번호·체크·토글 목록) — isListItemBlockType(io
    // <ul>/<ol> 직렬화 축)이 아니라 isListEntryBlockType(io 축과 분리된 편집
    // UX 축, RD-003 F2)을 써서 toggleListItem도 이 가드에 포함한다. 그러지
    // 않으면 자식 없는 toggleListItem만 codeBlock 변환이 허용되는 비대칭이
    // 생긴다(RD-003 트랙-3 pending 이슈, IMPL-REVIEW-01.md "남은 위험").
    const currentIsList = isListEntryBlockType(currentTypeName);
    const targetIsList = isListEntryBlockType(blockType.type);
    if (
      (currentTypeName === "codeBlock" && targetIsList) ||
      (currentIsList && blockType.type === "codeBlock")
    ) {
      return commandNotApplicable("setBlockType");
    }
    const changesCodeBlockBoundary =
      currentTypeName === "codeBlock" || blockType.type === "codeBlock";
    if (
      blockType.type === "codeBlock" &&
      currentTypeName !== "codeBlock" &&
      hasChildren(modelTarget.block)
    ) {
      return commandNotApplicable("setBlockType");
    }
    if (
      currentTypeName === "codeBlock" &&
      blockType.type !== "codeBlock" &&
      !clearContent &&
      !isValidInlineText(target.node.textContent)
    ) {
      return commandNotApplicable("setBlockType");
    }
    let codeBlockLanguage: string | null = null;
    if (blockType.type === "codeBlock") {
      const requestedLanguage = blockType.language ?? "text";
      const language = requestedLanguage === "" ? "text" : requestedLanguage;
      if (!isValidCodeBlockLanguage(language)) {
        return commandNotApplicable("setBlockType");
      }
      codeBlockLanguage = canonicalizeCodeBlockLanguage(language);
    }
    let numberedStartNumber: number | null = null;
    if (blockType.type === "numberedListItem") {
      numberedStartNumber =
        blockType.startNumber === undefined &&
        currentTypeName === "numberedListItem"
          ? ((target.node.attrs.startNumber as number | null | undefined) ??
            null)
          : (blockType.startNumber ?? null);
      if (
        numberedStartNumber !== null &&
        !parseDocument({
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "set-block-type-number-validation",
              type: "numberedListItem",
              content: [],
              startNumber: numberedStartNumber,
            },
          ],
        }).ok
      ) {
        return commandNotApplicable("setBlockType");
      }
    }
    const isSameType =
      blockType.type === "heading"
        ? currentTypeName === "heading" &&
          currentLevel === blockType.level &&
          (currentIsToggleable ?? false) === headingIsToggleable
        : blockType.type === "codeBlock"
          ? currentTypeName === "codeBlock" &&
            target.node.attrs.language === codeBlockLanguage
          : blockType.type === "numberedListItem"
            ? currentTypeName === "numberedListItem" &&
              ((target.node.attrs.startNumber as number | null | undefined) ??
                null) === numberedStartNumber
            : currentTypeName === blockType.type;
    if (isSameType && (!clearContent || currentContentSize === 0)) {
      // language setter는 UI commit seam이기도 하다. 유효 입력이 이미 같은
      // canonical 상태면 transaction 없이 성공해 caller가 거절과 구분한다.
      if (blockType.type === "codeBlock") {
        return { ok: true, value: undefined };
      }
      return commandNotApplicable("setBlockType");
    }
    return session.runDocumentCommand("setBlockType", "local", () => {
      const nodeType = session.editor.schema.nodes[blockType.type];
      if (nodeType === undefined) return false;
      if (changesCodeBlockBoundary) {
        const source = clearContent ? "" : target.node.textContent;
        const content =
          source === "" ? undefined : session.editor.schema.text(source);
        const attrs =
          blockType.type === "heading"
            ? {
                level: blockType.level,
                isToggleable: headingIsToggleable ? true : null,
                collapsed: headingCollapsed,
              }
            : blockType.type === "codeBlock"
              ? { language: codeBlockLanguage }
              : {};
        const replacement = nodeType.create(attrs, content);
        const transaction = session.editor.state.tr.replaceWith(
          target.position,
          target.position + target.node.nodeSize,
          replacement,
        );
        if (currentTypeName !== blockType.type || clearContent) {
          transaction.setSelection(
            TextSelection.create(transaction.doc, target.position + 1),
          );
        } else {
          transaction.setSelection(
            Selection.fromJSON(
              transaction.doc,
              session.editor.state.selection.toJSON(),
            ),
          );
        }
        session.editor.view.dispatch(closeHistory(transaction));
        return true;
      }
      let transaction = session.editor.state.tr;
      if (clearContent && currentContentSize > 0) {
        transaction = transaction.delete(
          target.position + 1,
          target.position + 1 + currentContentSize,
        );
      }
      const attrs =
        blockType.type === "heading"
          ? {
              level: blockType.level,
              isToggleable: headingIsToggleable ? true : null,
              collapsed: headingCollapsed,
            }
          : blockType.type === "numberedListItem"
            ? { startNumber: numberedStartNumber }
            : {};
      transaction = transaction.setNodeMarkup(target.position, nodeType, attrs);
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const moveBlockBefore = (
    blockId: string,
    beforeBlockId: string | null,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("moveBlockBefore");
    const source = findBlockInTree(session.document.blocks, blockId);
    if (source === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (hasChildren(source.block))
      return commandNotApplicable("moveBlockBefore");
    let targetIndex = source.siblings.length;
    if (beforeBlockId !== null) {
      const target = findBlockInTree(session.document.blocks, beforeBlockId);
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
    return session.runDocumentCommand("moveBlockBefore", "local", () => {
      const sourcePosition = findBlockPosition(
        session.editor.state.doc,
        blockId,
      );
      if (sourcePosition === null) return false;
      const sourceNode = session.editor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;
      let transaction = session.editor.state.tr.delete(
        sourcePosition,
        sourcePosition + sourceNode.nodeSize,
      );
      let insertPosition: number;
      if (beforeBlockId !== null) {
        const targetPosition = findBlockPosition(
          transaction.doc,
          beforeBlockId,
        );
        if (targetPosition === null) return false;
        insertPosition = targetPosition;
      } else {
        const lastSiblingId = source.siblings[source.siblings.length - 1]?.id;
        if (lastSiblingId === undefined) return false;
        const lastPosition = findBlockPosition(transaction.doc, lastSiblingId);
        if (lastPosition === null) return false;
        const lastNode = transaction.doc.nodeAt(lastPosition);
        if (lastNode === null) return false;
        insertPosition = lastPosition + lastNode.nodeSize;
      }
      transaction = transaction.insert(insertPosition, sourceNode);
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  // spec §5.3 — blockSelection 범위(및 그 children)를 같은 부모 형제 목록
  // 안에서 통째로 이동한다. moveBlockBefore(위)의 부모 일치·no-op 가드를
  // 범위로 확장해 재사용하되, hasChildren 가드(348-349행)는 재사용하지
  // 않는다 — children 동반 이동이 이 명령의 핵심 계약이다(DELTA-02
  // 트랙-4 확인사항 1). 문서 하나를 여러 트랜잭션으로 쪼개지 않도록 delete →
  // insert를 한 dispatch로 묶는다(G-EDT-001, moveBlockBefore와 같은 이유로
  // delete 전에 원본 Fragment를 캡처한다 — delete 후에는 위치가 무효화된다).
  const moveSelectedBlocksBefore = (
    beforeBlockId: string | null,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("moveSelectedBlocksBefore");
    }
    const selection = session.getBlockSelection();
    if (selection === null) {
      return commandNotApplicable("moveSelectedBlocksBefore");
    }
    const resolved = resolveBlockSelectionRange(
      session.document.blocks,
      selection,
      "moveSelectedBlocksBefore",
    );
    if (!resolved.ok) return resolved;
    const { siblings, endIndex, rangeBlocks } = resolved.value;

    // beforeBlockId가 범위 내부(또는 그 children, 재귀 포함)를 가리키면
    // 자기 범위 안으로 이동하는 셈이라 거절한다(완료 조건 8).
    const rangeIds = new Set<string>();
    const collectRangeIds = (blocks: readonly Block[]): void => {
      for (const block of blocks) {
        rangeIds.add(block.id);
        if ("children" in block && block.children !== undefined) {
          collectRangeIds(block.children);
        }
      }
    };
    collectRangeIds(rangeBlocks);

    let targetIndex = siblings.length;
    if (beforeBlockId !== null) {
      if (rangeIds.has(beforeBlockId)) {
        return commandNotApplicable("moveSelectedBlocksBefore");
      }
      const target = findBlockInTree(session.document.blocks, beforeBlockId);
      if (target === null) {
        return {
          ok: false,
          error: { code: "BLOCK_NOT_FOUND", blockId: beforeBlockId },
        };
      }
      // moveBlockBefore의 "같은 부모 형제만 허용" 가드 재사용(완료 조건 7).
      if (target.siblings !== siblings) {
        return commandNotApplicable("moveSelectedBlocksBefore");
      }
      targetIndex = target.index;
    }
    // rangeIds 가드로 targetIndex는 이미 [startIndex, endIndex] 밖으로
    // 좁혀졌다 — 남은 no-op은 범위 바로 다음 자리(endIndex+1)로 이동하는
    // 경우뿐이다(완료 조건 10). beforeBlockId=null(끝으로 이동, 완료 조건
    // 9)도 범위가 이미 끝이면 여기서 같이 걸러진다.
    if (targetIndex === endIndex + 1) {
      return commandNotApplicable("moveSelectedBlocksBefore");
    }

    const firstBlockId = rangeBlocks[0]?.id;
    const lastBlockId = rangeBlocks[rangeBlocks.length - 1]?.id;
    if (firstBlockId === undefined || lastBlockId === undefined) {
      return commandNotApplicable("moveSelectedBlocksBefore");
    }
    const lastSiblingId = siblings[siblings.length - 1]?.id;

    // 이동은 blockId를 바꾸지 않으므로 성공 후에도 session.setBlockSelection을
    // 호출하지 않는다 — getBlockSelection()이 이동 전과 같은
    // {fromBlockId, toBlockId}를 유지해야 한다(완료 조건 12, 상하 이동 버튼
    // 연타 지원).
    return session.runDocumentCommand(
      "moveSelectedBlocksBefore",
      "local",
      () => {
        const firstPosition = findBlockPosition(
          session.editor.state.doc,
          firstBlockId,
        );
        if (firstPosition === null) return false;
        const lastPosition = findBlockPosition(
          session.editor.state.doc,
          lastBlockId,
        );
        if (lastPosition === null) return false;
        const lastRangeNode = session.editor.state.doc.nodeAt(lastPosition);
        if (lastRangeNode === null) return false;
        const endPosition = lastPosition + lastRangeNode.nodeSize;
        const sourceSlice = session.editor.state.doc.slice(
          firstPosition,
          endPosition,
        );
        let transaction = session.editor.state.tr.delete(
          firstPosition,
          endPosition,
        );
        let insertPosition: number;
        if (beforeBlockId !== null) {
          const targetPosition = findBlockPosition(
            transaction.doc,
            beforeBlockId,
          );
          if (targetPosition === null) return false;
          insertPosition = targetPosition;
        } else {
          if (lastSiblingId === undefined) return false;
          const lastSiblingPosition = findBlockPosition(
            transaction.doc,
            lastSiblingId,
          );
          if (lastSiblingPosition === null) return false;
          const lastSiblingNode = transaction.doc.nodeAt(lastSiblingPosition);
          if (lastSiblingNode === null) return false;
          insertPosition = lastSiblingPosition + lastSiblingNode.nodeSize;
        }
        transaction = transaction.insert(insertPosition, sourceSlice.content);
        session.editor.view.dispatch(closeHistory(transaction));
        return true;
      },
    );
  };

  // spec §5.3 — 같은 부모 형제 범위만 blockSelection으로 성립한다. moveBlockBefore의
  // "같은 부모 형제만 허용" 가드(target.siblings !== source.siblings)를 그대로
  // 재사용한다. 문서를 바꾸지 않으므로 runDocumentCommand를 거치지 않는다 —
  // G-EDT-001은 document/selection(PM)/mark/revision/undo를 바꾸는 명령에만
  // 적용되고 이 명령은 그중 어느 것도 바꾸지 않는다(DELTA-01).
  const selectBlockRange = (
    fromBlockId: string,
    toBlockId: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("selectBlockRange");
    const from = findBlockInTree(session.document.blocks, fromBlockId);
    if (from === null) {
      return {
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: fromBlockId },
      };
    }
    const to = findBlockInTree(session.document.blocks, toBlockId);
    if (to === null) {
      return {
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: toBlockId },
      };
    }
    if (from.siblings !== to.siblings) {
      return commandNotApplicable("selectBlockRange");
    }
    session.setBlockSelection(
      from.index <= to.index
        ? { fromBlockId, toBlockId }
        : { fromBlockId: toBlockId, toBlockId: fromBlockId },
    );
    return { ok: true, value: undefined };
  };

  // blockSelection이 이미 없는 상태의 재호출은 다른 명령들의 no-op 관례와
  // 같이 거절한다(DELTA-01 완료 조건 6). selectBlockRange와 같은 이유로
  // runDocumentCommand를 거치지 않는다.
  const clearBlockSelection = (): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("clearBlockSelection");
    if (session.getBlockSelection() === null) {
      return commandNotApplicable("clearBlockSelection");
    }
    session.setBlockSelection(null);
    return { ok: true, value: undefined };
  };

  const duplicateBlock = (
    blockId: string,
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("duplicateBlock");
    const source = findBlockInTree(session.document.blocks, blockId);
    if (source === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (source.block.type === "table" || hasChildren(source.block)) {
      return commandNotApplicable("duplicateBlock");
    }
    if (session.revision >= Number.MAX_SAFE_INTEGER) {
      return commandNotApplicable("duplicateBlock");
    }
    const duplicateId = createUniqueDocumentId(
      session.createId,
      collectDocumentIdentityIds(session.document),
    );
    const result = session.runDocumentCommand("duplicateBlock", "local", () => {
      const sourcePosition = findBlockPosition(
        session.editor.state.doc,
        blockId,
      );
      if (sourcePosition === null) return false;
      const sourceNode = session.editor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;
      const insertPosition = sourcePosition + sourceNode.nodeSize;
      const duplicateNode = sourceNode.type.create(
        { ...sourceNode.attrs, blockId: duplicateId },
        sourceNode.content,
        sourceNode.marks,
      );
      const transaction = session.editor.state.tr.insert(
        insertPosition,
        duplicateNode,
      );
      transaction.setSelection(
        duplicateNode.type.name === "blockContainer"
          ? TextSelection.create(
              transaction.doc,
              insertPosition + duplicateNode.nodeSize - 2,
            )
          : NodeSelection.create(transaction.doc, insertPosition),
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    const after = findBlockInTree(session.document.blocks, blockId);
    const createdBlock =
      after === null ? undefined : after.siblings[after.index + 1];
    return createdBlock === undefined
      ? commandNotApplicable("duplicateBlock")
      : { ok: true, value: { blockId: createdBlock.id } };
  };

  const deleteBlock = (blockId: string): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("deleteBlock");
    const target = findBlockInTree(session.document.blocks, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (
      target.siblings === session.document.blocks &&
      target.siblings.length <= 1
    ) {
      return commandNotApplicable("deleteBlock");
    }
    return session.runDocumentCommand("deleteBlock", "local", () => {
      const sourcePosition = findBlockPosition(
        session.editor.state.doc,
        blockId,
      );
      if (sourcePosition === null) return false;
      const sourceNode = session.editor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;
      const $source = session.editor.state.doc.resolve(sourcePosition);
      const removesWholeGroup =
        $source.parent.type.name === "blockGroup" &&
        $source.parent.childCount === 1;
      const transaction = session.editor.state.tr.delete(
        removesWholeGroup ? $source.before() : sourcePosition,
        removesWholeGroup
          ? $source.after()
          : sourcePosition + sourceNode.nodeSize,
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  // spec §5.3 — blockSelection 범위(및 각 블록의 children)를 통째로
  // 삭제한다. deleteBlock(위)의 removesWholeGroup 판정·최상위 유일 블록
  // 가드를 범위로 확장해 재사용한다(DELTA-02) — 범위 안 각 블록을 개별
  // 삭제하지 않고 하나의 transaction.delete로 묶어 undo 1단위를 보장한다
  // (G-EDT-001).
  const deleteSelectedBlocks = (): Result<void, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("deleteSelectedBlocks");
    }
    const selection = session.getBlockSelection();
    if (selection === null) {
      return commandNotApplicable("deleteSelectedBlocks");
    }
    const resolved = resolveBlockSelectionRange(
      session.document.blocks,
      selection,
      "deleteSelectedBlocks",
    );
    if (!resolved.ok) return resolved;
    const { siblings, rangeBlocks } = resolved.value;
    // deleteBlock의 "최상위 유일 블록" 가드(target.siblings.length<=1)를
    // 범위로 확장한다 — 범위가 최상위 문서 전체를 덮으면 빈 최상위 문서가
    // 만들어지므로 거절한다(완료 조건 4).
    if (
      siblings === session.document.blocks &&
      rangeBlocks.length === siblings.length
    ) {
      return commandNotApplicable("deleteSelectedBlocks");
    }
    const firstBlockId = rangeBlocks[0]?.id;
    const lastBlockId = rangeBlocks[rangeBlocks.length - 1]?.id;
    if (firstBlockId === undefined || lastBlockId === undefined) {
      return commandNotApplicable("deleteSelectedBlocks");
    }
    const rangeBlockCount = rangeBlocks.length;
    const result = session.runDocumentCommand(
      "deleteSelectedBlocks",
      "local",
      () => {
        const firstPosition = findBlockPosition(
          session.editor.state.doc,
          firstBlockId,
        );
        if (firstPosition === null) return false;
        const lastPosition = findBlockPosition(
          session.editor.state.doc,
          lastBlockId,
        );
        if (lastPosition === null) return false;
        const lastNode = session.editor.state.doc.nodeAt(lastPosition);
        if (lastNode === null) return false;
        const $first = session.editor.state.doc.resolve(firstPosition);
        // deleteBlock과 같은 판정: 범위가 blockGroup의 전체 자식과
        // 일치하면 blockGroup 노드 자체를 지워 빈 컨테이너가 남지 않게
        // 한다(완료 조건 3). 1이 아니라 rangeBlockCount와 비교하는 점이
        // 단일 블록 버전과 다르다.
        const removesWholeGroup =
          $first.parent.type.name === "blockGroup" &&
          $first.parent.childCount === rangeBlockCount;
        const transaction = session.editor.state.tr.delete(
          removesWholeGroup ? $first.before() : firstPosition,
          removesWholeGroup ? $first.after() : lastPosition + lastNode.nodeSize,
        );
        session.editor.view.dispatch(closeHistory(transaction));
        return true;
      },
    );
    // 삭제 대상 자체가 사라지므로 성공 후 선택 상태를 지운다(완료 조건 5).
    if (result.ok) session.setBlockSelection(null);
    return result;
  };

  const indentBlock = (blockId: string): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("indentBlock");
    if (findBlockInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return session.runDocumentCommand(
      "indentBlock",
      "local",
      () => indentBlockCommand(session.editor, blockId).ok,
    );
  };

  const outdentBlock = (blockId: string): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("outdentBlock");
    if (findBlockInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return session.runDocumentCommand(
      "outdentBlock",
      "local",
      () => outdentBlockCommand(session.editor, blockId).ok,
    );
  };

  const toggleCheckListItemChecked = (
    blockId: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("toggleCheckListItemChecked");
    }
    // runDocumentCommand의 run()은 boolean만 돌려받아 BLOCK_NOT_FOUND와
    // COMMAND_NOT_APPLICABLE을 구분하지 못한다 — indentBlock/outdentBlock과
    // 같은 이유로 모델 트리 조회를 여기서 먼저 해 정확한 오류 코드를 낸다.
    if (findBlockInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return session.runDocumentCommand(
      "toggleCheckListItemChecked",
      "local",
      () => toggleCheckListItemCheckedCommand(session.editor, blockId).ok,
    );
  };

  const toggleHeadingCollapse = (
    blockId: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("toggleHeadingCollapse");
    }
    // runDocumentCommand의 run()은 boolean만 돌려받아 BLOCK_NOT_FOUND와
    // COMMAND_NOT_APPLICABLE을 구분하지 못한다 — toggleCheckListItemChecked와
    // 같은 이유로 모델 트리 조회를 여기서 먼저 해 정확한 오류 코드를 낸다.
    if (findBlockInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return session.runDocumentCommand(
      "toggleHeadingCollapse",
      "local",
      () => toggleHeadingCollapseCommand(session.editor, blockId).ok,
    );
  };

  const toggleListItemCollapse = (
    blockId: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("toggleListItemCollapse");
    }
    if (findBlockInTree(session.document.blocks, blockId) === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    return session.runDocumentCommand(
      "toggleListItemCollapse",
      "local",
      () => toggleListItemCollapseCommand(session.editor, blockId).ok,
    );
  };

  return {
    setText,
    insertParagraphAfter,
    setBlockType,
    moveBlockBefore,
    moveSelectedBlocksBefore,
    selectBlockRange,
    clearBlockSelection,
    duplicateBlock,
    deleteBlock,
    deleteSelectedBlocks,
    indentBlock,
    outdentBlock,
    toggleCheckListItemChecked,
    toggleHeadingCollapse,
    toggleListItemCollapse,
  };
};
