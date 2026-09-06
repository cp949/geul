import type { Result } from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";

import { findBlockPosition } from "./block-position.js";
import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";
import {
  findBlockEntryInTree,
  resolveBlockSelectionRange,
} from "./generic-block-tree-lookup.js";

export const createGenericBlockDeleteCommands = (
  session: ProductionEditorSession,
) => {
  const deleteBlock = (blockId: string): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("deleteBlock");
    const target = findBlockEntryInTree(session.document.blocks, blockId);
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

  return { deleteBlock, deleteSelectedBlocks };
};
