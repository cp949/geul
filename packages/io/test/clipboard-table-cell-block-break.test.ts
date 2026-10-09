/**
 * `parseClipboardTable`이 셀 안 블록 요소(p, div 등) 경계에서 단어를 붙이지
 * 않고 줄바꿈 하나로 나누는지 검증한다(Issue #325). 브라우저가 그 경계에서
 * 줄을 바꿔 보여 주는 것과 맞춘다. 소스 공백이 낀 경계, 앞뒤나 중간이 빈
 * 블록, 마크가 줄바꿈을 넘어 끊기지 않는 것, 단일 블록·인라인·br 셀이
 * 이전과 같은 것을 함께 다룬다. 셀 텍스트 정규화 일반은
 * `clipboard-table-normalization.test.ts`가 다룬다.
 */
import { describe, expect, it } from "vitest";
import type { InlineContent } from "@cp949/geul-model";
import { parseClipboardTable } from "../src/clipboard/clipboard-table-parser.js";

/**
 * 셀 HTML 하나를 `<td>`에 넣은 1x2 표를 파싱해 첫 셀의 인라인 콘텐츠를
 * 돌려준다. 둘째 셀은 표 열 수를 2로 맞추려는 자리표시자다.
 */
const firstCellContent = (cellHtml: string): InlineContent => {
  const result = parseClipboardTable({
    html: `<table><tbody><tr><td>${cellHtml}</td><td>z</td></tr></tbody></table>`,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  const [block] = result.value;
  if (block?.type !== "table") throw new Error("unreachable");
  const cell = block.data.rows[0]?.cells[0];
  if (cell === undefined) throw new Error("unreachable");
  return cell.content;
};

describe("parseClipboardTable 셀 안 블록 경계", () => {
  it("p 둘이 이어지면 줄바꿈 하나로 나뉜다", () => {
    expect(firstCellContent("<p>a</p><p>b</p>")).toEqual([{ text: "a\nb" }]);
  });

  it("div 둘이 이어지면 줄바꿈 하나로 나뉜다", () => {
    expect(firstCellContent("<div>a</div><div>b</div>")).toEqual([
      { text: "a\nb" },
    ]);
  });

  it("인라인 텍스트와 블록 사이도 줄바꿈으로 나뉜다", () => {
    expect(firstCellContent("x<div>a</div>y")).toEqual([{ text: "x\na\ny" }]);
  });

  it("블록 사이의 소스 공백은 줄바꿈 하나로 바뀐다", () => {
    expect(firstCellContent("<p>a</p> <p>b</p>")).toEqual([{ text: "a\nb" }]);
  });

  it("블록 안쪽 끝의 공백은 줄바꿈 앞뒤에 남지 않는다", () => {
    expect(firstCellContent("<p>a </p><p> b</p>")).toEqual([{ text: "a\nb" }]);
  });

  it("앞이 빈 블록은 선행 줄바꿈을 만들지 않는다", () => {
    expect(firstCellContent("<p></p><p>a</p>")).toEqual([{ text: "a" }]);
  });

  it("뒤가 빈 블록은 후행 줄바꿈을 만들지 않는다", () => {
    expect(firstCellContent("<p>a</p><p></p>")).toEqual([{ text: "a" }]);
  });

  it("중간에 낀 빈 블록은 줄바꿈을 겹치지 않는다", () => {
    expect(firstCellContent("<p>a</p><p></p><p>b</p>")).toEqual([
      { text: "a\nb" },
    ]);
  });

  it.each([
    [
      "셀 앞 개행·들여쓰기와 블록 사이 개행",
      "\n  <p>a</p>\n  <p>b</p>\n",
      "a\nb",
    ],
    ["첫 블록 앞 공백", " <p>a</p>", "a"],
    ["첫 div 앞뒤 개행", "\n<div>a</div>\n", "a"],
    ["들여쓴 목록", "\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n", "a\nb"],
    ["공백뿐인 span 뒤 블록", "<span> </span><div>a</div>", "a"],
  ])("%s에서 선행 줄바꿈이 생기지 않는다", (_name, cellHtml, expected) => {
    expect(firstCellContent(cellHtml)).toEqual([{ text: expected }]);
  });

  it("li 항목도 블록 경계라 줄바꿈으로 나뉜다", () => {
    expect(firstCellContent("<ul><li>a</li><li>b</li></ul>")).toEqual([
      { text: "a\nb" },
    ]);
  });

  it("줄바꿈이 마크 안으로 들어가지 않고 앞 마크도 끊기지 않는다", () => {
    expect(firstCellContent("<p><b>a</b></p><p>b</p>")).toEqual([
      { text: "a", marks: [{ type: "bold" }] },
      { text: "\nb" },
    ]);
    expect(firstCellContent("<p><b>a</b></p><p><b>b</b></p>")).toEqual([
      { text: "a", marks: [{ type: "bold" }] },
      { text: "\n" },
      { text: "b", marks: [{ type: "bold" }] },
    ]);
  });

  it("블록 하나뿐인 셀은 이전과 같다", () => {
    expect(firstCellContent("<p>a</p>")).toEqual([{ text: "a" }]);
  });

  it("인라인만 든 셀은 이전과 같다", () => {
    expect(firstCellContent("x<b>y</b>")).toEqual([
      { text: "x" },
      { text: "y", marks: [{ type: "bold" }] },
    ]);
  });

  it("br이 만든 줄바꿈은 블록 경계와 겹치지 않고 그대로 남는다", () => {
    expect(firstCellContent("a<br>b")).toEqual([{ text: "a\nb" }]);
    expect(firstCellContent("<p>a<br></p><p>b</p>")).toEqual([
      { text: "a\nb" },
    ]);
    expect(firstCellContent("<p>a</p><br><p>b</p>")).toEqual([
      { text: "a\nb" },
    ]);
  });
});
