import {
  Grip,
  GripHorizontal,
  GripVertical,
  IndentDecrease,
  IndentIncrease,
  Plus,
} from "lucide-react";

import { iconProps } from "./icon-props.js";

// spec §8(EXT-009), RD-002-DELTA-08 — 라벨 문구는 core Dictionary.handle이
// 소유한다(react가 useDictionary()로 읽는다). 핸들은 드래그(재정렬)와
// 클릭(행/열 메뉴) 두 동작을 갖는다 — 라벨이 한쪽만 안내하면 나머지 동작의
// 발견성을 가린다(block-side-menu와 같은 규칙). 표를 대상화할 팝업 메뉴는
// 두지 않는다 — block-side-menu.tsx의 gutter가 <table>을 hover 대상에서
// 제외해(entitySelector ":not(table)") 그 블록 메뉴가 표에 절대 열리지
// 않으므로, 표 그립 버튼(아래, Issue #174 RD-002)이 표의 유일한 메뉴
// 진입점이다.
export const rowHandleIcon = <GripVertical {...iconProps} />;
export const columnHandleIcon = <GripHorizontal {...iconProps} />;
export const addIcon = <Plus {...iconProps} />;
export const indentTableIcon = <IndentIncrease {...iconProps} />;
export const outdentTableIcon = <IndentDecrease {...iconProps} />;
// Issue #174 RD-002 — 표 코너의 "표 그립 버튼"(CONTEXT.md). 클릭하면
// selectBlockRange(tableId, tableId)로 표를 선택하고 TableGripMenu를
// 연다(RD-003). Issue #149의 Select table 버튼(MousePointerSquareDashed)을
// 대체한다 — Grip(6-dot, lucide-react 1.31.0)은 행/열 grip(GripVertical/
// GripHorizontal, 2-dot 막대)과 형태로 구분되면서도 같은 "grip" 계열이라
// "이것도 grip이다(클릭하면 메뉴가 열린다)"는 인지를 돕는다.
export const tableGripIcon = <Grip {...iconProps} />;

// touch-action: none — 터치 드래그를 브라우저 스크롤 제스처에 뺏기면
// pointercancel로 드래그가 중단된다(setPointerCapture는 이를 막지 못한다).
export const handleButtonClassName = "geul-table-handle";
export const expandButtonClassName = "geul-table-expand-button";
// addRow/addColumn(expandButtonClassName)과 같은 "직접 클릭 버튼" 모양을
// 쓰되, 재정렬(cursor: grab)이 아니라 1회성 액션이라 별도 클래스로 둔다.
export const nestingButtonClassName = "geul-table-nesting-button";

// 행/열 그립 공통(Notion 참고, 사용자 요청·네이밍). 3단계다: ① 평소
// 완전히 숨김. ② "활성 바" — 커서가 있거나 마우스가 그 행/열 위 어디든
// hover 중이면(table-handles.tsx가 selection·hoverRowId/hoverColumnId에서
// 계산하는 activeRowIds/activeColumnIds, 커서·hover가 서로 다른 행/열을
// 가리킬 수 있어 최대 2개) 얇은 line으로 뜬다. ③ "grip 버튼" — 그 활성
// 바 위에 마우스가 다시 hover(또는 키보드 focus)하면 실제 pill 버튼으로
// 펼쳐진다(재정렬 드래그·클릭 메뉴가 이 상태에서 동작한다). 시각 바보다
// hit box가 훨씬 커야 "정확히 바 위"가 아니라 "근처"만 가리켜도 반응한다
// — 그래서 두 클래스로 나눈다: hit box(이 자체는 투명, hover 판정만
// 담당)와 그 안의 실제 버튼(handleButtonClassName과 함께 붙는다). 행은
// 열의 축을 90도 돌린 거울상이다 — 열은 top/height, 행은 left/width가
// ②③ 두 자리를 오간다(table-handle-overlays.tsx, _table-handles.scss
// 참고).
export const rowHandleHitClassName = "geul-table-row-handle-hit";
export const rowHandleBarClassName = "geul-table-row-handle-bar";
export const columnHandleHitClassName = "geul-table-column-handle-hit";
export const columnHandleBarClassName = "geul-table-column-handle-bar";

// 행/열 핸들(표 바깥 24px)과 빠른 확장 버튼(표 바깥 4~24px)을 포함하는
// hover 유지 여백. 이 여백 없이 hover를 즉시 해제하면 포인터가 표에서
// 핸들로 이동하는 도중 핸들이 언마운트된다.
export const HANDLE_HOVER_MARGIN = 28;

// 메뉴 패널 루트(table-handle-menu.tsx)에 붙는 안정 셀렉터. 아래 두 배열과
// table-handles.tsx의 초점 판정(Issue #65 항목4)이 모두 이 문자열을
// 공유한다 — 세 번째 사용처를 리터럴로 또 추가하지 않는다.
export const TABLE_MENU_SELECTOR = "[data-geul-table-menu]";
// Issue #174 RD-003 — 표 그립 메뉴(table-grip-menu.tsx) 패널 루트. 행/열
// grip 메뉴(TABLE_MENU_SELECTOR)와 별도 상태(tableGripMenuTableId)로
// 관리해 독립된 셀렉터를 쓴다.
export const TABLE_GRIP_MENU_SELECTOR = "[data-geul-table-grip-menu]";

// useDismissOnOutsideOrEscape에 넘기는 allow-list. 모듈 스코프 상수로 둔다 —
// 매 렌더 새 배열을 넘기면 그 훅의 effect가 리스너를 매 렌더 떼었다 다시 붙인다.
export const TABLE_MENU_DISMISS_ALLOW_SELECTORS = [
  TABLE_MENU_SELECTOR,
  "[data-geul-table-row-handle]",
  "[data-geul-table-column-handle]",
] as const;
// Issue #174 RD-003 — 표 그립 메뉴 전용 allow-list. 그립 버튼 자신을
// 눌러 메뉴를 토글하는 클릭이 "바깥 클릭"으로 오판되지 않게 한다(행/열
// grip 메뉴의 handle 셀렉터와 같은 이유).
export const TABLE_GRIP_MENU_DISMISS_ALLOW_SELECTORS = [
  TABLE_GRIP_MENU_SELECTOR,
  "[data-geul-table-grip]",
] as const;

// usePointerHoverTarget에 넘기는 ignore-list. 자기 자신의 오버레이(핸들·
// 리사이즈 스트립·확장 버튼·메뉴) 위에서는 hover 대상을 다시 판정하지
// 않는다. 모듈 스코프 상수로 두는 이유는 위와 같다.
export const TABLE_HOVER_IGNORE_SELECTORS = [
  "[data-geul-table-row-handle]",
  "[data-geul-table-row-handle-hit]",
  "[data-geul-table-column-handle]",
  "[data-geul-table-column-handle-hit]",
  "[data-geul-table-resize-handle]",
  "[data-geul-table-expand-row]",
  "[data-geul-table-expand-column]",
  TABLE_MENU_SELECTOR,
  TABLE_GRIP_MENU_SELECTOR,
  "[data-geul-table-indent]",
  "[data-geul-table-outdent]",
  "[data-geul-table-grip]",
  "[data-geul-table-quick-insert]",
] as const;
