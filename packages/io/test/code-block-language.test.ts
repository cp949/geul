/**
 * `selectCodeBlockLanguage`가 `pre`의 language 후보를 `importHtml`과 같은 규칙으로 고르는지 검증한다(Issue #351).
 *
 * - `importHtml`과 클립보드 파서가 이 함수를 공유한다.
 * - 후보 우선순위: 첫 직계 `code`의 `data-language`, `pre`의 `data-language`, 첫 직계 `code`의 `language-*`, `pre`의 `language-*`.
 * - 후보가 하나라도 첫 후보와 다르면 `metadataConflict`가 참이다. 경고는 호출자가 낸다.
 * - 입력은 `htmlElement`로 직접 만든 HAST 노드다. 파서와 sanitize를 거치지 않는다.
 */
import { describe, expect, it } from "vitest";

import {
  htmlElement,
  type HtmlElementNode,
} from "../src/html/inline-content.js";
import { selectCodeBlockLanguage } from "../src/html/import-html-helpers.js";

/** 직계 자식으로 code를 가진 pre 노드를 만든다. code가 없으면 텍스트만 든다. */
const preWith = (
  preProperties: Record<string, string | string[]>,
  codeProperties?: Record<string, string | string[]>,
) =>
  htmlElement(
    "pre",
    preProperties,
    codeProperties === undefined
      ? [{ type: "text", value: "x" }]
      : [htmlElement("code", codeProperties, [{ type: "text", value: "x" }])],
  );

