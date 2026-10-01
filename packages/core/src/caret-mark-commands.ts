import { isCanonicalCellColor, type Result } from "@cp949/geul-model";

import { selectionIntersectsCodeBlock } from "./code-block-mark-guard-extension.js";
import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

// 접힌 캐럿에서 stored mark를 바꾸는 명령 3개(Issue #218, UI-017 spec §3).
// 문서를 바꾸지 않으므로 session.runDocumentCommand를 거치지 않는다.
// revision, onChange, undo 스택, onBeforeChange에 닿지 않는다.
// 성공한 transaction은 session의 subscribe 통지 경로가 알린다.
// inline-mark-commands.ts의 선택 영역 명령과 독립이다. 그 파일을 import하지
// 않고 codeBlock 판정(4줄)을 여기에 따로 둔다(ADR-0011 의존 방향).
// toggleCaretMark가 받는 mark 5종이다. 타입이 막는 값을 JS 호출자가 넘겨도
// 런타임에서 거절하려고 값 목록을 따로 둔다.
const CARET_MARK_TYPES: readonly string[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
];

export const createCaretMarkCommands = (session: ProductionEditorSession) => {
  // 세 명령의 공통 판정이다. 순서는 파괴 → 범위 선택 → codeBlock이다.
  // 범위 선택이 codeBlock과 겹쳐도 COMMAND_NOT_APPLICABLE이 우선한다.
  // 툴바가 이 코드를 보고 기존 선택 영역 명령으로 넘어가기 때문이다.
  const rejectUnlessCaret = (
    command: string,
  ): Result<void, EditorError> | null => {
    if (session.isDestroyed) return commandNotApplicable(command);
    const state = session.editor.state;
    if (!state.selection.empty) return commandNotApplicable(command);
    return selectionIntersectsCodeBlock(state.doc, state.selection)
      ? { ok: false, error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" } }
      : null;
  };

  // Tiptap 명령이 false를 돌려주면 적용되지 않은 것이다.
  const applyStoredMark = (
    command: string,
    run: () => boolean,
  ): Result<void, EditorError> =>
    run() ? { ok: true, value: undefined } : commandNotApplicable(command);

  const toggleCaretMark = (
    type: "bold" | "italic" | "underline" | "strike" | "code",
  ): Result<void, EditorError> => {
    if (!CARET_MARK_TYPES.includes(type)) {
      return commandNotApplicable("toggleCaretMark");
    }
    const rejected = rejectUnlessCaret("toggleCaretMark");
    if (rejected !== null) return rejected;
    return applyStoredMark("toggleCaretMark", () =>
      session.editor.commands.toggleMark(type),
    );
  };

  // 텍스트 색과 배경색이 공유하는 본체다. markName마다 stored mark가
  // 따로라 한쪽 변경이 다른 쪽을 지우지 않는다.
  // `color`가 null이면 해제다. 해제할 색이 캐럿 위치에 없으면 변경이 없으므로
  // COMMAND_NOT_APPLICABLE이다. 값이 있으면 toggleMark가 같은 값 재호출은
  // 해제, 다른 값은 교체로 처리한다.
  const toggleCaretColor = (
    command: string,
    markName: "textColor" | "backgroundColor",
    color: string | null,
  ): Result<void, EditorError> => {
    const rejected = rejectUnlessCaret(command);
    if (rejected !== null) return rejected;
    if (color !== null && !isCanonicalCellColor(color)) {
      return { ok: false, error: { code: "INVALID_COLOR", color } };
    }
    if (color === null) {
      if (!session.editor.isActive(markName)) {
        return commandNotApplicable(command);
      }
      return applyStoredMark(command, () =>
        session.editor.commands.unsetMark(markName),
      );
    }
    return applyStoredMark(command, () =>
      session.editor.commands.toggleMark(markName, { color }),
    );
  };

  const toggleCaretTextColor = (
    color: string | null,
  ): Result<void, EditorError> =>
    toggleCaretColor("toggleCaretTextColor", "textColor", color);
  const toggleCaretBackgroundColor = (
    color: string | null,
  ): Result<void, EditorError> =>
    toggleCaretColor("toggleCaretBackgroundColor", "backgroundColor", color);

  return { toggleCaretMark, toggleCaretTextColor, toggleCaretBackgroundColor };
};
