/**
 * `prepareSanitizedRoot`가 문서 import와 클립보드 표 파서의 공통 준비 순서를
 * 고정한다(arch-review 05 후보 02, 이슈 없음).
 *
 * - `\0`는 U+0001로 치환해 parse5가 지우지 못하게 한다. 두 schema 모두 같다.
 * - 깊이-캡으로 절단된 입력은 소스 공백을 접지 않는다.
 * - `data-geul-block-id`·`data-geul-cell-id`가 있으면 소스 공백을 접지 않는다.
 * - 블록을 품은 font·mark는 벗기고 벗긴 요소를 순서대로 돌려준다.
 * - 링크 정책을 적용한다. 허용하지 않는 href는 sanitize된 트리에 남지 않는다.
 * - `unsafeRoot`는 준비 뒤에도 파싱 직후와 같다. 경고 수집기가 sanitize 뒤에
 *   읽어도 되는 근거다.
 * - schema만 다르다. 클립보드 schema만 `table[role]`을 남기고 title을 글자째
 *   지운다.
 */
import type { Schema } from "hast-util-sanitize";
import { describe, expect, it } from "vitest";

import { clipboardSanitizeSchema } from "../src/html/clipboard-sanitize-schema.js";
import { htmlImportSanitizeSchema } from "../src/html/import-html-sanitize-schema.js";
import type { HtmlElementNode, HtmlNode } from "../src/html/inline-content.js";
import {
  MAX_HTML_TREE_DEPTH,
  parseHtmlFragment,
} from "../src/html/parse-html.js";
import { prepareSanitizedRoot } from "../src/html/prepare-sanitized-root.js";

const schemas = [
  ["import", htmlImportSanitizeSchema],
  ["clipboard", clipboardSanitizeSchema],
] as const;

/** 트리의 text 노드 값을 문서 순서대로 모은다. */
const textValues = (nodes: readonly HtmlNode[]): string[] =>
  nodes.flatMap((node) => {
    if (node.type === "text") return [node.value];
    if (node.type === "element") return textValues(node.children);
    return [];
  });

/** 트리에서 tagName이 같은 요소를 문서 순서대로 모은다. */
const elementsNamed = (
  nodes: readonly HtmlNode[],
  tagName: string,
): HtmlElementNode[] =>
  nodes.flatMap((node) => {
    if (node.type !== "element") return [];
    return [
      ...(node.tagName === tagName ? [node] : []),
      ...elementsNamed(node.children, tagName),
    ];
  });

const prepared = (html: string, schema: Schema = htmlImportSanitizeSchema) => {
  const result = prepareSanitizedRoot(html, schema);
  if (result === undefined) throw new Error("준비 실패");
  return result;
};

describe.each(schemas)("%s schema 공통 준비", (_name, schema) => {
  it("\\0를 U+0001로 치환해 글자 수를 지킨다", () => {
    const { safeRoot } = prepared("<pre>a\0b</pre>", schema);
    expect(textValues(safeRoot.children)).toEqual(["a\u0001b"]);
  });

  it("소스 공백 run을 접는다", () => {
    const { safeRoot } = prepared("<p>a \n\t b</p>", schema);
    expect(textValues(safeRoot.children)).toEqual(["a b"]);
  });

  it("우리 export 표식이 있으면 소스 공백을 접지 않는다", () => {
    const { safeRoot } = prepared(
      '<p data-geul-block-id="b1">a \n b</p>',
      schema,
    );
    expect(textValues(safeRoot.children)).toEqual(["a \n b"]);
  });

  it("셀 표식만 있어도 소스 공백을 접지 않는다", () => {
    const { safeRoot } = prepared(
      '<table><tbody><tr><td data-geul-cell-id="c1">a \n b</td></tr></tbody></table>',
      schema,
    );
    expect(textValues(safeRoot.children)).toContain("a \n b");
  });

  it("깊이-캡으로 절단된 입력은 접지 않고 truncated를 켠다", () => {
    const deep =
      "<div>".repeat(MAX_HTML_TREE_DEPTH + 10) +
      "a \n b" +
      "</div>".repeat(MAX_HTML_TREE_DEPTH + 10);
    const result = prepared(deep, schema);
    expect(result.truncated).toBe(true);
    expect(textValues(result.safeRoot.children).join("")).toContain("a \n b");
  });

  it("얕은 입력은 truncated가 꺼진다", () => {
    expect(prepared("<p>a</p>", schema).truncated).toBe(false);
  });

  it("블록을 품은 font·mark를 벗기고 벗긴 요소를 순서대로 돌려준다", () => {
    const result = prepared(
      '<font color="red"><p>a</p></font><mark><p>b</p></mark><font color="blue">c</font>',
      schema,
    );
    expect(result.unwrappedColorTags.map((node) => node.tagName)).toEqual([
      "font",
      "mark",
    ]);
    expect(elementsNamed(result.safeRoot.children, "font")).toHaveLength(1);
    expect(elementsNamed(result.safeRoot.children, "mark")).toHaveLength(0);
  });

  it("링크 정책을 적용한다", () => {
    const { safeRoot } = prepared(
      '<p><a href="javascript:alert(1)">x</a></p>',
      schema,
    );
    const [anchor] = elementsNamed(safeRoot.children, "a");
    expect(anchor?.properties.href).toBeUndefined();
  });

  it("unsafeRoot는 준비 뒤에도 파싱 직후와 같다", () => {
    const html =
      '<font color="red"><p>a \n b</p></font><a href="javascript:x">l</a><script>s</script>';
    const fresh = parseHtmlFragment(html);
    if (fresh === undefined) throw new Error("파싱 실패");
    const result = prepared(html, schema);
    expect(result.unsafeRoot).toEqual(fresh.root);
  });
});

describe("schema 차이", () => {
  const roleTable =
    '<table role="presentation"><tbody><tr><td>a</td></tr></tbody></table>';

  it("table[role]은 클립보드 schema만 남긴다", () => {
    const [imported] = elementsNamed(
      prepared(roleTable, htmlImportSanitizeSchema).safeRoot.children,
      "table",
    );
    const [clipboard] = elementsNamed(
      prepared(roleTable, clipboardSanitizeSchema).safeRoot.children,
      "table",
    );
    expect(imported?.properties.role).toBeUndefined();
    expect(clipboard?.properties.role).toBe("presentation");
  });

  it("title은 클립보드 schema만 글자째 지운다", () => {
    const html = "<title>Sheet1</title><p>a</p>";
    const importText = textValues(
      prepared(html, htmlImportSanitizeSchema).safeRoot.children,
    );
    const clipboardText = textValues(
      prepared(html, clipboardSanitizeSchema).safeRoot.children,
    );
    expect(importText).toContain("Sheet1");
    expect(clipboardText).not.toContain("Sheet1");
  });
});

describe("실패", () => {
  it("파서가 루트를 만들지 못하면 undefined다", () => {
    // 닫히지 않은 중첩 template은 parse5 내부 재귀로 RangeError를 던진다
    // (parseHtmlFragment 경계 catch).
    const html = "<template>".repeat(20000);
    expect(
      prepareSanitizedRoot(html, htmlImportSanitizeSchema),
    ).toBeUndefined();
  });
});
