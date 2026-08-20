import type { EditorError } from "@cp949/geul-core";

/**
 * 표 명령(`editor.commands.*Table*` / `*TableCell*`)이 실패했을 때 사용자에게
 * 보여줄 문구. TableHandleMenu, TableCellFormatMenu, TableSelectionToolbar가
 * 공유한다(Issue #66) — 이 컴포넌트들이 실제로 만들 수 있는 실패 코드만
 * 구체적 문구로 옮긴다. 나머지는 FALLBACK_TABLE_COMMAND_ERROR_MESSAGE로
 * 묶는다(발생 가능한 모든 EditorError 코드를 나열할 필요는 없다).
 */
export const TABLE_COMMAND_ERROR_MESSAGES: Partial<
  Record<EditorError["code"], string>
> = {
  LAST_ROW: "Can't delete the last row",
  LAST_COLUMN: "Can't delete the last column",
  CELL_NOT_FOUND: "Cell no longer exists",
  INVALID_COLOR: "Unsupported color",
  INVALID_ALIGN: "Unsupported alignment",
  NOT_RECTANGULAR: "Selection isn't rectangular",
};

export const FALLBACK_TABLE_COMMAND_ERROR_MESSAGE = "Action failed";