describe("selectCodeBlockLanguage", () => {
  it("후보가 없으면 language가 없고 충돌도 없다", () => {
    expect(selectCodeBlockLanguage(preWith({}))).toEqual({
      language: undefined,
      metadataConflict: false,
    });
  });

  it("pre의 language-* class를 읽는다", () => {
    expect(
      selectCodeBlockLanguage(preWith({ className: ["language-ts"] })),
    ).toEqual({
      language: "ts",
      metadataConflict: false,
    });
  });

  it("pre의 data-language를 읽는다", () => {
    expect(selectCodeBlockLanguage(preWith({ dataLanguage: "py" }))).toEqual({
      language: "py",
      metadataConflict: false,
    });
  });

  it("첫 직계 code의 language-* class를 읽는다", () => {
    expect(
      selectCodeBlockLanguage(preWith({}, { className: ["language-rust"] })),
    ).toEqual({ language: "rust", metadataConflict: false });
  });

  it("className이 문자열이어도 language-* 토큰을 읽는다", () => {
    expect(
      selectCodeBlockLanguage(preWith({ className: "foo language-go" })),
    ).toEqual({ language: "go", metadataConflict: false });
  });

  it("접두사만 있는 language- 토큰은 후보가 아니다", () => {
    expect(
      selectCodeBlockLanguage(preWith({ className: ["language-"] })),
    ).toEqual({
      language: undefined,
      metadataConflict: false,
    });
  });

  it("data-language가 class보다 먼저이고 code가 pre보다 먼저다", () => {
    const pre = preWith(
      { dataLanguage: "pre-data", className: ["language-pre-class"] },
      { dataLanguage: "code-data", className: ["language-code-class"] },
    );

    expect(selectCodeBlockLanguage(pre).language).toBe("code-data");
  });

  it("code의 class가 pre의 data-language보다 늦다", () => {
    const pre = preWith(
      { dataLanguage: "pre-data" },
      { className: ["language-code-class"] },
    );

    expect(selectCodeBlockLanguage(pre).language).toBe("pre-data");
  });

  it("후보가 모두 같으면 충돌이 아니다", () => {
    const pre = preWith(
      { dataLanguage: "ts", className: ["language-ts"] },
      { dataLanguage: "ts", className: ["language-ts"] },
    );

    expect(selectCodeBlockLanguage(pre)).toEqual({
      language: "ts",
      metadataConflict: false,
    });
  });

  it("후보가 어긋나면 첫 후보를 쓰고 충돌로 표시한다", () => {
    const pre = preWith(
      { className: ["language-ts"] },
      { className: ["language-js"] },
    );

    expect(selectCodeBlockLanguage(pre)).toEqual({
      language: "js",
      metadataConflict: true,
    });
  });

  it("한 요소에 language-* 토큰이 둘이면 첫 토큰을 쓰고 충돌로 표시한다", () => {
    expect(
      selectCodeBlockLanguage(
        preWith({ className: ["language-a", "language-b"] }),
      ),
    ).toEqual({ language: "a", metadataConflict: true });
  });

  it("직계가 아닌 후손 code는 읽지 않는다", () => {
    const pre = htmlElement("pre", {}, [
      htmlElement("span", {}, [
        htmlElement("code", { className: ["language-deep"] }, [
          { type: "text", value: "x" },
        ]),
      ]),
    ]);

    expect(selectCodeBlockLanguage(pre)).toEqual({
      language: undefined,
      metadataConflict: false,
    });
  });

  describe("무효 후보(Issue #353)", () => {
    it("무효 data-language는 선택에서 빠지고 다음 후보를 쓴다", () => {
      const pre = preWith({
        dataLanguage: "a\u0001b",
        className: ["language-js"],
      });
      const result = selectCodeBlockLanguage(pre);

      expect(result.language).toBe("js");
      expect(result.metadataConflict).toBe(false);
      expect(result.rejected).toEqual([
        { node: pre, attribute: "dataLanguage" },
      ]);
    });

    it("무효 후보는 exact 후보에도 들지 않아 충돌이 아니다", () => {
      const pre = preWith(
        { dataLanguage: "ts" },
        { dataLanguage: "bad\u007f" },
      );
      const result = selectCodeBlockLanguage(pre);

      expect(result.language).toBe("ts");
      expect(result.metadataConflict).toBe(false);
    });

    it("무효 후보가 있어도 유효 후보끼리 어긋나면 충돌이다", () => {
      const pre = preWith(
        { dataLanguage: "ts", className: ["language-js"] },
        { dataLanguage: "bad\u0001" },
      );
      const result = selectCodeBlockLanguage(pre);

      expect(result.language).toBe("ts");
      expect(result.metadataConflict).toBe(true);
    });

    it("짝 없는 surrogate도 무효다", () => {
      const pre = preWith({ dataLanguage: "a\ud800b" });
      const result = selectCodeBlockLanguage(pre);

      expect(result.language).toBeUndefined();
      expect(result.rejected).toEqual([
        { node: pre, attribute: "dataLanguage" },
      ]);
    });

    it("직계 code의 무효 후보는 code 노드를 돌려준다", () => {
      const pre = preWith({}, { dataLanguage: "a\u0001b" });
      const code = pre.children[0] as HtmlElementNode;
      const result = selectCodeBlockLanguage(pre);

      expect(result.language).toBeUndefined();
      expect(result.rejected).toEqual([
        { node: code, attribute: "dataLanguage" },
      ]);
    });

    it("한 class의 무효 토큰이 둘이어도 (노드, className) 한 건이다", () => {
      const pre = preWith({
        className: ["language-a\u0001", "language-b\u0002"],
      });
      const result = selectCodeBlockLanguage(pre);

      expect(result.language).toBeUndefined();
      expect(result.rejected).toEqual([{ node: pre, attribute: "className" }]);
    });

    it("무효 class 토큰 뒤의 유효 토큰을 그 위치의 후보로 쓴다", () => {
      const pre = preWith({ className: ["language-a\u0001", "language-js"] });
      const result = selectCodeBlockLanguage(pre);

      expect(result.language).toBe("js");
      expect(result.metadataConflict).toBe(false);
      expect(result.rejected).toEqual([{ node: pre, attribute: "className" }]);
    });

    it("후보 순서대로 빠진 후보를 돌려준다", () => {
      const pre = preWith(
        { dataLanguage: "p\u0001", className: ["language-c\u0001"] },
        { dataLanguage: "d\u0001", className: ["language-e\u0001"] },
      );
      const code = pre.children[0] as HtmlElementNode;
      const result = selectCodeBlockLanguage(pre);

      expect(result.language).toBeUndefined();
      expect(result.rejected).toEqual([
        { node: code, attribute: "dataLanguage" },
        { node: pre, attribute: "dataLanguage" },
        { node: code, attribute: "className" },
        { node: pre, attribute: "className" },
      ]);
    });

    it("빈 data-language는 미지정이라 빠진 후보가 아니다", () => {
      const result = selectCodeBlockLanguage(preWith({ dataLanguage: "" }));

      expect(result.language).toBeUndefined();
      expect(result.rejected ?? []).toEqual([]);
    });
  });
});
