/**
 * parseClipboardTable의 경계 try/catch 계약(Issue #130)을 다룬다 — 파이프라인
 * 내부 어디서든 예상 밖 예외가 나면 DOM 이벤트 밖으로 새는 대신 구조화된
 * NOT_TABULAR(ProseMirror 기본 붙여넣기 폴백)로 변환된다. 파서 seam을
 * 모킹해 예외를 주입하므로 별도 파일로 격리한다(vi.mock은 파일 단위다).
 */
import { describe, expect, it, vi } from "vitest";

import { parseClipboardTable } from "../src/index.js";

// 진짜 파서를 그대로 통과시키되, 지정 문자열이 든 입력에서만 예외를 던져
// "캡·정상 경로가 못 막은 예상 밖 예외"를 재현한다. 전부 던지는 모킹이면
// 아래 정상 경로 테스트가 함께 죽어 경계 catch의 통과 방향을 증명하지
// 못한다.
vi.mock("../src/html/parse-html.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/html/parse-html.js")>();
  return {
    ...original,
    parseHtmlFragment: (html: string) => {
      if (html.includes("INJECTED-FAILURE")) {
        throw new Error("injected unexpected parser failure");
      }
      return original.parseHtmlFragment(html);
    },
  };
});

describe("parseClipboardTable 경계 catch(Issue #130)", () => {
  it("파이프라인 내부의 예상 밖 예외는 새지 않고 NOT_TABULAR로 변환된다", () => {
    const html = "<table><tr><td>INJECTED-FAILURE</td></tr></table>";

    expect(() => parseClipboardTable({ html })).not.toThrow();
    expect(parseClipboardTable({ html })).toEqual({
      ok: false,
      error: { code: "NOT_TABULAR" },
    });
  });

  it("예외가 없는 정상 표 입력은 모킹 통과 상태에서도 그대로 파싱된다", () => {
    const result = parseClipboardTable({
      html: "<table><tr><td>a</td><td>b</td></tr></table>",
    });

    expect(result.ok).toBe(true);
  });
});
