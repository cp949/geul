/**
 * 표 셀 색상 팔레트. 저장 포맷이 대문자 `#RRGGBB`만 허용하므로(model의
 * isCanonicalCellColor) 값은 모두 대문자로 둔다. 임의 색 입력 대신 고정
 * 팔레트만 노출해 정규화 UI 없이도 항상 유효한 값을 넘긴다.
 */
export type TableCellColor = { name: string; value: string };

export const TABLE_TEXT_COLORS: TableCellColor[] = [
  { name: "Gray", value: "#5F6368" },
  { name: "Red", value: "#D93025" },
  { name: "Orange", value: "#E8710A" },
  { name: "Yellow", value: "#F9AB00" },
  { name: "Green", value: "#188038" },
  { name: "Blue", value: "#1A73E8" },
  { name: "Purple", value: "#8430CE" },
  { name: "Pink", value: "#D01884" },
];

export const TABLE_BACKGROUND_COLORS: TableCellColor[] = [
  { name: "Gray", value: "#F1F3F4" },
  { name: "Red", value: "#FCE8E6" },
  { name: "Orange", value: "#FEEFE3" },
  { name: "Yellow", value: "#FEF7E0" },
  { name: "Green", value: "#E6F4EA" },
  { name: "Blue", value: "#E8F0FE" },
  { name: "Purple", value: "#F3E8FD" },
  { name: "Pink", value: "#FCE8F3" },
];
