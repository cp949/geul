import type { IdFactory } from "@cp949/geul-model";
import { type Editor, Extension } from "@tiptap/core";
import { goToNextCell, isInTable, selectedRect } from "@tiptap/pm/tables";

import { insertTableRow } from "./table-commands.js";

// Tab/Shift+Tab 셀 탐색(spec 7.2, TBL-010/TBL-011). 표 밖에서는 아무 일도
// 하지 않고 false를 반환해 브라우저 기본 Tab(포커스 이동)에 맡긴다.
export const goToNextTableCellOrInsertRow = (
  editor: Editor,
  createId: IdFactory,
): boolean => {
  const { state } = editor;
  if (!isInTable(state)) return false;

  if (goToNextCell(1)(state, editor.view.dispatch)) return true;

  // 마지막 셀의 Tab: 새 행을 추가하고 그 첫 셀로 캐럿을 옮긴다(TBL-011).
  // insertTableRow가 명령 정의 자체에 selectCellId(새 행 0열 셀)를
  // 내장하므로(G-TBL-001) 이 caller는 별도 콜백을 넘기지 않는다.
  const rect = selectedRect(state);
  const tableBlockId = rect.table.attrs.blockId;
  if (typeof tableBlockId !== "string" || tableBlockId.length === 0) {
    return false;
  }
  const atIndex = rect.map.height;
  const result = insertTableRow(editor, tableBlockId, atIndex, createId);
  return result.ok;
};

export const goToPreviousTableCell = (editor: Editor): boolean => {
  const { state } = editor;
  if (!isInTable(state)) return false;
  goToNextCell(-1)(state, editor.view.dispatch);
  // 첫 셀에서는 이동할 곳이 없어도(dispatch가 일어나지 않아도) 표 밖으로
  // 포커스가 빠지지 않게 소비한다.
  return true;
};

export type TableKeyboardNavigationOptions = {
  createId: IdFactory;
};

export const TableKeyboardNavigationExtension =
  Extension.create<TableKeyboardNavigationOptions>({
    name: "tableKeyboardNavigation",

    addOptions() {
      return {
        createId: () => {
          throw new Error(
            "TableKeyboardNavigationExtension requires a createId option",
          );
        },
      };
    },

    addKeyboardShortcuts() {
      return {
        Tab: () =>
          goToNextTableCellOrInsertRow(this.editor, this.options.createId),
        "Shift-Tab": () => goToPreviousTableCell(this.editor),
      };
    },
  });
