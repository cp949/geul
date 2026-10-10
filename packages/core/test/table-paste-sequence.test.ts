/**
 * buildOutOfTableSequence가 클립보드 시퀀스(문단+표+heading 등)를 순서대로
 * 노드로 바꾸고 첫 표의 위치(firstTable)를 정확히 추적하는지 확인한다.
 * Editor를 마운트하지 않는다 — buildTestSchema가 만드는 스키마만으로
 * 충분한 순수 조립 함수이기 때문이다(pasteClipboardContent 쪽 통합
 * 시나리오는 table-paste-commands.test.ts가 다룬다).
 */
import type { ClipboardContentBlock } from "@cp949/geul-io";
import type { InlineContentItem } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { buildOutOfTableSequence } from "../src/table-paste-sequence.js";
import {
  clipBullet,
  clipCodeBlock,
  clipDivider,
  clipHeading,
  clipNumbered,
  clipParagraph,
} from "./clipboard-block-test-support.js";
import { sequentialIds } from "./editor-controller-support.js";
import { buildTestSchema } from "./table-test-support.js";

const schema = buildTestSchema();

const paragraphBlock = (text: string): ClipboardContentBlock =>
  clipParagraph([{ text }]);

const headingBlock = (text: string, level: 1 | 2 | 3): ClipboardContentBlock =>
  clipHeading(level, [{ text }]);

const tableBlock = (text: string): ClipboardContentBlock => ({
  type: "table",
  data: {
    columnCount: 1,
    rows: [
      {
        cells: [
          { columnIndex: 0, rowSpan: 1, columnSpan: 1, content: [{ text }] },
        ],
      },
    ],
  },
});

const bulletItemBlock = (
  text: string,
  children?: ClipboardContentBlock[],
): ClipboardContentBlock =>
  clipBullet([{ text }], children !== undefined ? { children } : {});

const numberedItemBlock = (
  text: string,
  opts: { startNumber?: number; children?: ClipboardContentBlock[] } = {},
): ClipboardContentBlock =>
  clipNumbered([{ text }], {
    ...(opts.startNumber !== undefined
      ? { startNumber: opts.startNumber }
      : {}),
    ...(opts.children !== undefined ? { children: opts.children } : {}),
  });

