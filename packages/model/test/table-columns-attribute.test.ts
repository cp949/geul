/**
 * data-be-columns 속성의 왕복 계약(serializeTableColumns ⇄ parseTableColumns).
 * 이 속성은 클립보드 HTML 등 외부에서 올 수 있으므로, 정상 왕복과 함께
 * 손상된 값을 Result 실패로 접는 경계를 고정한다.
 */
import { describe, expect, it } from "vitest";

import {
  parseTableColumns,
  serializeTableColumns,
  type TableColumn,
} from "../src/index.js";

const twoColumns: TableColumn[] = [
  { id: "col-1", width: 120 },
  { id: "col-2", width: 100 },
];

/**
 * 쓰는 쪽이 넘길 수 있지만 왕복이 깨지는 입력 모음.
 * core의 세 호출부는 Tiptap의 any 속성을 `as TableColumn[]`로 캐스팅해
 * 넘기므로 타입 서명이 지켜진다는 보장이 없다. NaN/Infinity는
 * JSON.stringify가 null로, undefined는 키 누락으로 바꿔 parseTableColumns가
 * 거절하는 문자열이 된다.
 */
const unwritableColumns: Array<[string, TableColumn[]]> = [
  ["열 목록이 아닌 값", null as unknown as TableColumn[]],
  ["항목이 객체가 아님", [null] as unknown as TableColumn[]],
  ["width가 NaN", [{ id: "col-1", width: Number.NaN }]],
  ["width가 Infinity", [{ id: "col-1", width: Number.POSITIVE_INFINITY }]],
  ["width가 없음", [{ id: "col-1" }] as unknown as TableColumn[]],
  ["id가 문자열이 아님", [{ id: 42, width: 120 }] as unknown as TableColumn[]],
];

const invalidAttribute = {
  ok: false,
  error: {
    code: "TABLE_COLUMNS_ATTRIBUTE_INVALID",
    message: expect.any(String),
  },
};

describe("표 열 목록 속성 직렬화", () => {
  it("빈 열 목록을 빈 배열 JSON으로 쓴다", () => {
    expect(serializeTableColumns([])).toBe("[]");
  });

  it("직렬화한 값을 다시 읽으면 같은 열 목록이 나온다", () => {
    expect(parseTableColumns(serializeTableColumns(twoColumns))).toEqual({
      ok: true,
      value: twoColumns,
    });
  });

  it("id와 width 밖의 속성은 쓰면서 버린다", () => {
    const extra = [
      { id: "col-1", width: 120, hidden: true },
    ] as unknown as TableColumn[];

    expect(serializeTableColumns(extra)).toBe('[{"id":"col-1","width":120}]');
  });

  it.each(unwritableColumns)(
    "다시 읽을 수 없는 열 목록(%s)은 빈 배열 JSON으로 쓴다",
    (_label, columns) => {
      expect(serializeTableColumns(columns)).toBe("[]");
    },
  );

  it.each(unwritableColumns)(
    "다시 읽을 수 없는 열 목록(%s)을 써도 예외를 던지지 않는다",
    (_label, columns) => {
      expect(() => serializeTableColumns(columns)).not.toThrow();
    },
  );
});

describe("표 열 목록 속성 왕복", () => {
  it.each([
    ["정상 열 목록", twoColumns],
    ["빈 열 목록", [] as TableColumn[]],
    ...unwritableColumns,
  ])("직렬화 결과는 항상 다시 읽힌다(%s)", (_label, columns) => {
    expect(parseTableColumns(serializeTableColumns(columns)).ok).toBe(true);
  });
});

describe("표 열 목록 속성 파싱", () => {
  it("속성이 없으면 빈 열 목록으로 읽는다", () => {
    expect(parseTableColumns(null)).toEqual({ ok: true, value: [] });
  });

  it("JSON으로 해석되지 않는 값을 거절한다", () => {
    expect(parseTableColumns("[{id: col-1}")).toEqual(invalidAttribute);
  });

  it("최상위가 배열이 아닌 값을 거절한다", () => {
    expect(parseTableColumns('{"id":"col-1","width":120}')).toEqual(
      invalidAttribute,
    );
  });

  it("id가 문자열이 아닌 항목이 하나라도 있으면 전체를 거절한다", () => {
    expect(parseTableColumns('[{"id":42,"width":100}]')).toEqual(
      invalidAttribute,
    );
  });

  it("width가 없는 항목이 하나라도 있으면 전체를 거절한다", () => {
    expect(parseTableColumns('[{"id":"col-1"}]')).toEqual(invalidAttribute);
  });

  it("객체가 아닌 항목을 거절한다", () => {
    expect(parseTableColumns('["col-1"]')).toEqual(invalidAttribute);
  });

  it("거절 메시지가 어긋난 항목의 위치를 가리킨다", () => {
    const parsed = parseTableColumns(
      '[{"id":"col-1","width":120},{"id":42,"width":100}]',
    );

    if (parsed.ok) throw new Error("실패를 기대했다");
    expect(parsed.error.message).toContain("data-be-columns[1]");
  });

  it("id와 width 밖의 속성은 읽으면서 버린다", () => {
    expect(
      parseTableColumns('[{"id":"col-1","width":120,"hidden":true}]'),
    ).toEqual({ ok: true, value: [{ id: "col-1", width: 120 }] });
  });
});
