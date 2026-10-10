/**
 * `parseClipboardTable`이 표 옆 블록 요소 자신의 `style`을 `importHtml`과 같게
 * 읽는지 검증한다(Issue #343).
 *
 * - 표면: 표 밖 `p`, `h1`–`h6`, `li`, `li`가 승격한 안쪽 `p`.
 * - 색·배경은 블록 필드로, 굵게·기울임·밑줄·취소선은 글자 마크로 읽는다.
 * - 입력마다 뒤에 2×2 데이터 표를 붙인다. 표가 없으면 파서가 표 붙여넣기를
 *   하지 않는다.
 * - 기대값은 같은 HTML의 `importHtml` 결과다. 표 앞 첫 블록끼리 비교한다.
 * - 중첩 목록 항목의 색도 같은 경로로 읽는다.
 */
import { describe, expect, it } from "vitest";

import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";
import { withoutIds } from "./clipboard-table-support.js";
import { importHtml } from "../src/index.js";

const TABLE =
  "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>";

/** 비교에 쓰는 블록 모양이다. id와 블록별 부가 필드는 뺀다. */
type BlockShape = {
  type: unknown;
  textColor: unknown;
  backgroundColor: unknown;
  content: unknown;
};

/** 블록에서 종류·블록 색·인라인 콘텐츠만 남긴다. */
const shapeOf = (block: unknown): BlockShape => {
  const record = block as Record<string, unknown>;
  return {
    type: record.type,
    textColor: record.textColor,
    backgroundColor: record.backgroundColor,
    content: record.content,
  };
};

/** importHtml이 만든 첫 블록의 모양이다. */
const importedFirstBlock = (html: string): BlockShape => {
  const result = importHtml(html);
  if (!result.ok) throw new Error("importHtml이 실패했다");
  return shapeOf(result.value.document.blocks[0]);
};

/** parseClipboardTable이 만든 첫 블록의 모양이다. */
const clipboardFirstBlock = (html: string): BlockShape => {
  const result = parseClipboardTable({ html });
  if (!result.ok) throw new Error("parseClipboardTable이 실패했다");
  return shapeOf(result.value[0]);
};

describe("parseClipboardTable 표 옆 블록 style", () => {
  it.each([
    ["문단 색", '<p style="color:#0000FF">P</p>'],
    ["문단 색과 굵게", '<p style="color:#0000FF;font-weight:bold">P</p>'],
    ["제목 색과 기울임", '<h2 style="color:#0000FF;font-style:italic">H</h2>'],
    [
      "목록 항목 색과 밑줄",
      '<ul><li style="color:#0000FF;text-decoration:underline">L</li></ul>',
    ],
    [
      "목록 항목이 승격한 p의 색과 굵게",
      '<ul><li><p style="color:#0000FF;font-weight:bold">P</p></li></ul>',
    ],
    ["문단 배경", '<p style="background-color:#FFFF00">B</p>'],
    ["대조군 span 색", '<p><span style="color:#0000FF">S</span></p>'],
  ])("%s를 importHtml과 같게 읽는다", (_name, before) => {
    const html = `${before}${TABLE}`;

    expect(clipboardFirstBlock(html)).toEqual(importedFirstBlock(html));
  });

  it("이슈 재현 문단의 색과 굵게를 블록 필드와 마크로 낸다", () => {
    const html = `<p style="color:#0000FF;font-weight:bold">P</p>${TABLE}`;

    const result = parseClipboardTable({ html });
    expect(result.ok && withoutIds(result.value[0])).toEqual({
      type: "paragraph",
      textColor: "#0000FF",
      content: [{ text: "P", marks: [{ type: "bold" }] }],
    });
  });

  it("중첩 목록 항목의 style 색과 서식을 children 블록에 싣는다", () => {
    const html =
      '<ul><li>A<ul><li style="color:#0000FF;font-weight:bold">B</li></ul></li></ul>' +
      TABLE;

    const result = parseClipboardTable({ html });
    expect(result.ok && withoutIds(result.value[0])).toEqual({
      type: "bulletListItem",
      content: [{ text: "A" }],
      children: [
        {
          type: "bulletListItem",
          textColor: "#0000FF",
          content: [{ text: "B", marks: [{ type: "bold" }] }],
        },
      ],
    });
  });
});
