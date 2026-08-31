/**
 * html/export-html.ts와 markdown/export-markdown.ts가 공유하는 "연속 같은
 * 종류 목록 항목 형제 묶기 + startNumber 경계 판정"을 포맷과 무관하게
 * 검증한다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { groupListItemRuns } from "../src/list-item-run-grouping.js";

const bullet = (id: string): Block => ({
  id,
  type: "bulletListItem",
  content: [{ text: id }],
});

const numbered = (id: string, startNumber?: number): Block => ({
  id,
  type: "numberedListItem",
  content: [{ text: id }],
  ...(startNumber === undefined ? {} : { startNumber }),
});

const paragraph = (id: string): Block => ({
  id,
  type: "paragraph",
  content: [{ text: id }],
});

// 테스트 전용 makeListNode: 묶인 항목의 id만 이어붙여 어떤 항목이 한
// 그룹으로 묶였는지 그대로 드러낸다.
const joinIds = (items: { id: string }[]): string =>
  items.map((item) => item.id).join(",");

describe("groupListItemRuns", () => {
  it("연속된 같은 종류 목록 항목을 하나의 그룹으로 묶는다", () => {
    const blocks = [bullet("b1"), bullet("b2"), bullet("b3")];

    expect(groupListItemRuns(blocks, joinIds)).toEqual([
      { kind: "list", node: "b1,b2,b3" },
    ]);
  });

  it("목록 종류가 바뀌면 그룹을 끊는다", () => {
    const blocks = [bullet("b1"), numbered("n1")];

    expect(groupListItemRuns(blocks, joinIds)).toEqual([
      { kind: "list", node: "b1" },
      { kind: "list", node: "n1" },
    ]);
  });

  it("명시적 startNumber를 만나면 새 그룹을 시작한다", () => {
    const blocks = [numbered("n1"), numbered("n2", 9), numbered("n3")];

    expect(groupListItemRuns(blocks, joinIds)).toEqual([
      { kind: "list", node: "n1" },
      { kind: "list", node: "n2,n3" },
    ]);
  });

  it("startNumber가 없는 번호 목록은 그룹을 끊지 않는다", () => {
    const blocks = [numbered("n1"), numbered("n2"), numbered("n3")];

    expect(groupListItemRuns(blocks, joinIds)).toEqual([
      { kind: "list", node: "n1,n2,n3" },
    ]);
  });

  it("목록이 아닌 블록은 원본 그대로 통과시킨다", () => {
    const blocks = [paragraph("p1"), bullet("b1"), paragraph("p2")];

    expect(groupListItemRuns(blocks, joinIds)).toEqual([
      { kind: "block", block: blocks[0] },
      { kind: "list", node: "b1" },
      { kind: "block", block: blocks[2] },
    ]);
  });

  it("빈 배열은 빈 결과를 반환한다", () => {
    expect(groupListItemRuns([], joinIds)).toEqual([]);
  });
});
