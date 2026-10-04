import {
  canonicalizeCodeBlockLanguage,
  isInlineContentBlockType,
  isValidCodeBlockLanguage,
  parseDocument,
} from "@cp949/geul-model";
import type { Result } from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection, TextSelection } from "@tiptap/pm/state";

import {
  evaluateBlockTypeChange,
  evaluateBlockTypesChange,
} from "./block-type-blocker.js";
import type { SetBlockTypeDescriptor } from "./block-type-descriptor.js";
import {
  codeSourceLeafText,
  codeSourceToInline,
  inlineToCodeSource,
} from "./code-block-inline-text.js";
import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

// numberedListItem startNumber가 모델이 받아들이는 값인지 판정한다. null은
// 명시 번호 없음이라 항상 유효하다.
const isValidStartNumber = (startNumber: number | null): boolean =>
  startNumber === null ||
  parseDocument({
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "set-block-type-number-validation",
        type: "numberedListItem",
        content: [],
        startNumber,
      },
    ],
  }).ok;

export const createGenericBlockTypeCommands = (
  session: ProductionEditorSession,
) => {
  const setBlockType = (
    blockId: string,
    blockType: SetBlockTypeDescriptor,
    options?: { clearContent?: boolean },
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("setBlockType");
    const clearContent = options?.clearContent ?? false;
    // 구조적 거절 조건은 질의(getBlockTypeBlocker)와 같은 함수가 판정한다.
    const evaluation = evaluateBlockTypeChange(
      session,
      blockId,
      blockType,
      clearContent,
    );
    if (evaluation.blocker === "NOT_FOUND") {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (evaluation.blocker !== null)
      return commandNotApplicable("setBlockType");
    const { target } = evaluation;
    const currentTypeName = target.node.type.name;
    const currentLevel =
      typeof target.node.attrs.level === "number"
        ? target.node.attrs.level
        : null;
    const currentContentSize = target.node.content.size;
    const changesCodeBlockBoundary =
      currentTypeName === "codeBlock" || blockType.type === "codeBlock";
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
      if (!isValidStartNumber(numberedStartNumber)) {
        return commandNotApplicable("setBlockType");
      }
    }
    const isSameType =
      blockType.type === "heading"
        ? currentTypeName === "heading" && currentLevel === blockType.level
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
        // 비Code → Code는 hardBreak를 개행으로 옮기고, Code → 비Code는 개행을
        // hardBreak로 되돌린다(Issue #226). Code → Code(언어만 변경)는
        // content를 그대로 둔다.
        const { schema } = session.editor;
        const content = clearContent
          ? Fragment.empty
          : currentTypeName === "codeBlock" && blockType.type === "codeBlock"
            ? target.node.content
            : blockType.type === "codeBlock"
              ? inlineToCodeSource(schema, target.node.content)
              : codeSourceToInline(schema, target.node.content);
        // codeBlock→codeBlock(언어만 변경)은 replaceWith가 노드를 통째로
        // 새로 만들어 언급하지 않은 attrs가 schema default로 리셋된다.
        // wrap(Issue #194)과 caption(Issue #244)이 조용히 사라진다.
        // 기존 attrs를 모두 펼쳐 language만 덮어쓴다. 새 attr도 자동 보존된다.
        // 다른 타입에서 codeBlock으로 갓 전환하는 경우는 이전 attrs가 의미
        // 없어 wrap을 null(미설정)로 시작한다.
        const attrs =
          blockType.type === "heading"
            ? { level: blockType.level }
            : blockType.type === "codeBlock"
              ? currentTypeName === "codeBlock"
                ? { ...target.node.attrs, language: codeBlockLanguage }
                : { language: codeBlockLanguage, wrap: null }
              : {};
        const replacement = nodeType.create(attrs, content);
        const transaction = session.editor.state.tr.replaceWith(
          target.position,
          target.position + target.node.nodeSize,
          replacement,
        );
        if (currentTypeName !== blockType.type || clearContent) {
          // replaceWith가 옛 selection을 지우므로 직접 옮긴다. 블록 안
          // selection은 텍스트 offset으로 매핑하고(Issue #223), 블록 밖이거나
          // clearContent면 블록 처음에 둔다. 텍스트 offset은 hardBreak를
          // 개행 하나로 센다. 새 content가 같은 규칙으로 만들어져 PM 위치와
          // 크기가 맞는다(Issue #226).
          const contentStart = target.position + 1;
          const contentEnd = contentStart + currentContentSize;
          const { anchor, head } = session.editor.state.selection;
          const isInsideTarget =
            !clearContent &&
            anchor >= contentStart &&
            anchor <= contentEnd &&
            head >= contentStart &&
            head <= contentEnd;
          const toOffset = (position: number): number =>
            Math.min(
              target.node.textBetween(
                0,
                position - contentStart,
                "",
                codeSourceLeafText,
              ).length,
              content.size,
            );
          transaction.setSelection(
            TextSelection.create(
              transaction.doc,
              isInsideTarget ? contentStart + toOffset(anchor) : contentStart,
              isInsideTarget ? contentStart + toOffset(head) : contentStart,
            ),
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
          ? { level: blockType.level }
          : blockType.type === "numberedListItem"
            ? { startNumber: numberedStartNumber }
            : {};
      transaction = transaction.setNodeMarkup(target.position, nodeType, attrs);
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  // 여러 블록을 한 transaction으로 바꾼다. 위치가 변하지 않는 setNodeMarkup만
  // 쓰므로 codeBlock 경계(content 변환)는 다루지 않는다 — 대상이 codeBlock이면
  // 거절하고, codeBlock인 블록은 건너뛴다. 선택은 PM이 그대로 매핑한다.
  const setBlockTypes = (
    blockIds: readonly string[],
    blockType: SetBlockTypeDescriptor,
  ): Result<void, EditorError> => {
    const evaluation = evaluateBlockTypesChange(session, blockIds, blockType);
    if (evaluation.blocker === "NOT_FOUND") {
      return {
        ok: false,
        error: {
          code: "BLOCK_NOT_FOUND",
          blockId: evaluation.missingBlockId ?? "",
        },
      };
    }
    if (evaluation.blocker !== null)
      return commandNotApplicable("setBlockType");
    const { targets } = evaluation;
    const nodeType = session.editor.schema.nodes[blockType.type];
    if (nodeType === undefined) return commandNotApplicable("setBlockType");
    const isConvertible = (node: ProseMirrorNode): boolean => {
      const currentTypeName = node.type.name;
      if (
        !isInlineContentBlockType(currentTypeName) ||
        currentTypeName === "codeBlock"
      ) {
        return false;
      }
      return blockType.type === "heading"
        ? !(
            currentTypeName === "heading" &&
            node.attrs.level === blockType.level
          )
        : currentTypeName !== blockType.type;
    };
    const convertible = targets.filter((target) => isConvertible(target.node));
    if (convertible.length === 0) return commandNotApplicable("setBlockType");
    const startNumber =
      blockType.type === "numberedListItem"
        ? (blockType.startNumber ?? null)
        : null;
    if (!isValidStartNumber(startNumber)) {
      return commandNotApplicable("setBlockType");
    }
    return session.runDocumentCommand("setBlockType", "local", () => {
      let transaction = session.editor.state.tr;
      convertible.forEach((target, index) => {
        const attrs =
          blockType.type === "heading"
            ? { level: blockType.level }
            : blockType.type === "numberedListItem"
              ? { startNumber: index === 0 ? startNumber : null }
              : {};
        transaction = transaction.setNodeMarkup(
          target.position,
          nodeType,
          attrs,
        );
      });
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  return { setBlockType, setBlockTypes };
};
