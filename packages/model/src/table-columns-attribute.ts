/**
 * 표 열 목록을 DOM 투영 속성(data-be-columns) 문자열로 쓰고 다시 읽는
 * 왕복 계약. 쓰는 쪽(core NodeView·renderHTML)과 읽는 쪽(core parseHTML,
 * react 핸들 geometry)이 서로 다른 방어 수준의 사본을 갖지 못하도록
 * 두 방향을 한 파일에 묶는다(Issue #75).
 */
import type { Result } from "./result.js";
import type { TableColumn } from "./types.js";

export type TableColumnsAttributeError = {
  code: "TABLE_COLUMNS_ATTRIBUTE_INVALID";
  message: string;
};

const invalid = (
  message: string,
): Result<never, TableColumnsAttributeError> => ({
  ok: false,
  error: { code: "TABLE_COLUMNS_ATTRIBUTE_INVALID", message },
});

const isTableColumn = (value: unknown): value is TableColumn => {
  if (typeof value !== "object" || value === null) return false;
  const { id, width } = value as { id?: unknown; width?: unknown };
  // JSON.stringify는 NaN과 Infinity를 null로 바꾸므로 여기서 걸러야
  // parseTableColumns가 거절하는 문자열이 나오지 않는다.
  return (
    typeof id === "string" &&
    typeof width === "number" &&
    Number.isFinite(width)
  );
};

/**
 * 쓰는 쪽 세 곳(core의 NodeView·renderHTML)은 Tiptap의 `any` 속성을
 * `as TableColumn[]`로 캐스팅해 넘기므로 타입 서명이 지켜진다는 보장이
 * 없다. 캐스팅이 거짓이면 map이 NodeView update 안에서 예외를 던지고,
 * 예외가 안 나더라도 JSON.stringify가 NaN·Infinity를 null로, undefined를
 * 키 누락으로 바꿔 parseTableColumns가 거절하는 문자열이 나온다 — 왕복이
 * 깨진다. 따라서 읽는 쪽과 같은 전부-아니면-전무 규칙을 쓰는 쪽에도
 * 적용해 해석 불가는 빈 열 목록으로 쓴다. 항목을 골라 버리지 않는 이유는
 * 읽는 쪽과 같다(G-TBL-001: 열 순서·개수의 권위).
 *
 * 불변식: parseTableColumns(serializeTableColumns(x))는 항상 ok다.
 */
export const serializeTableColumns = (columns: TableColumn[]): string => {
  if (!Array.isArray(columns) || !columns.every(isTableColumn)) return "[]";
  return JSON.stringify(columns.map(({ id, width }) => ({ id, width })));
};

/**
 * 속성 부재(null)는 실패가 아니라 빈 열 목록이다 — 외부 HTML의 표에는
 * 이 속성이 애초에 없다. 실패는 "값이 있는데 해석할 수 없다"로 좁힌다.
 *
 * 어긋난 항목을 걸러내고 나머지를 통과시키지 않는다. 이 속성은 열
 * 순서·개수의 권위이므로(G-TBL-001) 항목을 조용히 버리면 권위 값이 실제
 * 열과 어긋난 채 통과한다.
 */
export const parseTableColumns = (
  raw: string | null,
): Result<TableColumn[], TableColumnsAttributeError> => {
  if (raw === null) return { ok: true, value: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return invalid("data-be-columns is not valid JSON");
  }

  if (!Array.isArray(parsed)) {
    return invalid("data-be-columns must be a JSON array");
  }

  const columns: TableColumn[] = [];
  for (const [index, entry] of parsed.entries()) {
    if (typeof entry !== "object" || entry === null) {
      return invalid(`data-be-columns[${index}] must be an object`);
    }
    const { id, width } = entry as { id?: unknown; width?: unknown };
    if (typeof id !== "string" || typeof width !== "number") {
      return invalid(
        `data-be-columns[${index}] must have a string id and a number width`,
      );
    }
    columns.push({ id, width });
  }

  return { ok: true, value: columns };
};
