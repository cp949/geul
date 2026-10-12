import type { Result } from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  findBlockPosition,
  findEditableBlockContent,
  hasSameModelMarkup,
} from "./block-position.js";
import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

export type BlockAttrCommandDeps = Pick<
  ProductionEditorSession,
  "isDestroyed" | "editor" | "runDocumentCommand"
>;

export type BlockAttrCommandSpec = {
  command: string;
  blockId: string;
  // "block": blockContainer(또는 컨테이너로 감싸이지 않는 atom 블록) 자신의
  // attrs를 바꾼다. "content": 컨테이너 안 콘텐츠 노드(codeBlock·callout 등)
  // 자신의 attrs를 바꾼다. 컨테이너로 감싸이지 않는 블록은 두 값이 같은 노드다.
  target: "block" | "content";
  // 대상 노드 종류 가드. false면 unsupported(없으면 COMMAND_NOT_APPLICABLE)로
  // 거절한다. 값 검증보다 먼저 판정한다.
  appliesTo: (node: ProseMirrorNode) => boolean;
  unsupported?: EditorError;
  // 값 검증. 에러를 돌려주면 그대로 거절한다.
  validate?: () => EditorError | null;
  // 바꾼 뒤의 완전한 attrs. 기존 attrs를 스프레드해서 돌려준다 —
  // setNodeMarkup에 부분 attrs를 넘기면 나머지가 schema default로 리셋된다.
  nextAttrs: (attrs: Record<string, unknown>) => Record<string, unknown>;
};

// 블록 하나의 attrs를 확정하는 명령의 공통 골격이다. 순서는 고정이다:
// 파괴 가드 → 대상 찾기(BLOCK_NOT_FOUND) → 종류 가드 → 값 검증 → 같은 값
// 판정 → setNodeMarkup 1회와 closeHistory dispatch.
//
// 같은 값 재적용은 dispatch 전에 거절한다. 그대로 보내면 문서는 그대로인데
// 빈 history 단위가 남아 다음 undo를 삼킨다(Issue #375). 로컬 프리뷰 attrs는
// 저장 모델에 없는 PM 전용 값이라 현재 값으로 고정해 비교한다(Issue #376).
export const runBlockAttrCommand = (
  deps: BlockAttrCommandDeps,
  spec: BlockAttrCommandSpec,
): Result<void, EditorError> => {
  const { command, blockId } = spec;
  if (deps.isDestroyed) return commandNotApplicable(command);

  const { doc } = deps.editor.state;
  let target: { position: number; node: ProseMirrorNode } | null;
  if (spec.target === "content") {
    target = findEditableBlockContent(doc, blockId);
  } else {
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    target = position === null || node === null ? null : { position, node };
  }
  if (target === null) {
    return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
  }

  if (!spec.appliesTo(target.node)) {
    return spec.unsupported === undefined
      ? commandNotApplicable(command)
      : { ok: false, error: spec.unsupported };
  }
  const invalid = spec.validate?.() ?? null;
  if (invalid !== null) return { ok: false, error: invalid };

  const updatedAttrs = spec.nextAttrs(target.node.attrs);
  if (hasSameModelMarkup(target.node, updatedAttrs)) {
    return commandNotApplicable(command);
  }

  const { position } = target;
  return deps.runDocumentCommand(command, "local", () => {
    const transaction = deps.editor.state.tr.setNodeMarkup(
      position,
      undefined,
      updatedAttrs,
    );
    deps.editor.view.dispatch(closeHistory(transaction));
    return true;
  });
};
