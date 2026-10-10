/**
 * `parseClipboardTable`이 내는 `ClipboardContentBlock`이 model `Block` 모양인지 검증한다(Issue #356 RD-004).
 *
 * - 표가 아닌 블록은 임시 id를 가진다. 호출 안에서 비어 있지 않고 유일하다.
 * - id는 호출마다 새로 센다. 같은 입력을 두 번 파싱하면 id까지 같다(모듈 전역 카운터 금지).
 * - 표 variant는 id가 없고 `data`(TabularData)만 가진다.
 * - `codeBlock`은 `text`가 아니라 `content: [{ text }]`를 가진다. 마크는 없다.
 * - 타입 정의는 비표 variant를 model `Block`에서 파생한다. `expectTypeOf`가 tsc 단계에서 이를 고정한다.
 */
import type {
  BulletListItemBlock,
  CodeBlock,
  DividerBlock,
  HeadingBlock,
  ParagraphBlock,
} from "@cp949/geul-model";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { ClipboardContentBlock } from "../src/clipboard/clipboard-content.js";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import type { TabularData } from "../src/clipboard/tabular-data.js";

const TABLE =
  "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>";

/** 문단·제목·중첩 목록·li 안 pre·hr·표를 모두 담은 입력이다. */
const MIXED_HTML =
  "<p>intro</p><h2>title</h2>" +
  "<ul><li>a<ul><li>b</li></ul><pre>x\ny</pre><hr>" +
  `${TABLE}</li><li>c</li></ul>` +
  `<p>outro</p>${TABLE}`;

/** 성공 결과의 시퀀스를 꺼낸다. 실패하면 던진다. */
const parse = (html: string): readonly ClipboardContentBlock[] => {
  const result = parseClipboardTable({ html });
  if (!result.ok) throw new Error("parseClipboardTable이 실패했다");
  return result.value;
};

/** 표가 아닌 블록의 id를 문서 순서(부모 먼저)로 모은다. children은 재귀로 따라간다. */
const collectIds = (blocks: readonly ClipboardContentBlock[]): string[] =>
  blocks.flatMap((block) =>
    block.type === "table"
      ? []
      : [
          block.id,
          ...collectIds("children" in block ? (block.children ?? []) : []),
        ],
  );

/** 표가 아닌 블록을 재귀로 모두 모은다. */
const collectBlocks = (
  blocks: readonly ClipboardContentBlock[],
): ClipboardContentBlock[] =>
  blocks.flatMap((block) =>
    block.type === "table"
      ? [block]
      : [
          block,
          ...collectBlocks("children" in block ? (block.children ?? []) : []),
        ],
  );

describe("ClipboardContentBlock 임시 id (Issue #356)", () => {
  it("표가 아닌 블록은 비어 있지 않은 id를 가진다", () => {
    const ids = collectIds(parse(MIXED_HTML));
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("한 호출 안에서 id가 유일하다", () => {
    const ids = collectIds(parse(MIXED_HTML));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("id가 문서 순서(부모 먼저)로 clipboard-1부터 이어진다", () => {
    const ids = collectIds(parse(MIXED_HTML));
    expect(ids).toEqual(ids.map((_, index) => `clipboard-${index + 1}`));
  });

  it("같은 입력을 두 번 파싱하면 id까지 같다", () => {
    const first = parse(MIXED_HTML);
    parse(`<p>다른 입력</p>${TABLE}`);
    const second = parse(MIXED_HTML);
    expect(second).toEqual(first);
  });

  it("표 variant는 id 없이 data만 가진다", () => {
    const tables = collectBlocks(parse(MIXED_HTML)).filter(
      (block) => block.type === "table",
    );
    expect(tables).toHaveLength(2);
    for (const table of tables) {
      expect(Object.keys(table).sort()).toEqual(["data", "type"]);
    }
  });
});

describe("ClipboardContentBlock codeBlock 모양 (Issue #356)", () => {
  it("li 안 pre는 text 대신 content 런 하나를 가진다", () => {
    const code = collectBlocks(parse(MIXED_HTML)).find(
      (block) => block.type === "codeBlock",
    );
    expect(code).toBeDefined();
    expect(code).toMatchObject({
      type: "codeBlock",
      content: [{ text: "x\ny" }],
    });
    expect(code).not.toHaveProperty("text");
    const [run] = (code as CodeBlock).content;
    expect(run).not.toHaveProperty("marks");
  });

  it("language는 model 정규형으로 content와 함께 실린다", () => {
    const code = collectBlocks(
      parse(
        `<ul><li>t<pre><code class="language-ts">a</code></pre></li></ul>${TABLE}`,
      ),
    ).find((block) => block.type === "codeBlock");
    expect(code).toMatchObject({
      type: "codeBlock",
      language: "typescript",
      content: [{ text: "a" }],
    });
    expect(code).not.toHaveProperty("text");
  });

  it("li 안 hr는 id와 type만 가진 divider다", () => {
    const divider = collectBlocks(parse(MIXED_HTML)).find(
      (block) => block.type === "divider",
    );
    expect(Object.keys(divider ?? {}).sort()).toEqual(["id", "type"]);
  });
});

describe("ClipboardContentBlock 타입 (Issue #356)", () => {
  /** 변종 하나를 type으로 뽑는다. */
  type Variant<T extends ClipboardContentBlock["type"]> = Extract<
    ClipboardContentBlock,
    { type: T }
  >;

  it("비표 variant가 model Block의 필드를 그대로 가진다", () => {
    expectTypeOf<Variant<"paragraph">["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Omit<Variant<"paragraph">, "children">>().toEqualTypeOf<
      Omit<ParagraphBlock, "children">
    >();
    expectTypeOf<Omit<Variant<"heading">, "children">>().toEqualTypeOf<
      Omit<HeadingBlock, "children">
    >();
    expectTypeOf<Omit<Variant<"bulletListItem">, "children">>().toEqualTypeOf<
      Omit<BulletListItemBlock, "children">
    >();
    expectTypeOf<Variant<"codeBlock">>().toEqualTypeOf<CodeBlock>();
    expectTypeOf<Variant<"divider">>().toEqualTypeOf<DividerBlock>();
    expectTypeOf<Variant<"codeBlock">["content"]>().toEqualTypeOf<
      CodeBlock["content"]
    >();
    expect(true).toBe(true);
  });

  it("children은 재귀로 ClipboardContentBlock을 담고 표 variant는 data만 가진다", () => {
    expectTypeOf<
      NonNullable<Variant<"bulletListItem">["children"]>[number]
    >().toEqualTypeOf<ClipboardContentBlock>();
    expectTypeOf<Variant<"table">>().toEqualTypeOf<{
      type: "table";
      data: TabularData;
    }>();
    expect(true).toBe(true);
  });
});
