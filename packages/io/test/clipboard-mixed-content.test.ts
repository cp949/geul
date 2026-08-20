/**
 * 클립보드 HTML이 표와 다른 콘텐츠를 함께 담았을 때의 판정을 검증한다
 * (spec §4.1, Issue #37). 표가 fragment의 유일한 실질 콘텐츠일 때만 표로
 * 붙이고, 그 판정이 걸리면 TSV 폴백으로 새지 않는다는 계약을 다룬다.
 * `parseClipboardTable`의 나머지 케이스는 `clipboard-table-parser.test.ts`가
 * 다룬다(파일 분할은 Issue #68).
 */
import { describe, expect, it } from "vitest";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";

const TABLE = "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>";

describe("parseClipboardTable 혼합 콘텐츠 판정", () => {
  // <title>은 소스 문서의 head 메타데이터지 사용자가 선택한 본문이 아니다.
  // sanitize가 <title>을 unwrap하면 그 텍스트가 fragment 최상위로 끌려
  // 올라와 "표 밖 실질 텍스트"로 오인되고, 그러면 표 붙여넣기가 통째로
  // 막힌다 — sawTable 때문에 TSV 짝으로도 폴백하지 못한다.
  it("head의 title 텍스트는 표 밖 실질 콘텐츠로 치지 않는다", () => {
    const result = parseClipboardTable({
      html: `<html><head><title>Sheet1</title></head><body>${TABLE}</body></html>`,
      text: "a\tb",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columnCount).toBe(2);
    expect(result.value.rows[0]?.cells[0]?.content).toEqual([{ text: "a" }]);
  });

  it("title이 있어도 표 밖 문단이 있으면 NOT_TABULAR로 흘려보낸다", () => {
    const result = parseClipboardTable({
      html: `<html><head><title>Sheet1</title></head><body><p>intro</p>${TABLE}</body></html>`,
      text: "intro\na\tb",
    });

    expect(result).toEqual({ ok: false, error: { code: "NOT_TABULAR" } });
  });

  // Slack/Notion/Docs는 블록 경계에 제로폭 문자를 흔히 심는다. 눈에 보이지
  // 않는 한 글자 때문에 표 붙여넣기가 막히면 사용자는 원인도 모르고
  // 되돌릴 방법도 없다 — sawTable 때문에 TSV 짝으로도 폴백하지 못한다.
  it("표 밖 제로폭 문자는 실질 콘텐츠로 치지 않는다", () => {
    for (const invisible of [
      "\u200B",
      "\u200D",
      "\u2060",
      "\u00AD",
      "\uFEFF",
    ]) {
      const result = parseClipboardTable({
        html: `<p>${invisible}</p>${TABLE}`,
        text: "a\tb",
      });

      expect(result.ok).toBe(true);
    }
  });

  // Outlook/Gmail HTML 메일은 여백용 빈 <table>을 중첩해 심는다. findDataTable이
  // 가장 안쪽 표를 고르므로, 빈 표를 데이터 표로 집으면 같은 행에 있는 진짜
  // 셀들이 "표 밖 텍스트"가 돼 클립보드 전체가 거절된다.
  it("셀 없는 중첩 표는 건너뛰고 바깥 데이터 표를 고른다", () => {
    const result = parseClipboardTable({
      html:
        "<table><tbody><tr><td><table></table></td>" +
        "<td>a</td><td>b</td></tr></tbody></table>",
      text: "a\tb",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columnCount).toBe(3);
    expect(result.value.rows[0]?.cells[1]?.content).toEqual([{ text: "a" }]);
  });

  // 셀도 <col>도 없는 빈 표는 데이터 표가 아니다 — 표 후보로 쳐서 TSV 짝을
  // 막으면 함께 온 스프레드시트 텍스트까지 잃는다.
  it("빈 표는 표 후보로 치지 않고 TSV 짝으로 폴백한다", () => {
    const result = parseClipboardTable({
      html: "<table></table>",
      text: "a\tb\nc\td",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columnCount).toBe(2);
    expect(result.value.rows).toHaveLength(2);
  });
});
