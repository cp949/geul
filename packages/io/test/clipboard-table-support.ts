/**
 * `clipboard-table-parser-*.test.ts` 세 파일이 공유하는 단언 헬퍼를 소유한다.
 * 세 파일 모두 표 하나짜리 성공 결과에서 TabularData를 꺼내야 하므로 이
 * 모듈이 그 꺼내는 방법을 단독으로 소유한다.
 */
import { expect } from "vitest";
import type { ClipboardContent } from "../src/clipboard/clipboard-content.js";
import type { TabularData } from "../src/clipboard/tabular-data.js";
import type { ClipboardParseError } from "../src/errors.js";
import type { Result } from "../src/result.js";

/**
 * 시퀀스가 표 하나뿐인 성공 결과에서 그 TabularData만 꺼낸다. 표만 있는
 * 클립보드의 반환 타입이 [{type:"table", data}] 1개짜리 배열로 바뀌었으므로
 * (Issue #71), 기존처럼 result.value.columnCount로 바로 접근할 수 없다.
 */
export const expectSingleTable = (
  result: Result<ClipboardContent, ClipboardParseError>,
): TabularData => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  expect(result.value).toHaveLength(1);
  const [block] = result.value;
  expect(block?.type).toBe("table");
  if (block?.type !== "table") throw new Error("unreachable");
  return block.data;
};
