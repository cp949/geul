import type { Result } from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

import { findBlockPosition } from "./block-position.js";
import {
  collectDocumentIdentityIds,
  createDocumentIdAllocator,
} from "./document-id-factory.js";
import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";
import { findBlockEntryInTree } from "./generic-block-tree-lookup.js";
import { cloneBlockSubtreeWithFreshIds } from "./generic-block-clone.js";

export const createGenericBlockDuplicateCommands = (
  session: ProductionEditorSession,
) => {
  // Issue #125 D6~D9, Issue #174 RD-001 — 자식이 있는 블록을 대상으로
  // 호출하면 하위 트리 전체(표가 자식으로 들어있다면 그 column/row/cell
  // id까지, D7)를 복제하고 모든 id를 원본과 겹치지 않게 재귀 재발급한다.
  // 표 자신이 직접 대상인 경우도 같은 D7 분기를 타므로(cloneBlockSubtreeWithFreshIds의
  // table 분기가 column/row/cell id를 전부 새로 발급한다) 더는 거절하지
  // 않는다 — 예전에는 "clone이 표 id 중복을 낳는다"는 우려로 D8에서
  // COMMAND_NOT_APPLICABLE을 반환했으나, 그 우려를 해소하는 처리가 D7에
  // 이미 구현돼 있었다(Issue #174 RD-001).
  const duplicateBlock = (
    blockId: string,
  ): Result<{ blockId: string }, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("duplicateBlock");
    const source = findBlockEntryInTree(session.document.blocks, blockId);
    if (source === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (session.revision >= Number.MAX_SAFE_INTEGER) {
      return commandNotApplicable("duplicateBlock");
    }
    // takeId()는 호출할 때마다 새 유일 id를 하나 내주고 점유 집합에 더한다
    // (createDocumentIdAllocator, document-id-factory.ts) — 재귀 복제 안에서
    // 몇 번을 불러도 서로 충돌하지 않는다. 루트 복제본 id는 기존 계약과
    // 같은 순서로 가장 먼저 소비한다(RangeError 시 mutation 전 실패 유지).
    const takeId = createDocumentIdAllocator(
      session.createId,
      collectDocumentIdentityIds(session.document),
    );
    const duplicateId = takeId();
    const result = session.runDocumentCommand("duplicateBlock", "local", () => {
      const sourcePosition = findBlockPosition(
        session.editor.state.doc,
        blockId,
      );
      if (sourcePosition === null) return false;
      const sourceNode = session.editor.state.doc.nodeAt(sourcePosition);
      if (sourceNode === null) return false;
      const insertPosition = sourcePosition + sourceNode.nodeSize;
      const duplicateNode = cloneBlockSubtreeWithFreshIds(
        sourceNode,
        duplicateId,
        takeId,
      );
      const transaction = session.editor.state.tr.insert(
        insertPosition,
        duplicateNode,
      );
      if (duplicateNode.type.name === "blockContainer") {
        // 캐럿은 항상 복제된 "루트" 블록 자신의 콘텐츠 끝에 놓인다 —
        // 자식까지 포함한 duplicateNode.nodeSize를 쓰면 하위 트리가 있을 때
        // blockGroup 안쪽으로 어긋난다(트랙-6류 회귀). child(0)(루트 자신의
        // 콘텐츠 노드) 크기만으로 위치를 구해 leaf/subtree 모두 같은 공식이
        // 되게 한다.
        const contentNode = duplicateNode.child(0);
        transaction.setSelection(
          TextSelection.create(
            transaction.doc,
            insertPosition + contentNode.nodeSize,
          ),
        );
      } else {
        transaction.setSelection(
          NodeSelection.create(transaction.doc, insertPosition),
        );
      }
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    const after = findBlockEntryInTree(session.document.blocks, blockId);
    const createdBlock =
      after === null ? undefined : after.siblings[after.index + 1];
    return createdBlock === undefined
      ? commandNotApplicable("duplicateBlock")
      : { ok: true, value: { blockId: createdBlock.id } };
  };

  return { duplicateBlock };
};
