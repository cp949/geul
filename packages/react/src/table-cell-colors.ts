/**
 * 표 셀 색상 팔레트. 저장 포맷이 대문자 `#RRGGBB`만 허용하므로(model의
 * isCanonicalCellColor) 값은 모두 대문자로 둔다. 임의 색 입력 대신 고정
 * 팔레트만 노출해 정규화 UI 없이도 항상 유효한 값을 넘긴다.
 *
 * spec §8(EXT-009), RD-002-DELTA-05 — `id`는 `Dictionary.color.names`의
 * key와 정확히 일치한다(3개 소비처가 `dictionary.color.names[color.id]`로
 * 표시용 이름을 읽는다). `id`는 저장 형식이 아니라 dictionary 조회 키일
 * 뿐이다 — 실제 저장 값은 `value`(hex)뿐이다.
 */
export type TableCellColorId =
  "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";

export type TableCellColor = { id: TableCellColorId; value: string };

export const TABLE_TEXT_COLORS: TableCellColor[] = [
  { id: "gray", value: "#5F6368" },
  { id: "red", value: "#D93025" },
  { id: "orange", value: "#E8710A" },
  { id: "yellow", value: "#F9AB00" },
  { id: "green", value: "#188038" },
  { id: "blue", value: "#1A73E8" },
  { id: "purple", value: "#8430CE" },
  { id: "pink", value: "#D01884" },
];

export const TABLE_BACKGROUND_COLORS: TableCellColor[] = [
  { id: "gray", value: "#F1F3F4" },
  { id: "red", value: "#FCE8E6" },
  { id: "orange", value: "#FEEFE3" },
  { id: "yellow", value: "#FEF7E0" },
  { id: "green", value: "#E6F4EA" },
  { id: "blue", value: "#E8F0FE" },
  { id: "purple", value: "#F3E8FD" },
  { id: "pink", value: "#FCE8F3" },
];
