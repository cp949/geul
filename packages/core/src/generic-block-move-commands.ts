import { MAX_NESTING_DEPTH } from "@cp949/geul-model";
import type { Block, Result } from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";

import { findBlockPosition } from "./block-position.js";
import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";
import {
  findBlockDepth,
  findBlockEntryInTree,
  isDescendantOfBlock,
  resolveBlockSelectionRange,
  subtreeHeightOfBlock,
} from "./generic-block-tree-lookup.js";

export const createGenericBlockMoveCommands = (
  session: ProductionEditorSession,
) => {
  // Issue #125 D1~D5 — 하위 트리 인지 이동. 목적지는 (a) 다른 부모의
  // children 목록 안 임의 위치, (b) beforeBlockId===null인 최상위 문서 끝을
  // 모두 지원한다(R2 — null은 항상 최상위 문서 끝이지, 소스의 현재 부모
  // 끝이 아니다). 원본과 그 하위 트리 전체(표 포함)를 하나의 transaction으로
  // 옮긴다 — hasChildren·"같은 부모 형제만" 두 가드를 모두 제거하고, 대신
  // 자기 자손 이동 거절(D2)과 깊이 사전 판정(D3)으로 대체한다.
  const moveBlockBefore = (
    blockId: string,
    beforeBlockId: string | null,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("moveBlockBefore");
    const source = findBlockEntryInTree(session.document.blocks, blockId);
    if (source === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    let targetSiblings: readonly Block[];
    let targetIndex: number;
    let destinationDepth: number;
    if (beforeBlockId === null) {
      // 문서 맨 끝으로 이동 — length/참조 비교만 쓰므로 top-level에
      // CustomBlock이 섞여 있어도(top-level 전용, RD-002-DELTA-01) 안전하다.
      targetSiblings = session.document.blocks as readonly Block[];
      targetIndex = targetSiblings.length;
      destinationDepth = 1;
    } else {
      // D2: beforeBlockId가 소스 자신의 하위 트리 안(자손)이면 mutation 전에
      // 거절한다 — 자기 자신으로의 이동(선행 no-op 판정)과는 다른 가드다.
      if (isDescendantOfBlock(source.block, beforeBlockId)) {
        return commandNotApplicable("moveBlockBefore");
      }
      const target = findBlockEntryInTree(
        session.document.blocks,
        beforeBlockId,
      );
      if (target === null) {
        return {
          ok: false,
          error: { code: "BLOCK_NOT_FOUND", blockId: beforeBlockId },
        };
      }
      targetSiblings = target.siblings;
      targetIndex = target.index;
      // target은 findBlockEntryInTree로 이미 찾았으니 findBlockDepth는 항상
      // 값을 반환한다 — null 분기는 타입 좁히기용 방어일 뿐이다.
      destinationDepth =
        findBlockDepth(session.document.blocks, beforeBlockId, 1) ?? 1;
    }

    if (
      targetSiblings === source.siblings &&
      (targetIndex === source.index || targetIndex === source.index + 1)
    ) {
      return commandNotApplicable("moveBlockBefore");
    }

    // D3: 이동 후 하위 트리 최심부가 MAX_NESTING_DEPTH(64)를 넘으면 mutation
    // 전에 거절한다 — indentBlockCommand의 modelDepthAt+subtreeHeight 사전
    // 판정과 같은 산술을 model 트리 위에서 재사용한다. 새 EditorError 코드를
    // 만들지 않고(범위 밖: 공개 에러 union 변경) indentBlockCommand와 같이
    // COMMAND_NOT_APPLICABLE로 수렴한다.
    if (
      destinationDepth + subtreeHeightOfBlock(source.block) >
      MAX_NESTING_DEPTH
    ) {
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
      // deleteBlock과 같은 판정: 소스가 blockGroup의 유일한 자식이면
      // 소스만 지워서는 "block+"를 위반하는 빈 그룹이 남는다 — 그룹 자체를
      // 지운다. 이전 구현은 hasChildren 가드로 소스가 항상 leaf였고, leaf가
      // 유일한 자식인 경우는 "같은 부모 형제만" 가드가 no-op으로 흡수해
      // 이 분기에 도달할 수 없었다 — cross-parent 이동을 여는 이 변경에서
      // 처음으로 도달 가능해졌다.
      const $source = session.editor.state.doc.resolve(sourcePosition);
      const removesWholeGroup =
        $source.parent.type.name === "blockGroup" &&
        $source.parent.childCount === 1;
      let transaction = session.editor.state.tr.delete(
        removesWholeGroup ? $source.before() : sourcePosition,
        removesWholeGroup
          ? $source.after()
          : sourcePosition + sourceNode.nodeSize,
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
        // R2: null은 소스의 현재 부모가 아니라 항상 최상위 문서 끝이다.
        const lastTopLevelId =
          session.document.blocks[session.document.blocks.length - 1]?.id;
        if (lastTopLevelId === undefined) return false;
        const lastPosition = findBlockPosition(transaction.doc, lastTopLevelId);
        if (lastPosition === null) return false;
        const lastNode = transaction.doc.nodeAt(lastPosition);
        if (lastNode === null) return false;
        insertPosition = lastPosition + lastNode.nodeSize;
      }
      // sourceNode 자체가 이미 하위 트리 전체(blockContainer라면 자신의
      // blockGroup 자식까지)를 담고 있다 — delete+insert 한 번으로 원본과
      // 모든 후손이 함께 옮겨진다(별도 재귀 조립이 필요 없다).
      transaction = transaction.insert(insertPosition, sourceNode);
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  // spec §5.3 — blockSelection 범위(및 그 children)를 같은 부모 형제 목록
  // 안에서만 통째로 이동한다. 이 "같은 부모 형제만" 제약은
  // moveSelectedBlocksBefore 자신의 설계다(DELTA-02) — moveBlockBefore(위)는
  // Issue #125부터 cross-parent 이동을 허용하지만, blockSelection 범위
  // 이동은 이번 변경의 범위 밖이라 그대로 둔다. children 동반 이동은 애초에
  // hasChildren류 가드가 없었다(DELTA-02 트랙-4 확인사항 1, 범위 삭제와 같은
  // 이유). 문서 하나를 여러 트랜잭션으로 쪼개지 않도록 delete → insert를
  // 한 dispatch로 묶는다(G-EDT-001, moveBlockBefore와 같은 이유로 delete
  // 전에 원본 Fragment를 캡처한다 — delete 후에는 위치가 무효화된다).
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
      const target = findBlockEntryInTree(
        session.document.blocks,
        beforeBlockId,
      );
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
    const from = findBlockEntryInTree(session.document.blocks, fromBlockId);
    if (from === null) {
      return {
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: fromBlockId },
      };
    }
    const to = findBlockEntryInTree(session.document.blocks, toBlockId);
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

  return {
    moveBlockBefore,
    moveSelectedBlocksBefore,
    selectBlockRange,
    clearBlockSelection,
  };
};