describe("buildOutOfTableSequence", () => {
  it("표가 없는 시퀀스는 노드만 만들고 firstTable은 null이다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [paragraphBlock("hello")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.nodes).toHaveLength(1);
    expect(result.value.nodes[0]?.type.name).toBe("blockContainer");
    expect(result.value.nodes[0]?.child(0).type.name).toBe("paragraph");
    expect(result.value.nodes[0]?.textContent).toBe("hello");
    expect(result.value.firstTable).toBeNull();
  });

  it("heading 블록은 level 속성을 가진 heading 노드가 된다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [headingBlock("title", 2)],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.nodes[0]?.type.name).toBe("blockContainer");
    expect(result.value.nodes[0]?.child(0).type.name).toBe("heading");
    expect(result.value.nodes[0]?.child(0).attrs.level).toBe(2);
  });

  it("문단+표+문단 순서에서 firstTable.offset은 앞선 문단의 nodeSize다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [paragraphBlock("intro"), tableBlock("A"), paragraphBlock("outro")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const { nodes, firstTable } = result.value;
    // 문단은 blockContainer로 감싸이고 표는 감싸이지 않는다.
    expect(
      nodes.map((node) =>
        node.type.name === "blockContainer"
          ? node.child(0).type.name
          : node.type.name,
      ),
    ).toEqual(["paragraph", "table", "paragraph"]);
    expect(firstTable).not.toBeNull();
    expect(firstTable?.offset).toBe(nodes[0]?.nodeSize);
    expect(firstTable?.node).toBe(nodes[1]);
    expect(
      (
        firstTable?.data.rows[0]?.cells[0]?.content[0] as
          Extract<InlineContentItem, { text: string }> | undefined
      )?.text,
    ).toBe("A");
  });

  // Issue #315: bare 문단·heading을 연달아 삽입하면 PM이 뒤 노드를 앞
  // 컨테이너의 blockGroup으로 감싼다 — 처음부터 blockContainer로 만든다.
  it("문단과 heading은 blockId 없는 blockContainer(blockContent)로 조립된다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [paragraphBlock("p"), headingBlock("h", 3), tableBlock("A")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const [p, h, t] = result.value.nodes;
    for (const [container, inner] of [
      [p, "paragraph"],
      [h, "heading"],
    ] as const) {
      expect(container?.type.name).toBe("blockContainer");
      expect(container?.childCount).toBe(1);
      expect(container?.child(0).type.name).toBe(inner);
      // blockId는 BlockIdExtension.appendTransaction이 사후 배정한다.
      expect(container?.attrs.blockId).toBeFalsy();
    }
    expect(h?.child(0).attrs.level).toBe(3);
    expect(t?.type.name).toBe("table");
  });

  it("문단과 heading은 createId를 소비하지 않는다", () => {
    let consumed = 0;
    const countingIds = () => {
      consumed += 1;
      return `id-${consumed}`;
    };

    const result = buildOutOfTableSequence(
      schema,
      [paragraphBlock("p"), headingBlock("h", 1), paragraphBlock("q")],
      countingIds,
    );

    expect(result.ok).toBe(true);
    expect(consumed).toBe(0);
  });

  it("표 앞뒤 문단이 있어도 createId 소비 횟수는 표 단독과 같다", () => {
    const consumedBy = (blocks: ClipboardContentBlock[]): number => {
      let consumed = 0;
      const result = buildOutOfTableSequence(schema, blocks, () => {
        consumed += 1;
        return `id-${consumed}`;
      });
      expect(result.ok).toBe(true);
      return consumed;
    };

    expect(
      consumedBy([paragraphBlock("a"), tableBlock("A"), paragraphBlock("b")]),
    ).toBe(consumedBy([tableBlock("A")]));
  });

  it("표가 시퀀스 첫 원소면 firstTable.offset은 0이다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [tableBlock("A"), paragraphBlock("outro")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.firstTable?.offset).toBe(0);
  });

  it("표가 둘이면 firstTable은 첫 번째 표만 가리킨다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [tableBlock("A"), tableBlock("B")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(
      (
        result.value.firstTable?.data.rows[0]?.cells[0]?.content[0] as
          Extract<InlineContentItem, { text: string }> | undefined
      )?.text,
    ).toBe("A");
  });

  it("표 데이터가 셀 한도를 넘으면 pasteGridInto 실패를 그대로 전파한다", () => {
    // buildPasteTableSkeleton은 block.data와 정확히 같은 크기(101×100)로
    // 골격을 만들고 pasteGridInto가 그 자리에 그대로 채우므로, anchor(0,0)
    // 기준 최종 크기 = block.data 자신의 크기다 — 셀 내용은 검사 지점(크기
    // 가드) 전이라 비어 있어도 된다.
    const oversized: ClipboardContentBlock = {
      type: "table",
      data: {
        columnCount: 100,
        rows: Array.from({ length: 101 }, () => ({ cells: [] })),
      },
    };

    const result = buildOutOfTableSequence(
      schema,
      [oversized],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("한도 초과가 거절되지 않음");
    expect(result.error.code).toBe("CELL_LIMIT_EXCEEDED");
  });

  // 완료 조건 1(Issue #143 (b), DELTA-02): 목록 항목은 항상 완전한
  // blockContainer(blockContent, blockGroup?(children…)) 트리로 조립된다 —
  // 문단/heading의 bare + appendTransaction 사후 배정에 기대지 않는다.
  it("목록 항목은 blockContainer(content, blockGroup?(children)) 트리로 조립된다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [bulletItemBlock("a"), bulletItemBlock("b", [bulletItemBlock("c")])],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const [a, b] = result.value.nodes;
    expect(a?.type.name).toBe("blockContainer");
    expect(a?.childCount).toBe(1);
    expect(a?.child(0).type.name).toBe("bulletListItem");
    expect(a?.child(0).textContent).toBe("a");

    expect(b?.type.name).toBe("blockContainer");
    expect(b?.child(0).type.name).toBe("bulletListItem");
    expect(b?.child(0).textContent).toBe("b");
    expect(b?.child(1).type.name).toBe("blockGroup");
    const nested = b?.child(1).child(0);
    expect(nested?.type.name).toBe("blockContainer");
    expect(nested?.child(0).type.name).toBe("bulletListItem");
    expect(nested?.child(0).textContent).toBe("c");
  });

  it("목록 항목마다 고유한 blockId를 받는다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [bulletItemBlock("a"), bulletItemBlock("b", [bulletItemBlock("c")])],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const [a, b] = result.value.nodes;
    const nestedId = b?.child(1).child(0).attrs.blockId;
    const ids = [a?.attrs.blockId, b?.attrs.blockId, nestedId];
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect((id as string).length).toBeGreaterThan(0);
    }
  });

  // 완료 조건 2: numberedListItem의 startNumber가 attrs에 정확히
  // 반영된다(model-to-tiptap.ts의 blockContentToTiptapJson과 같은 attrs
  // 계약 — startNumber: block.startNumber ?? null).
  it("numberedListItem의 startNumber가 attrs에 반영된다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [numberedItemBlock("x", { startNumber: 3 })],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.nodes[0]?.child(0).attrs.startNumber).toBe(3);
  });

  it("startNumber가 없는 numberedListItem은 attrs가 null이다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [numberedItemBlock("x")],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.nodes[0]?.child(0).attrs.startNumber).toBeNull();
  });

  // Issue #343: 클립보드 블록의 자기 style 색은 blockContainer attrs로
  // 옮긴다(model-to-tiptap.ts blockToTiptapJson과 같은 attrs 이름).
  it("문단과 heading의 블록 색은 blockContainer attrs에 실린다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [
        clipParagraph([{ text: "p" }], { textColor: "#0000FF" }),
        clipHeading(2, [{ text: "h" }], { backgroundColor: "#FFFF00" }),
      ],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const [p, h] = result.value.nodes;
    expect(p?.attrs.textColor).toBe("#0000FF");
    expect(p?.attrs.backgroundColor).toBeNull();
    expect(h?.attrs.textColor).toBeNull();
    expect(h?.attrs.backgroundColor).toBe("#FFFF00");
    // blockId 사후 배정 관례는 그대로다.
    expect(p?.attrs.blockId).toBeFalsy();
    expect(h?.attrs.blockId).toBeFalsy();
  });

  it("목록 항목과 중첩 child 문단·heading·목록 항목의 블록 색이 blockContainer attrs에 실린다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [
        clipBullet([{ text: "item" }], {
          textColor: "#FF0000",
          children: [
            clipParagraph([{ text: "p" }], { backgroundColor: "#00FF00" }),
            clipHeading(3, [{ text: "h" }], { textColor: "#0000FF" }),
            clipNumbered([{ text: "n" }], {
              textColor: "#123456",
              backgroundColor: "#ABCDEF",
            }),
          ],
        }),
      ],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const item = result.value.nodes[0];
    expect(item?.attrs.textColor).toBe("#FF0000");
    expect(item?.attrs.backgroundColor).toBeNull();
    const group = item?.child(1);
    expect(group?.type.name).toBe("blockGroup");
    expect(group?.child(0).attrs.textColor).toBeNull();
    expect(group?.child(0).attrs.backgroundColor).toBe("#00FF00");
    expect(group?.child(1).attrs.textColor).toBe("#0000FF");
    expect(group?.child(1).attrs.backgroundColor).toBeNull();
    expect(group?.child(2).attrs.textColor).toBe("#123456");
    expect(group?.child(2).attrs.backgroundColor).toBe("#ABCDEF");
  });

  it("색 없는 문단·heading·목록 항목의 blockContainer 색 attrs는 null이다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [
        paragraphBlock("p"),
        headingBlock("h", 1),
        bulletItemBlock("b", [paragraphBlock("c")]),
      ],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const [p, h, b] = result.value.nodes;
    const child = b?.child(1).child(0);
    for (const container of [p, h, b, child]) {
      expect(container?.attrs.textColor).toBeNull();
      expect(container?.attrs.backgroundColor).toBeNull();
    }
  });

  // 범위 밖(DELTA-02): 목록 항목 children 안에 중첩된 표는 firstTable
  // 추적 대상이 아니다 — 최상위 시퀀스의 첫 표만 추적하는 기존 동작을
  // 유지한다.
  it("목록 항목 children 안 표는 firstTable 추적 대상이 아니다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [bulletItemBlock("intro", [tableBlock("A")])],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    expect(result.value.firstTable).toBeNull();
  });
});

