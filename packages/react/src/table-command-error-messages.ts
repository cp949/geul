import type { EditorError } from "@cp949/geul-core";

/**
 * 표 명령(`editor.commands.*Table*` / `*TableCell*`)이 실패했을 때 사용자에게
 * 보여줄 문구. TableHandleMenu, TableCellFormatMenu, TableSelectionToolbar가
 * 공유한다(Issue #66) — 이 컴포넌트들이 실제로 만들 수 있는 실패 코드만
 * 구체적 문구로 옮긴다. 나머지는 FALLBACK_ERROR_MESSAGE로 묶는다(발생
 * 가능한 모든 EditorError 코드를 나열할 필요는 없다).
 *
 * 특히 COMMAND_NOT_APPLICABLE은 일부러 폴백에 남긴다 — spec §11.3이
 * "현재 상태에서 적용 불가능한 모든 명령이 공유"한다고 정의한 일반 코드다.
 * runDocumentCommand가 editor destroy, PM 명령의 false 반환, revision 커밋
 * 거절, mergeTableCells의 selection 불일치 가드에 모두 이 코드를 붙이므로
 * 구체적 문구를 달면 대부분의 경로에서 틀린 설명이 된다.
 */
const ERROR_MESSAGES: Partial<Record<EditorError["code"], string>> = {
  LAST_ROW: "Can't delete the last row",
  LAST_COLUMN: "Can't delete the last column",
  CELL_NOT_FOUND: "Cell no longer exists",
  INVALID_COLOR: "Unsupported color",
  INVALID_ALIGN: "Unsupported alignment",
  NOT_RECTANGULAR: "Selection isn't rectangular",
};

const FALLBACK_ERROR_MESSAGE = "Action failed";

/**
 * actionError에 대응하는 표시 문구. 조회와 폴백을 여기서 끝낸다 — 세
 * 컴포넌트가 같은 `MESSAGES[code] ?? FALLBACK` 식을 복제하면 새 코드를
 * 추가할 때 일부만 고쳐도 조용히 통과한다.
 */
export const tableCommandErrorMessage = (error: EditorError): string =>
  ERROR_MESSAGES[error.code] ?? FALLBACK_ERROR_MESSAGE;
