import {
  isCanonicalCellColor,
  isSupportedLinkHref,
  type Result,
} from "@cp949/geul-model";

import { selectionIntersectsCodeBlock } from "./code-block-mark-guard-extension.js";
import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

// selection에 적용되는 inline mark 명령(bold/italic/link/색상/customStyle) 묶음.
// editor-controller.ts의 createEditor에서 분리했다 — 다른 커맨드 그룹과
// 교차 참조가 없어 session 하나만 받는 독립 팩토리로 뗀다(createGenericBlockCommands와
// 동일 패턴, generic-block-commands.ts).
export const createInlineMarkCommands = (session: ProductionEditorSession) => {
  const rejectCodeBlockMark = (): Result<void, EditorError> | null => {
    if (session.isDestroyed) return null;
    const state = session.editor.state;
    return selectionIntersectsCodeBlock(state.doc, state.selection)
      ? { ok: false, error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" } }
      : null;
  };

  const runSelectionCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    const rejected = rejectCodeBlockMark();
    if (rejected !== null) return rejected;
    if (session.editor.state.selection.empty) {
      return commandNotApplicable(command);
    }
    return session.runDocumentCommand(command, "local", run);
  };

  const runApplicableLinkCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    if (
      session.editor.state.selection.empty &&
      !session.editor.isActive("link")
    ) {
      return commandNotApplicable(command);
    }
    return session.runDocumentCommand(command, "local", run);
  };

  const runLinkCommand = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> => {
    const rejected = rejectCodeBlockMark();
    if (rejected !== null) return rejected;
    return runApplicableLinkCommand(command, run);
  };

  // toggleInlineTextColor/toggleInlineBackgroundColor(RD-002 DELTA-01)가
  // 공유하는 본체. setLink와 같은 순서(CodeBlock 가드 → 값 검증)를 따른다.
  // `color`가 `null`이면 검증을 생략하고 해제로 취급한다(setCellColor와
  // 동형, table-grid.ts:720-730). mutation은 Tiptap 코어 제네릭 chain
  // 명령(`toggleMark`/`unsetMark`)만 쓴다 — attrs가 있는 mark도 별도
  // `addCommands()` 없이 이름만으로 동작하고, `toggleMark`의 attrs-aware
  // 활성 판정이 spec의 "같은 값 재적용 시 해제" 토글 의미를 그대로
  // 구현한다.
  const runInlineColorCommand = (
    command: string,
    markName: "textColor" | "backgroundColor",
    color: string | null,
  ): Result<void, EditorError> => {
    const rejected = rejectCodeBlockMark();
    if (rejected !== null) return rejected;
    if (color !== null && !isCanonicalCellColor(color)) {
      return { ok: false, error: { code: "INVALID_COLOR", color } };
    }
    if (session.editor.state.selection.empty) {
      return commandNotApplicable(command);
    }
    return session.runDocumentCommand(command, "local", () =>
      color === null
        ? session.editor.commands.unsetMark(markName)
        : session.editor.commands.toggleMark(markName, { color }),
    );
  };

  // registry(RD-002-DELTA-19)에 등록된 커스텀 스타일을 selection에
  // 적용/해제한다 — runInlineColorCommand와 같은 "같은 값 재적용 시 해제"
  // 의미를 목표로 하지만, Tiptap의 제네릭 toggleMark는 attrs 활성 판정을
  // 얕은 비교로 한다(실측: `props`처럼 값이 객체인 attr은 매 호출마다
  // 새로 만든 리터럴이라 참조가 달라 항상 "비활성"으로 오판되고, 재호출이
  // 항상 재적용으로만 이어져 해제가 전혀 안 된다 — `color`처럼 값이
  // primitive string인 runInlineColorCommand에서는 이 문제가 드러나지
  // 않았다). `editor.getAttributes(type).props`를 직접 읽어 JSON 직렬화로
  // 깊은 비교를 한 뒤 `setMark`/`unsetMark`를 명시적으로 선택한다.
  const toggleCustomStyle = (
    type: string,
    props?: Record<string, string | number | boolean | null>,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("toggleCustomStyle");
    const rejected = rejectCodeBlockMark();
    if (rejected !== null) return rejected;
    if (session.editor.schema.marks[type] === undefined) {
      return {
        ok: false,
        error: { code: "CUSTOM_STYLE_TYPE_NOT_REGISTERED", type },
      };
    }
    if (session.editor.state.selection.empty) {
      return commandNotApplicable("toggleCustomStyle");
    }
    const nextProps = props ?? null;
    const alreadyActive =
      session.editor.isActive(type) &&
      JSON.stringify(session.editor.getAttributes(type).props ?? null) ===
        JSON.stringify(nextProps);
    return session.runDocumentCommand("toggleCustomStyle", "local", () =>
      alreadyActive
        ? session.editor.commands.unsetMark(type)
        : session.editor.commands.setMark(type, { props: nextProps }),
    );
  };

  const toggleBold = (): Result<void, EditorError> =>
    runSelectionCommand("toggleBold", () =>
      session.editor.commands.toggleBold(),
    );
  const toggleItalic = (): Result<void, EditorError> =>
    runSelectionCommand("toggleItalic", () =>
      session.editor.commands.toggleItalic(),
    );
  const toggleUnderline = (): Result<void, EditorError> =>
    runSelectionCommand("toggleUnderline", () =>
      session.editor.commands.toggleUnderline(),
    );
  const toggleStrike = (): Result<void, EditorError> =>
    runSelectionCommand("toggleStrike", () =>
      session.editor.commands.toggleStrike(),
    );
  const toggleCode = (): Result<void, EditorError> =>
    runSelectionCommand("toggleCode", () =>
      session.editor.commands.toggleCode(),
    );
  const setLink = (href: string): Result<void, EditorError> => {
    const rejected = rejectCodeBlockMark();
    if (rejected !== null) return rejected;
    if (!isSupportedLinkHref(href)) {
      return { ok: false, error: { code: "LINK_HREF_REJECTED", href } };
    }
    if (session.editor.isActive("link", { href })) {
      return commandNotApplicable("setLink");
    }
    return runApplicableLinkCommand("setLink", () => {
      const chain = session.editor.chain();
      if (session.editor.state.selection.empty) {
        chain.extendMarkRange("link");
      }
      return chain.setLink({ href }).run();
    });
  };
  const unsetLink = (): Result<void, EditorError> =>
    runLinkCommand("unsetLink", () => {
      const chain = session.editor.chain();
      if (session.editor.state.selection.empty) {
        chain.extendMarkRange("link");
      }
      return chain.unsetLink().run();
    });
  const toggleInlineTextColor = (
    color: string | null,
  ): Result<void, EditorError> =>
    runInlineColorCommand("toggleInlineTextColor", "textColor", color);
  const toggleInlineBackgroundColor = (
    color: string | null,
  ): Result<void, EditorError> =>
    runInlineColorCommand(
      "toggleInlineBackgroundColor",
      "backgroundColor",
      color,
    );

  return {
    toggleBold,
    toggleItalic,
    toggleUnderline,
    toggleStrike,
    toggleCode,
    setLink,
    unsetLink,
    toggleInlineTextColor,
    toggleInlineBackgroundColor,
    toggleCustomStyle,
  };
};