// Issue #351: 클립보드 파서는 li 안 pre·hr를 목록 항목의 자식 codeBlock·divider로
// 만든다. 최상위에는 이 두 타입이 오지 않는다.
describe("buildOutOfTableSequence의 codeBlock·divider 자식 블록 (Issue #351)", () => {
  it("목록 항목 자식 codeBlock은 blockContainer 안 codeBlock 노드가 된다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [
        bulletItemBlock("item", [
          clipCodeBlock("a\n  b", { language: "typescript" }),
        ]),
      ],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const group = result.value.nodes[0]?.child(1);
    expect(group?.type.name).toBe("blockGroup");
    const container = group?.child(0);
    expect(container?.type.name).toBe("blockContainer");
    expect(container?.attrs.blockId).toBeTruthy();
    const codeNode = container?.child(0);
    expect(codeNode?.type.name).toBe("codeBlock");
    expect(codeNode?.attrs.language).toBe("typescript");
    expect(codeNode?.textContent).toBe("a\n  b");
  });

  it("language가 없는 codeBlock은 language attr이 null이다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [bulletItemBlock("item", [clipCodeBlock("x")])],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const codeNode = result.value.nodes[0]?.child(1).child(0).child(0);
    expect(codeNode?.attrs.language).toBeNull();
  });

  it("목록 항목 자식 divider는 컨테이너 없이 blockId를 가진 divider 노드가 된다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [bulletItemBlock("item", [clipDivider()])],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const divider = result.value.nodes[0]?.child(1).child(0);
    expect(divider?.type.name).toBe("divider");
    expect(divider?.attrs.blockId).toBeTruthy();
  });

  it("codeBlock과 divider와 문단이 섞인 자식은 순서를 지킨다", () => {
    const result = buildOutOfTableSequence(
      schema,
      [
        bulletItemBlock("item", [
          clipCodeBlock("c"),
          clipDivider(),
          paragraphBlock("p"),
        ]),
      ],
      sequentialIds("id"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("조립 실패");
    const group = result.value.nodes[0]?.child(1);
    expect(group?.childCount).toBe(3);
    expect(group?.child(0).child(0).type.name).toBe("codeBlock");
    expect(group?.child(1).type.name).toBe("divider");
    expect(group?.child(2).child(0).type.name).toBe("paragraph");
  });

  it.each([
    ["codeBlock", clipCodeBlock("x")],
    ["divider", clipDivider()],
  ])("최상위 %s는 CLIPBOARD_CONTENT_INVALID로 거절한다", (_name, block) => {
    const result = buildOutOfTableSequence(
      schema,
      [paragraphBlock("p"), block],
      sequentialIds("id"),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CLIPBOARD_CONTENT_INVALID",
        message: expect.stringContaining(block.type),
      },
    });
  });
});
