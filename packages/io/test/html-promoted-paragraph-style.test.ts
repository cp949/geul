/**
 * `li`·`blockquote`·callout이 content로 승격한 안쪽 `p`의 style 색·서식을
 * 읽는지 고정한다(Issue #342, #335).
 *
 * - 승격한 `p`는 블록 요소 안쪽이다. 안쪽 값이 바깥 `li`·`blockquote` style을
 *   이긴다. 색은 블록 속성이 되고, 서식은 안쪽 텍스트 마크가 된다.
 * - 굵기·기울임은 안쪽 우선이고 끄는 값도 덮는다. 밑줄·취소선은 합집합이다.
 * - `li`의 `data-geul-*` 색은 `p`의 style보다 먼저다.
 * - 승격하지 않는 `p`(둘째 이후)는 자기 문단이라 자기 style을 읽는다.
 * - 기대값은 Chromium `getComputedStyle` 실측(2026-10-10, Chromium 153)이다.
 *   배경은 가장 가까운 조상의 불투명한 배경이다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

type TextBlock = Extract<Block, { content: unknown }>;

const firstBlock = (html: string): TextBlock => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  const [block] = result.value.document.blocks;
  if (block === undefined || !("content" in block)) {
    throw new Error("텍스트 블록이 아니다");
  }
  return block as TextBlock;
};

/** 블록 속성 색과 글자 `x`의 마크 종류를 돌려준다. */
const read = (html: string) => {
  const block = firstBlock(html);
  const run = (
    block.content as Array<{ text: string; marks?: Array<{ type: string }> }>
  ).find((item) => item.text === "x");
  return {
    textColor: (block as { textColor?: string }).textColor,
    backgroundColor: (block as { backgroundColor?: string }).backgroundColor,
    marks: (run?.marks ?? []).map((mark) => mark.type).sort(),
  };
};

describe("승격한 p의 색", () => {
  it("li의 color를 p의 color가 이긴다(#335)", () => {
    expect(
      read('<ul><li style="color:red"><p style="color:blue">x</p></li></ul>'),
    ).toMatchObject({ textColor: "#0000FF" });
  });

  it("blockquote의 color를 p의 color가 이긴다(#335)", () => {
    expect(
      read(
        '<blockquote style="color:red"><p style="color:blue">x</p></blockquote>',
      ),
    ).toMatchObject({ textColor: "#0000FF" });
  });

  it("li의 배경을 p의 배경이 이긴다", () => {
    expect(
      read(
        '<ul><li style="background-color:yellow"><p style="background-color:#00ff00">x</p></li></ul>',
      ),
    ).toMatchObject({ backgroundColor: "#00FF00" });
  });

  it("p에 색이 없으면 li의 color가 남는다", () => {
    expect(read('<ul><li style="color:red"><p>x</p></li></ul>')).toMatchObject({
      textColor: "#FF0000",
    });
  });

  it("p에만 있는 색도 블록 속성이 된다", () => {
    expect(read('<ul><li><p style="color:blue">x</p></li></ul>')).toMatchObject(
      { textColor: "#0000FF" },
    );
  });

  it("li의 data-geul 색이 p의 style 색보다 먼저다", () => {
    expect(
      read(
        '<ul><li data-geul-text-color="#112233"><p style="color:blue">x</p></li></ul>',
      ),
    ).toMatchObject({ textColor: "#112233" });
  });

  it("callout의 승격한 p도 같다", () => {
    expect(
      read(
        '<div data-geul-callout="true" style="color:red"><p style="color:blue">x</p></div>',
      ),
    ).toMatchObject({ textColor: "#0000FF" });
  });

  it("색은 마크로 이중 반영되지 않는다", () => {
    expect(read('<ul><li><p style="color:blue">x</p></li></ul>').marks).toEqual(
      [],
    );
  });
});

describe("승격한 p의 서식", () => {
  it.each<[string, string, string[]]>([
    [
      "li 안 p 굵게",
      '<ul><li><p style="font-weight:bold">x</p></li></ul>',
      ["bold"],
    ],
    [
      "blockquote 안 p 기울임",
      '<blockquote><p style="font-style:italic">x</p></blockquote>',
      ["italic"],
    ],
    [
      "li 안 p 밑줄",
      '<ul><li><p style="text-decoration:underline">x</p></li></ul>',
      ["underline"],
    ],
    [
      "li 안 p 취소선",
      '<ul><li><p style="text-decoration:line-through">x</p></li></ul>',
      ["strike"],
    ],
    [
      "li의 normal이 p의 bold를 이기지 못한다",
      '<ul><li style="font-weight:normal"><p style="font-weight:bold">x</p></li></ul>',
      ["bold"],
    ],
    [
      "p의 normal이 li의 bold를 끈다",
      '<ul><li style="font-weight:bold"><p style="font-weight:normal">x</p></li></ul>',
      [],
    ],
    [
      "li와 p의 서식이 합쳐진다",
      '<ul><li style="font-style:italic"><p style="font-weight:bold">x</p></li></ul>',
      ["bold", "italic"],
    ],
    [
      "p의 none은 li의 밑줄을 끄지 못한다",
      '<ul><li style="text-decoration:underline"><p style="text-decoration:none">x</p></li></ul>',
      ["underline"],
    ],
  ])("%s", (_name, html, marks) => {
    expect(read(html).marks).toEqual(marks);
  });
});

describe("승격하지 않는 경우", () => {
  it("둘째 p는 자기 문단이라 자기 style을 읽는다", () => {
    const result = importHtml(
      '<ul><li style="color:red"><p>a</p><p style="color:blue">x</p></li></ul>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [item] = result.value.document.blocks;
    expect(item).toMatchObject({
      type: "bulletListItem",
      textColor: "#FF0000",
    });
    const child = (item as { children?: Array<{ textColor?: string }> })
      .children?.[0];
    expect(child?.textColor).toBe("#0000FF");
  });

  it("p로 시작하지 않는 li는 li의 style만 읽는다", () => {
    expect(
      read('<ul><li style="color:red;font-weight:bold">x</li></ul>'),
    ).toMatchObject({ textColor: "#FF0000", marks: ["bold"] });
  });
});
