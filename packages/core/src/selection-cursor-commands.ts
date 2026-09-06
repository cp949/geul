import {
  isInlineContentBlockType,
  type Result,
  type TableBlock,
} from "@cp949/geul-model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

import { findEditableBlockContent } from "./block-position.js";
import { findBlockInTree } from "./block-tree.js";
import type { EditorError } from "./errors.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

// setTextCursorPosition/setSelection(spec §3.2, RD-003-DELTA-01, DOC-007/008)
// 묶음 — blockId를 PM selection 경계로 좁히는 조회(resolveTextCursorTarget)와
// 그 위의 명령 2개. editor-controller.ts의 createEditor에서 분리했다 —
// 다른 커맨드 그룹과 교차 참조가 없어 session 하나만 받는 독립 팩토리로
// 뗀다.
export const createSelectionCursorCommands = (
  session: ProductionEditorSession,
) => {
  // "표의 첫 번째 셀"은 rows[0].cells[0]이다. G-TBL-001(model-to-tiptap.ts)은
  // model→PM 인코딩 시 저장 배열 순서가 논리 열 순서의 권위가 아니라고
  // 경고하지만, 그 반대 방향(PM→model, tiptapToModel)은 항상 PM 문서
  // 물리 순서 그대로 rows[].cells[]를 재구성한다 — 그리고
  // ProductionEditorSession은 매 커밋(초기 로드 포함, `readEditorDocument`)마다
  // session.currentDocument를 PM에서 다시 읽어들인다. 즉 이 함수가 받는
  // tableModel(session.getDocument() 계열에서 파생)은 항상 이미 물리
  // 순서로 정규화돼 있어 columnIndexMap으로 재정렬할 필요가 없다(실측
  // 확인: RD-003-DELTA-01 mutation 검증 — columnIndexMap 기반 탐색을
  // rows[0].cells[0]로 바꿔도 관측 가능한 차이가 없었다). tableNode는
  // tablePosition 위치의 실제 PM table 노드다.
  const firstTableCellRange = (
    tableModel: TableBlock,
    tableNode: ProseMirrorNode,
    tablePosition: number,
  ): { start: number; end: number } | null => {
    const firstRow = tableModel.rows[0];
    if (firstRow === undefined) return null; // 도달 불가 방어선(표는 항상 1행 이상)
    const topLeftCell = firstRow.cells[0];
    if (topLeftCell === undefined) return null; // 도달 불가 방어선(행은 항상 1셀 이상)

    let range: { start: number; end: number } | null = null;
    tableNode.descendants((child, offset) => {
      if (range !== null) return false;
      if (
        child.type.name === "tableCell" &&
        child.attrs.cellId === topLeftCell.id
      ) {
        // descendants의 offset은 tableNode 자기 콘텐츠 시작(진입 토큰
        // 소비 후) 기준 상대 좌표다 — 절대 위치로 바꾸려면 tableNode
        // 진입(+1)까지 더해야 한다(table-commands.ts의 `base = position +
        // 1` 관례와 동일, 그 뒤 셀 콘텐츠 진입에 다시 +1). 즉 콘텐츠 시작 =
        // tablePosition + offset + 2.
        const start = tablePosition + offset + 2;
        range = { start, end: start + child.content.size };
        return false;
      }
      return true;
    });
    return range;
  };

  // setTextCursorPosition(spec §3.2, RD-003-DELTA-01, DOC-007)이 blockId를
  // PM selection 경계로 좁히는 조회. 텍스트 블록(7 nestable + codeBlock)은
  // 콘텐츠 시작/끝 위치 쌍("text"), table은 첫 번째 셀(물리 좌상단)의
  // 시작/끝 위치 쌍("table"), 텍스트 없는 leaf(divider·미디어 4종)는
  // NodeSelection 대상 위치 하나("node")를 돌려준다. setSelectionImpl은
  // 이 중 "text"만 받는다("## 계획"의 설계 결정 — leaf·table은
  // COMMAND_NOT_APPLICABLE).
  type TextCursorTarget =
    | { kind: "text"; start: number; end: number }
    | { kind: "table"; start: number; end: number }
    | { kind: "node"; position: number };

  const resolveTextCursorTarget = (
    blockId: string,
    command: string,
  ): Result<TextCursorTarget, EditorError> => {
    const target = findEditableBlockContent(session.editor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    const { position, node } = target;
    if (isInlineContentBlockType(node.type.name)) {
      return {
        ok: true,
        value: {
          kind: "text",
          start: position + 1,
          end: position + 1 + node.content.size,
        },
      };
    }
    if (node.type.name === "table") {
      const found = findBlockInTree(session.getDocument().blocks, blockId);
      if (found === undefined || found.type !== "table") {
        return commandNotApplicable(command); // 도달 불가 방어선
      }
      // "table"은 KNOWN_BLOCK_TYPES 예약 리터럴이라 customBlockSchema로
      // 라우팅될 수 없다(model schema.ts) — 위 판별로 found는 실제로 항상
      // TableBlock이다. isKnownBlockType과 같은 이유로 이 타입 좁히기가
      // TS에는 안 보여 명시적으로 캐스트한다.
      const tableModel = found as TableBlock;
      const cellRange = firstTableCellRange(tableModel, node, position);
      if (cellRange === null) return commandNotApplicable(command); // 도달 불가 방어선
      return {
        ok: true,
        value: { kind: "table", start: cellRange.start, end: cellRange.end },
      };
    }
    return { ok: true, value: { kind: "node", position } };
  };

  // spec §3.2, RD-003-DELTA-01(DOC-007). 문서(모델 트리)를 바꾸지 않으므로
  // runDocumentCommand를 거치지 않는다(selectBlockRange와 동일 이유 —
  // selection만 바뀌면 blockChanges가 빈 배열이라 runDocumentCommand를
  // 쓰면 항상 COMMAND_NOT_APPLICABLE로 오판된다).
  const setTextCursorPositionImpl = (
    blockId: string,
    placement: "start" | "end" = "start",
  ): Result<void, EditorError> => {
    if (session.isDestroyed) {
      return commandNotApplicable("setTextCursorPosition");
    }
    const resolved = resolveTextCursorTarget(blockId, "setTextCursorPosition");
    if (!resolved.ok) return resolved;
    const target = resolved.value;
    const selection =
      target.kind === "node"
        ? NodeSelection.create(session.editor.state.doc, target.position)
        : TextSelection.create(
            session.editor.state.doc,
            placement === "start" ? target.start : target.end,
          );
    session.editor.view.dispatch(
      session.editor.state.tr.setSelection(selection),
    );
    return { ok: true, value: undefined };
  };

  // spec §3.2, RD-003-DELTA-01(DOC-008). startBlockId/endBlockId 둘 다
  // "text"(순수 텍스트 블록)일 때만 지원한다 — 한쪽이라도 leaf·table이면
  // COMMAND_NOT_APPLICABLE("## 계획"의 설계 결정). anchor는 항상
  // startBlockId 콘텐츠 시작, head는 항상 endBlockId 콘텐츠 끝이다 — 순서를
  // 정규화하지 않는다(같은 결정, PM의 TextSelection.create가 anchor>head도
  // 지원한다).
  const setSelectionImpl = (
    startBlockId: string,
    endBlockId: string,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable("setSelection");
    const start = resolveTextCursorTarget(startBlockId, "setSelection");
    if (!start.ok) return start;
    if (start.value.kind !== "text")
      return commandNotApplicable("setSelection");
    const end = resolveTextCursorTarget(endBlockId, "setSelection");
    if (!end.ok) return end;
    if (end.value.kind !== "text") return commandNotApplicable("setSelection");

    const selection = TextSelection.create(
      session.editor.state.doc,
      start.value.start,
      end.value.end,
    );
    session.editor.view.dispatch(
      session.editor.state.tr.setSelection(selection),
    );
    return { ok: true, value: undefined };
  };

  return {
    setTextCursorPosition: setTextCursorPositionImpl,
    setSelection: setSelectionImpl,
  };
};
