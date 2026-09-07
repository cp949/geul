import {
  GripHorizontal,
  GripVertical,
  IndentDecrease,
  IndentIncrease,
  Plus,
} from "lucide-react";

import { iconProps } from "./icon-props.js";

// 핸들은 드래그(재정렬)와 클릭(행/열 메뉴) 두 동작을 갖는다 — 라벨이
// 한쪽만 안내하면 나머지 동작의 발견성을 가린다(block-side-menu와 같은 규칙).
export const rowHandleLabel = "Drag to reorder row, click for options";
export const columnHandleLabel = "Drag to reorder column, click for options";
export const addRowLabel = "Add row";
export const addColumnLabel = "Add column";
// 표를 대상화할 팝업 메뉴는 두지 않는다 — block-side-menu.tsx의 gutter가
// <table>을 hover 대상에서 제외해(entitySelector ":not(table)") 그 블록
// 메뉴가 표에 절대 열리지 않으므로, 직접 IconButton 2개가 표의 유일한
// Indent/Outdent 진입점이다(01-계획.md "결정", Issue #126).
export const indentTableLabel = "Indent table";
export const outdentTableLabel = "Outdent table";

export const rowHandleIcon = <GripVertical {...iconProps} />;
export const columnHandleIcon = <GripHorizontal {...iconProps} />;
export const addIcon = <Plus {...iconProps} />;
export const indentTableIcon = <IndentIncrease {...iconProps} />;
export const outdentTableIcon = <IndentDecrease {...iconProps} />;

// touch-action: none — 터치 드래그를 브라우저 스크롤 제스처에 뺏기면
// pointercancel로 드래그가 중단된다(setPointerCapture는 이를 막지 못한다).
export const handleButtonClassName = "geul-table-handle";
export const expandButtonClassName = "geul-table-expand-button";
// addRow/addColumn(expandButtonClassName)과 같은 "직접 클릭 버튼" 모양을
// 쓰되, 재정렬(cursor: grab)이 아니라 1회성 액션이라 별도 클래스로 둔다.
export const nestingButtonClassName = "geul-table-nesting-button";

// 행/열 핸들(표 바깥 24px)과 빠른 확장 버튼(표 바깥 4~24px)을 포함하는
// hover 유지 여백. 이 여백 없이 hover를 즉시 해제하면 포인터가 표에서
// 핸들로 이동하는 도중 핸들이 언마운트된다.
export const HANDLE_HOVER_MARGIN = 28;

// useDismissOnOutsideOrEscape에 넘기는 allow-list. 모듈 스코프 상수로 둔다 —
// 매 렌더 새 배열을 넘기면 그 훅의 effect가 리스너를 매 렌더 떼었다 다시 붙인다.
export const TABLE_MENU_DISMISS_ALLOW_SELECTORS = [
  "[data-be-table-menu]",
  "[data-be-table-row-handle]",
  "[data-be-table-column-handle]",
] as const;

// usePointerHoverTarget에 넘기는 ignore-list. 자기 자신의 오버레이(핸들·
// 리사이즈 스트립·확장 버튼·메뉴) 위에서는 hover 대상을 다시 판정하지
// 않는다. 모듈 스코프 상수로 두는 이유는 위와 같다.
export const TABLE_HOVER_IGNORE_SELECTORS = [
  "[data-be-table-row-handle]",
  "[data-be-table-column-handle]",
  "[data-be-table-resize-handle]",
  "[data-be-table-expand-row]",
  "[data-be-table-expand-column]",
  "[data-be-table-menu]",
  "[data-be-table-indent]",
  "[data-be-table-outdent]",
] as const;
