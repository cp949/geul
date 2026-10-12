import {
  type Block,
  type Document as BlockDocument,
  type DocumentBlock,
  isKnownBlockType,
  parseDocument,
  type Result,
} from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";

import { findBlockPosition } from "./block-position.js";
import { findBlockInTree, findSiblingContext } from "./block-tree.js";
import {
  insertSiblingsInTree,
  removeBlockNodesFromTree,
  removeBlocksFromTree,
  updateBlockInTree,
} from "./block-tree-edit.js";
import type { PartialBlock } from "./editor-controller-types.js";
import type { EditorError } from "./errors.js";
import {
  carryOverLocalPreviews,
  carryOverLocalPreviewsFromNodes,
  type ClearedLocalPreview,
} from "./media-local-preview-carry-over.js";
import {
  blockToTiptapJson,
  disabledBlockError,
  findDisabledBlock,
} from "./model-to-tiptap.js";
import {
  blockChanges,
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

// 범용 블록 조작 API(spec §3.2, DOC-005/006) 묶음 —
// insertBlocks/updateBlock/replaceBlocks/removeBlocks/moveBlocksUp·Down.
// editor-controller.ts의 createEditor에서 분리했다 — 다른 커맨드 그룹과
// 교차 참조가 없어 session 하나만 받는 독립 팩토리로 뗀다.
export const createBlockCrudCommands = (session: ProductionEditorSession) => {
  // insertBlocks/updateBlock/replaceBlocks/removeBlocks/moveBlocksUp·Down(spec
  // §3.2)은 같은 타입 안에서만 필드를 병합하거나 PartialBlock(위, 알려진
  // 14종 전용)을 다루는 기존 계약이다 — top-level CustomBlock(top-level
  // 전용, RD-002-DELTA-01)을 이 범용 명령의 대상으로 삼는 계약은 아직 없다
  // (등록·렌더·round-trip은 RD-002 후속 DELTA). findBlockInTree 등이 반환한
  // 값이 CustomBlock이면 이 두 헬퍼가 "찾지 못함"과 동일하게 취급해, 이
  // 파일의 기존 BLOCK_NOT_FOUND/COMMAND_NOT_APPLICABLE 판정 경로를 그대로
  // 재사용한다 — getBlock 계열(DOC-004, 아래 인터페이스)만 예외로 CustomBlock을
  // 그대로 반환한다.
  const asKnownBlock = (block: DocumentBlock | undefined): Block | undefined =>
    block !== undefined && isKnownBlockType(block.type)
      ? (block as Block)
      : undefined;
  const asKnownSiblings = (
    context: { siblings: readonly DocumentBlock[]; index: number } | undefined,
  ): { siblings: readonly Block[]; index: number } | undefined => {
    if (context === undefined) return undefined;
    const target = context.siblings[context.index];
    if (target === undefined || !isKnownBlockType(target.type))
      return undefined;
    return {
      siblings: context.siblings as readonly Block[],
      index: context.index,
    };
  };

  // insertBlocks/updateBlock/replaceBlocks(spec §3.2, DOC-005)가 공유하는
  // 후보 문서 검증. 검증 전략은 "새·수정 블록만 격리 검증"이 아니라
  // "현재 문서 전체에 스플라이스한 후보 문서를 통째로 parseDocument"다 —
  // id 유일성과 중첩 깊이는 대상 블록만 봐서는 판정할 수 없다
  // (RD-002-DELTA-01 "## 계획"의 설계 결정). parseDocument 실패는 기존
  // parseSupportedDocument(production-editor-session.ts)와 동일하게
  // EditorError.DOCUMENT_INVALID로 뭉뚱그린다 — DocumentError의 더
  // 세분화된 code(DOCUMENT_LIMIT_EXCEEDED 등)는 message로만 보존한다.
  // parseDocument(model 계층)는 빈 배열을 허용한다 — R0(문서는 항상 1개
  // 이상 블록, modelToTiptap.ts 참고)는 core의 불변식이라 여기서 별도
  // 재확인한다. insertBlocks/updateBlock은 블록 수를 줄이지 않아 이
  // 분기에 도달할 수 없지만, replaceBlocks는 제거 개수가 삽입 개수보다
  // 많을 수 있어 처음으로 도달 가능해진다(RD-002-DELTA-02 "## 계획"의
  // 설계 결정).
  const validateCandidateDocument = (
    candidateBlocks: DocumentBlock[],
    currentDocument: BlockDocument,
  ): Result<BlockDocument, EditorError> => {
    const parsed = parseDocument({
      ...currentDocument,
      blocks: candidateBlocks,
    });
    if (!parsed.ok) {
      return {
        ok: false,
        error: { code: "DOCUMENT_INVALID", message: parsed.error.message },
      };
    }
    if (parsed.value.blocks.length === 0) {
      return {
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          message: "R0 editor documents require at least one block",
        },
      };
    }
    // enabledBlockTypes가 막은 타입은 PM 스키마에 노드가 없다 — 통과시키면
    // 뒤따르는 Fragment.fromJSON이 RangeError를 던진다(Issue #329). 후보
    // 문서 전체를 훑어 중첩 자식 안의 막은 타입도 문서 로드(modelToTiptap)와
    // 같은 코드·메시지로 거절한다. transaction 전 판정이라 문서·undo가 그대로다.
    const disabledBlock = findDisabledBlock(parsed.value.blocks, (type) =>
      session.isBlockTypeEnabled(type),
    );
    if (disabledBlock !== undefined) {
      return { ok: false, error: disabledBlockError(disabledBlock) };
    }
    return parsed;
  };

  // 범용 조작 API(spec §3.2, DOC-005, RD-002-DELTA-01).
  const insertBlocksImpl = (
    blocksToInsert: PartialBlock[],
    referenceBlockId: string,
    placement: "before" | "after" = "before",
  ): Result<Block[], EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("insertBlocks");

    const withIds = blocksToInsert.map(
      (block) => ({ ...block, id: block.id ?? session.createId() }) as Block,
    );
    const currentDocument = session.getDocument();
    const nextBlocks = insertSiblingsInTree(
      currentDocument.blocks,
      referenceBlockId,
      withIds,
      placement,
    );
    if (nextBlocks === null) {
      return {
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: referenceBlockId },
      };
    }

    const validated = validateCandidateDocument(nextBlocks, currentDocument);
    if (!validated.ok) return validated;

    const insertedBlocks = withIds
      .map((block) => findBlockInTree(validated.value.blocks, block.id))
      .filter((block): block is Block => block !== undefined);
    // 도달 불가 방어선 — parseDocument가 성공하면 스플라이스한 블록 전부가
    // 그 결과 트리에 그대로 남아 있어야 한다(id를 지우거나 바꾸는 정규화
    // 규칙이 없다).
    if (insertedBlocks.length !== withIds.length) {
      return commandNotApplicable("insertBlocks");
    }

    const referencePosition = findBlockPosition(
      session.editor.state.doc,
      referenceBlockId,
    );
    const referenceNode =
      referencePosition === null
        ? null
        : session.editor.state.doc.nodeAt(referencePosition);
    if (referencePosition === null || referenceNode === null) {
      return {
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: referenceBlockId },
      };
    }
    const insertPosition =
      placement === "before"
        ? referencePosition
        : referencePosition + referenceNode.nodeSize;
    const fragment = Fragment.fromJSON(
      session.editor.schema,
      insertedBlocks.map(blockToTiptapJson),
    );

    const result = session.runDocumentCommand("insertBlocks", "local", () => {
      const transaction = session.editor.state.tr.insert(
        insertPosition,
        fragment,
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    return { ok: true, value: insertedBlocks };
  };

  // 범용 조작 API(spec §3.2, DOC-005, RD-002-DELTA-02). update.type이
  // 대상 블록의 type과 다르면 COMMAND_NOT_APPLICABLE로 거절한다(RD-002.md
  // "## 결정" 확정 사항) — 같은 타입 안에서 update가 지정한 최상위
  // 필드만 병합한다(스프레드, PartialBlock의 "최상위만 partial" 계약).
  // update.id는 무시한다(RD-002-DELTA-02 "## 계획"의 설계 결정) — 블록은
  // 항상 blockId 인자의 id를 유지한다.
  const updateBlockImpl = (
    blockId: string,
    update: PartialBlock,
  ): Result<Block, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("updateBlock");

    const currentDocument = session.getDocument();
    const target = asKnownBlock(
      findBlockInTree(currentDocument.blocks, blockId),
    );
    if (target === undefined) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (update.type !== target.type) {
      return commandNotApplicable("updateBlock");
    }

    const merged = {
      ...target,
      ...update,
      id: target.id,
      type: target.type,
    } as Block;
    const nextBlocks = updateBlockInTree(
      currentDocument.blocks,
      blockId,
      () => merged,
    );
    if (nextBlocks === null) {
      // 도달 불가 방어선 — findBlockInTree가 이미 같은 트리에서 찾았다.
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }

    const validated = validateCandidateDocument(nextBlocks, currentDocument);
    if (!validated.ok) return validated;

    const updatedBlock = asKnownBlock(
      findBlockInTree(validated.value.blocks, blockId),
    );
    if (updatedBlock === undefined) {
      // 도달 불가 방어선 — insertBlocksImpl과 동일 전제(정규화가 id를
      // 지우거나 바꾸지 않는다).
      return commandNotApplicable("updateBlock");
    }

    const position = findBlockPosition(session.editor.state.doc, blockId);
    const node =
      position === null ? null : session.editor.state.doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    // 로컬 프리뷰(ADR 0015)는 저장 모델에 없는 PM 전용 attrs라 모델에서 만든
    // JSON에는 없다. blockId로 기존 프리뷰를 이어받아 지워지지 않게 한다
    // (Issue #376).
    const baseJson = blockToTiptapJson(updatedBlock);
    // 같은 내용 재적용은 dispatch 전에 거절한다(Issue #377). 그대로 보내면
    // 빈 history 단위가 남아 다음 undo를 삼킨다. node.hasMarkup은 자식을
    // 비교하지 않아 쓰지 않는다 — 노드 전체(attrs·marks·자식)를 비교한다.
    // 비교용 fragment는 프리뷰를 전부 이어받은 것이다 — url과 프리뷰가 함께
    // 심긴 상태도 같은 내용으로 판정해 거절한다(정리 판정을 먼저 하면 프리뷰가
    // 사라진 fragment가 되어 eq가 false가 된다).
    const comparable = Fragment.fromJSON(session.editor.schema, [
      carryOverLocalPreviews(node, baseJson, false).json,
    ]);
    if (comparable.eq(Fragment.from(node))) {
      return commandNotApplicable("updateBlock");
    }
    // dispatch용 fragment. url이 생긴 미디어는 프리뷰를 이어받지 않고
    // 정리한다(setMediaBlockUrl과 같은 판정).
    const { json, cleared } = carryOverLocalPreviews(node, baseJson, true);
    const fragment = Fragment.fromJSON(session.editor.schema, [json]);

    const result = session.runDocumentCommand("updateBlock", "local", () => {
      const transaction = session.editor.state.tr.replaceWith(
        position,
        position + node.nodeSize,
        fragment,
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    // 커밋이 반영된 뒤에만 정리 전 값으로 통지한다(setMediaBlockUrl과 같은 순서).
    for (const { blockId: clearedId, attrs } of cleared) {
      session.notifyLocalPreviewCleared(clearedId, attrs);
    }
    return { ok: true, value: updatedBlock };
  };

  // 범용 조작 API(spec §3.2, DOC-005, RD-002-DELTA-02). blockIdsToRemove[0]이
  // 원래 있던 자리에 blocksToInsert를 삽입하고 blockIdsToRemove 전부(자신의
  // children 서브트리 포함)를 제거한다 — 순서는 "앵커가 아직 트리에 있을
  // 때 그 앞에 삽입 → 이후 blockIdsToRemove 전부(앵커 포함) 제거"다
  // (RD-002-DELTA-02 "## 계획"의 설계 결정, 제거 후에는 앵커 위치를 가리킬
  // 안정적 참조가 없다).
  //
  // 제거는 id가 아니라 원래 있던 노드 기준이다(Issue #386) — 삽입 블록이
  // 제거 대상과 같은 id를 가져도(자식 포함) 지워지지 않고 문서에 남는다.
  // 모델 단계는 현재 문서에서 읽은 객체 참조로, PM 단계는 삽입 전 위치를
  // transaction.mapping으로 옮겨 제거한다. 제거 대상 id가 중복이거나 한
  // 대상이 다른 대상의 서브트리 안에 있으면(조상+자손) transaction 전에
  // COMMAND_NOT_APPLICABLE로 거절한다. 제거하지 않는 id와 삽입 블록이
  // 겹치면 후보 문서 검증이 DOCUMENT_INVALID로 거절한다.
  const replaceBlocksImpl = (
    blockIdsToRemove: string[],
    blocksToInsert: PartialBlock[],
  ): Result<
    { insertedBlocks: Block[]; removedBlocks: Block[] },
    EditorError
  > => {
    if (session.isDestroyed) return commandNotApplicable("replaceBlocks");
    const anchorId = blockIdsToRemove[0];
    if (anchorId === undefined) {
      return commandNotApplicable("replaceBlocks");
    }

    const currentDocument = session.getDocument();
    const removedBlocks: Block[] = [];
    for (const id of blockIdsToRemove) {
      const found = asKnownBlock(findBlockInTree(currentDocument.blocks, id));
      if (found === undefined) {
        return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId: id } };
      }
      removedBlocks.push(found);
    }
    // 중복 id와 조상+자손 동시 제거는 삽입 전에 거절한다(G-EDT-001) — 원래
    // 노드 기준 제거는 이 둘을 스스로 걸러내지 못한다. 서브트리 안에 든
    // 제거 대상은 removeBlockNodesFromTree가 수집하지 않으므로 수집 수가
    // 모자라면 조상+자손이다.
    const removeNodeSet = new Set<DocumentBlock>(removedBlocks);
    if (
      new Set(blockIdsToRemove).size !== blockIdsToRemove.length ||
      removeBlockNodesFromTree(currentDocument.blocks, removeNodeSet).removed
        .length !== removeNodeSet.size
    ) {
      return commandNotApplicable("replaceBlocks");
    }

    const withIds = blocksToInsert.map(
      (block) => ({ ...block, id: block.id ?? session.createId() }) as Block,
    );
    const withInserted = insertSiblingsInTree(
      currentDocument.blocks,
      anchorId,
      withIds,
      "before",
    );
    if (withInserted === null) {
      // 도달 불가 방어선 — 위 루프가 anchorId(blockIdsToRemove[0])의
      // 존재를 이미 확인했다.
      return {
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: anchorId },
      };
    }
    // id가 아니라 원래 노드로 제거한다 — withInserted의 원래 형제·앵커는
    // currentDocument의 객체 그대로다(insertSiblingsInTree는 삽입 레벨 배열과
    // 조상만 새로 만든다, 조상은 위에서 제거 대상이 아님을 확인했다).
    const { blocks: nextBlocks } = removeBlockNodesFromTree(
      withInserted,
      removeNodeSet,
    );

    const validated = validateCandidateDocument(nextBlocks, currentDocument);
    if (!validated.ok) return validated;
    // 후보 문서가 현재 문서와 같으면 dispatch 전에 거절한다 — 내용까지 같은
    // 같은 id 교체가 PM 단계까지 가면 commitDocument가 no-op으로 거절한 뒤에도
    // 빈 undo 단위가 남는다(Issue #377과 같은 증상, G-EDT-001). 판정 기준은
    // commitDocument와 같은 blockChanges다.
    if (blockChanges(currentDocument, validated.value).length === 0) {
      return commandNotApplicable("replaceBlocks");
    }

    const insertedBlocks = withIds
      .map((block) => findBlockInTree(validated.value.blocks, block.id))
      .filter((block): block is Block => block !== undefined);
    if (insertedBlocks.length !== withIds.length) {
      // 도달 불가 방어선 — insertBlocksImpl과 동일 전제.
      return commandNotApplicable("replaceBlocks");
    }

    // 로컬 프리뷰(ADR 0015)는 저장 모델에 없는 PM 전용 attrs라 모델에서 만든
    // JSON에는 없다. 제거 서브트리마다 blockId로 기존 프리뷰를 이어받는다
    // (updateBlock과 같은 규칙, Issue #383). 콜백이 거절되면 통지하지 않는다.
    const cleared: ClearedLocalPreview[] = [];
    const result = session.runDocumentCommand("replaceBlocks", "local", () => {
      // 제거 대상 위치는 삽입 전 문서에서 구한다 — 이 시점에는 id가 유일하다.
      // 삽입 뒤 id로 찾으면 같은 id의 삽입 블록을 집는다(Issue #386).
      const { doc } = session.editor.state;
      const removedPositions: number[] = [];
      const removedNodes: ProseMirrorNode[] = [];
      for (const id of blockIdsToRemove) {
        const removedPosition = findBlockPosition(doc, id);
        const removedNode =
          removedPosition === null ? null : doc.nodeAt(removedPosition);
        if (removedPosition === null || removedNode === null) return false;
        removedPositions.push(removedPosition);
        removedNodes.push(removedNode);
      }
      const anchorPosition = removedPositions[0];
      if (anchorPosition === undefined) return false;
      cleared.length = 0;
      const carried = carryOverLocalPreviewsFromNodes(
        removedNodes,
        insertedBlocks.map(blockToTiptapJson),
        true,
      );
      cleared.push(...carried.cleared);
      const insertedJson = carried.jsons;
      const fragment = Fragment.fromJSON(session.editor.schema, insertedJson);
      let transaction = session.editor.state.tr.insert(
        anchorPosition,
        fragment,
      );

      // blockIdsToRemove 전부를 제거한다. 삽입 전 위치를 transaction.mapping으로
      // 현재 문서 좌표에 옮긴 뒤 그 자리의 노드를 다시 조회한다 — 삽입이
      // 앵커 위치에 들어가므로 기본 assoc(1) 매핑이 원래 노드의 시작을
      // 가리키고, 매 삭제 뒤 매핑이 갱신되어 인자 순서와 무관하다. 조상+자손과
      // 중복 id는 모델 단계가 이미 거절했다(dispatch 전이라 부분 적용 없음).
      for (const [index, removedNode] of removedNodes.entries()) {
        const mappedPosition = transaction.mapping.map(
          removedPositions[index] ?? 0,
        );
        const node = transaction.doc.nodeAt(mappedPosition);
        // 도달 불가 방어선 — 매핑한 자리가 원래 노드가 아니면 거절한다.
        if (node === null || node.attrs.blockId !== removedNode.attrs.blockId) {
          return false;
        }
        // deleteBlock(generic-block-commands.ts)과 동일한 판정 — 대상이
        // blockGroup의 유일한 자식이면 대상만 지워서는 "block+"를 위반하는
        // 빈 그룹이 남는다, 그룹 자체를 지운다.
        const $position = transaction.doc.resolve(mappedPosition);
        const removesWholeGroup =
          $position.parent.type.name === "blockGroup" &&
          $position.parent.childCount === 1;
        transaction = transaction.delete(
          removesWholeGroup ? $position.before() : mappedPosition,
          removesWholeGroup
            ? $position.after()
            : mappedPosition + node.nodeSize,
        );
      }

      // PM 수준 no-op 판정 — 모델은 인접한 같은 서식 run을 합치지 않고 PM은
      // 합치므로 모델 기준 가드를 지나도 PM 문서가 같을 수 있다. dispatch하면
      // commitDocument가 거절해도 selection·undo 단위가 바뀐다(Issue #377과
      // 같은 취지). false 반환은 dispatch 없이 COMMAND_NOT_APPLICABLE이다.
      if (transaction.doc.eq(session.editor.state.doc)) return false;

      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    // 커밋이 반영된 뒤에만 정리 전 값으로 통지한다(updateBlock과 같은 순서).
    for (const { blockId, attrs } of cleared) {
      session.notifyLocalPreviewCleared(blockId, attrs);
    }
    return { ok: true, value: { insertedBlocks, removedBlocks } };
  };

  // 범용 조작 API(spec §3.2, DOC-005, RD-002-DELTA-03). replaceBlocksImpl의
  // "삽입" 절반이 없는 부분집합이다 — blockIds 전부를 자신의 children
  // 서브트리와 함께 제거한다(같은 설계 결정 상속, RD-002-DELTA-02
  // "## 계획"). 신규 트리 유틸리티 없이 removeBlocksFromTree·
  // validateCandidateDocument를 그대로 재사용한다.
  const removeBlocksImpl = (
    blockIds: string[],
  ): Result<Block[], EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("removeBlocks");
    if (blockIds.length === 0) {
      return commandNotApplicable("removeBlocks");
    }

    const currentDocument = session.getDocument();
    const removedBlocks: Block[] = [];
    for (const id of blockIds) {
      const found = asKnownBlock(findBlockInTree(currentDocument.blocks, id));
      if (found === undefined) {
        return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId: id } };
      }
      removedBlocks.push(found);
    }

    const { blocks: nextBlocks } = removeBlocksFromTree(
      currentDocument.blocks,
      new Set(blockIds),
    );
    const validated = validateCandidateDocument(nextBlocks, currentDocument);
    if (!validated.ok) return validated;

    const result = session.runDocumentCommand("removeBlocks", "local", () => {
      let transaction = session.editor.state.tr;
      // replaceBlocksImpl의 제거 루프와 동일 — 인자 순서로 순회하며 매번
      // transaction.doc에서 위치를 다시 조회한다(매 삭제 뒤 남은 블록
      // 위치가 바뀐다). 조상·자손이 함께 들어오면 자손이 이미 사라져
      // findBlockPosition이 null을 반환하고, 명령 전체를 거절한다(dispatch
      // 전이라 부분 적용 없음).
      for (const id of blockIds) {
        const position = findBlockPosition(transaction.doc, id);
        if (position === null) return false;
        const node = transaction.doc.nodeAt(position);
        if (node === null) return false;
        const $position = transaction.doc.resolve(position);
        const removesWholeGroup =
          $position.parent.type.name === "blockGroup" &&
          $position.parent.childCount === 1;
        transaction = transaction.delete(
          removesWholeGroup ? $position.before() : position,
          removesWholeGroup ? $position.after() : position + node.nodeSize,
        );
      }

      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (!result.ok) return result;
    return { ok: true, value: removedBlocks };
  };

  // moveBlocksUp/moveBlocksDown(spec §3.2, DOC-006, RD-002-DELTA-04)이
  // 공유하는 범위 검증. blockIds는 같은 부모의 연속한 형제 범위여야
  // 한다(RD-002-DELTA-04 "## 계획"의 설계 결정, moveSelectedBlocksBefore와
  // 동일 제약) — 인자 순서는 무관하고, 형제 배열 안 인덱스로 정규화해
  // 연속성을 검증한다.
  const resolveMoveRange = (
    blockIds: string[],
    command: string,
  ): Result<
    { siblings: readonly Block[]; startIndex: number; endIndex: number },
    EditorError
  > => {
    if (blockIds.length === 0) return commandNotApplicable(command);

    const currentDocument = session.getDocument();
    let siblings: readonly Block[] | undefined;
    const indices: number[] = [];
    for (const id of blockIds) {
      const context = asKnownSiblings(
        findSiblingContext(currentDocument.blocks, id),
      );
      if (context === undefined) {
        return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId: id } };
      }
      if (siblings === undefined) {
        siblings = context.siblings;
      } else if (context.siblings !== siblings) {
        // 서로 다른 부모의 형제 — "위/아래로 한 칸"의 의미가 성립하지 않는다.
        return commandNotApplicable(command);
      }
      indices.push(context.index);
    }
    if (siblings === undefined) {
      // 도달 불가 방어선 — 위 루프가 최소 1회 실행됐다(blockIds 비어있지 않음).
      return commandNotApplicable(command);
    }

    const sortedIndices = [...new Set(indices)].sort((a, b) => a - b);
    const startIndex = sortedIndices[0];
    const endIndex = sortedIndices[sortedIndices.length - 1];
    if (startIndex === undefined || endIndex === undefined) {
      return commandNotApplicable(command);
    }
    if (sortedIndices.length !== endIndex - startIndex + 1) {
      // 범위 안에 blockIds가 가리키지 않는 형제가 끼어 있다 — 연속하지 않음.
      return commandNotApplicable(command);
    }

    return { ok: true, value: { siblings, startIndex, endIndex } };
  };

  // spec §3.2, DOC-006, RD-002-DELTA-04. 범위 자신은 재조립하지 않고, 그
  // 바로 앞 형제 하나만 delete → 범위 뒤에 insert한다(moveBlockBefore의
  // "delete → transaction.doc에서 위치 재조회 → insert" 기술 재사용,
  // 공개 commands.moveBlockBefore는 호출하지 않는다 — "## 계획"의 설계
  // 결정, beforeBlockId=null의 "항상 최상위 문서 끝" 의미와 충돌한다).
  // 앞 형제를 지워도 범위 자신이 같은 형제 배열에 남아 있어(비어있지
  // 않음) blockGroup이 통째로 비는 경우가 없다 — deleteBlock의
  // removesWholeGroup 판정이 필요 없다.
  const moveBlocksUpImpl = (blockIds: string[]): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("moveBlocksUp");
    const resolved = resolveMoveRange(blockIds, "moveBlocksUp");
    if (!resolved.ok) return resolved;
    const { siblings, startIndex, endIndex } = resolved.value;
    if (startIndex === 0) return commandNotApplicable("moveBlocksUp");

    const precedingBlock = siblings[startIndex - 1];
    const lastRangeBlock = siblings[endIndex];
    if (precedingBlock === undefined || lastRangeBlock === undefined) {
      return commandNotApplicable("moveBlocksUp"); // 도달 불가 방어선
    }

    return session.runDocumentCommand("moveBlocksUp", "local", () => {
      const precedingPosition = findBlockPosition(
        session.editor.state.doc,
        precedingBlock.id,
      );
      if (precedingPosition === null) return false;
      const precedingNode = session.editor.state.doc.nodeAt(precedingPosition);
      if (precedingNode === null) return false;

      const transaction = session.editor.state.tr.delete(
        precedingPosition,
        precedingPosition + precedingNode.nodeSize,
      );
      const lastRangePosition = findBlockPosition(
        transaction.doc,
        lastRangeBlock.id,
      );
      if (lastRangePosition === null) return false;
      const lastRangeNode = transaction.doc.nodeAt(lastRangePosition);
      if (lastRangeNode === null) return false;
      session.editor.view.dispatch(
        closeHistory(
          transaction.insert(
            lastRangePosition + lastRangeNode.nodeSize,
            precedingNode,
          ),
        ),
      );
      return true;
    });
  };

  // moveBlocksUpImpl의 대칭 방향 — 범위 바로 뒤 형제 하나만 delete → 범위
  // 앞에 insert한다.
  const moveBlocksDownImpl = (
    blockIds: string[],
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("moveBlocksDown");
    const resolved = resolveMoveRange(blockIds, "moveBlocksDown");
    if (!resolved.ok) return resolved;
    const { siblings, startIndex, endIndex } = resolved.value;
    if (endIndex === siblings.length - 1) {
      return commandNotApplicable("moveBlocksDown");
    }

    const followingBlock = siblings[endIndex + 1];
    const firstRangeBlock = siblings[startIndex];
    if (followingBlock === undefined || firstRangeBlock === undefined) {
      return commandNotApplicable("moveBlocksDown"); // 도달 불가 방어선
    }

    return session.runDocumentCommand("moveBlocksDown", "local", () => {
      const followingPosition = findBlockPosition(
        session.editor.state.doc,
        followingBlock.id,
      );
      if (followingPosition === null) return false;
      const followingNode = session.editor.state.doc.nodeAt(followingPosition);
      if (followingNode === null) return false;

      const transaction = session.editor.state.tr.delete(
        followingPosition,
        followingPosition + followingNode.nodeSize,
      );
      const firstRangePosition = findBlockPosition(
        transaction.doc,
        firstRangeBlock.id,
      );
      if (firstRangePosition === null) return false;
      session.editor.view.dispatch(
        closeHistory(transaction.insert(firstRangePosition, followingNode)),
      );
      return true;
    });
  };

  return {
    insertBlocks: insertBlocksImpl,
    updateBlock: updateBlockImpl,
    replaceBlocks: replaceBlocksImpl,
    removeBlocks: removeBlocksImpl,
    moveBlocksUp: moveBlocksUpImpl,
    moveBlocksDown: moveBlocksDownImpl,
  };
};
