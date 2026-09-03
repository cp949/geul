/**
 * Issue #125 — moveBlockBefore/duplicateBlock의 하위 트리 인지 계약을
 * 검증한다. 자기 자손 이동 거절(D2), 깊이 64 초과 사전 거절(D3), 임의
 * 목적지(다른 부모의 children 목록·최상위 문서 끝) 이동과 표 포함 이동
 * (D1·D5·D8), duplicateBlock의 재귀 id 재발급(하위 트리 안 표의 내부 id
 * 포함, D6·D7)과 undo 1회 복원(D4)을 다룬다. leaf 블록·divider의 기존 계약과
 * 표 직접 duplicate 거절(D8) 유지는 각각 editor-controller-blocks.test.ts·
 * editor-controller-divider-commands.test.ts·editor-controller-table.test.ts가
 * 계속 소유한다 — 이 파일은 하위 트리가 실제로 관여하는 시나리오만 담는다.
 */
import type { Block, Document, TableBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

/**
 * 깊이 ids.length인 단일 사슬 하위 트리를 만든다. ids[0]이 사슬의 루트,
 * 마지막 요소가 사슬의 가장 깊은 leaf다 — 각 레벨은 자식을 정확히 하나만
 * 가진다. D3(깊이 사전 판정) fixture가 임의 깊이의 목적지·소스 하위 트리를
 * 조립하는 데 쓴다.
 */
const buildChain = (ids: readonly string[]): Block => {
  const [rootId, ...rest] = ids;
  if (rootId === undefined) {
    throw new Error("체인 fixture는 최소 1개 id가 필요하다");
  }
  const root: Block = {
    id: rootId,
    type: "paragraph",
    content: [{ text: rootId }],
  };
  if (rest.length === 0) return root;
  return { ...root, children: [buildChain(rest)] };
};

const idsFor = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);

/**
 * column/row/cell id를 호출부가 직접 지정하는 1x1 표 블록. 문서 안에 표를
 * 두 개 이상 둘 때 editor-controller-support.ts의 oneCellTableBlock(고정
 * id: col-1/row-1/cell-1)을 재사용하면 표끼리 내부 id가 충돌한다 — D7·D5
 * fixture는 항상 이 빌더로 서로 다른 내부 id를 명시한다.
 */
const tableBlock = (
  id: string,
  colId: string,
  rowId: string,
  cellId: string,
): TableBlock => ({
  id,
  type: "table",
  columns: [{ id: colId, width: 160 }],
  rows: [
    {
      id: rowId,
      cells: [
        {
          id: cellId,
          columnId: colId,
          rowSpan: 1,
          columnSpan: 1,
          content: [],
        },
      ],
    },
  ],
  headerRows: 0,
  headerColumns: 0,
});

/** blocks 트리를 재귀로 훑어 첫 표 블록을 찾는다. 없으면 null이다. */
const findTableBlockOrNull = (blocks: readonly Block[]): TableBlock | null => {
  for (const block of blocks) {
    if (block.type === "table") return block;
    if ("children" in block && block.children !== undefined) {
      const found = findTableBlockOrNull(block.children);
      if (found !== null) return found;
    }
  }
  return null;
};

/** findTableBlockOrNull의 던지는 버전 — fixture 준비 실패를 조기에 드러낸다. */
const findTableBlock = (blocks: readonly Block[]): TableBlock => {
  const found = findTableBlockOrNull(blocks);
  if (found === null) throw new Error("표 블록을 찾지 못했다");
  return found;
};

describe("moveBlockBefore 하위 트리 계약(Issue #125)", () => {
  it("자식이 있는 블록을 자기 자손 앞으로 이동하면 COMMAND_NOT_APPLICABLE이고 문서를 바꾸지 않는다(D2)", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent-1",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [
            {
              id: "child-1",
              type: "paragraph",
              content: [{ text: "child" }],
              children: [
                {
                  id: "grandchild-1",
                  type: "paragraph",
                  content: [{ text: "grandchild" }],
                },
              ],
            },
          ],
        },
        tailParagraphBlock,
      ],
    };
    const editor = createEditor({ initialDocument });
    const before = editor.getDocument();

    // 직계 자손(child-1)과 더 깊은 자손(grandchild-1) 둘 다 거절돼야 한다 —
    // 재귀 판정임을 확인한다.
    expect(editor.commands.moveBlockBefore("parent-1", "child-1")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
    });
    expect(editor.commands.moveBlockBefore("parent-1", "grandchild-1")).toEqual(
      {
        ok: false,
        error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
      },
    );
    expect(editor.getDocument()).toEqual(before);
  });

  it("이동 후 최심부가 MAX_NESTING_DEPTH(64)를 넘으면 mutation 전에 거절하고 문서를 바꾸지 않는다(D3)", () => {
    // 목적지(d-1..d-63)는 깊이 63, 소스(s-1..s-5)는 자기 자신 아래 4레벨을
    // 더 가진 하위 트리(subtreeHeight=4)다 — 이동하면 최심부가 63+4=67로
    // MAX_NESTING_DEPTH(64)를 크게 넘는다.
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        buildChain(idsFor("d", 63)),
        buildChain(idsFor("s", 5)),
        tailParagraphBlock,
      ],
    };
    const editor = createEditor({ initialDocument });
    const before = editor.getDocument();

    expect(editor.commands.moveBlockBefore("s-1", "d-63")).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "moveBlockBefore" },
    });
    expect(editor.getDocument()).toEqual(before);
  });

  it("이동 후 최심부가 정확히 MAX_NESTING_DEPTH(64)면 성공한다(D3 경계)", () => {
    // 목적지(e-1..e-60)는 깊이 60, 소스(f-1..f-4)는 subtreeHeight=3 — 이동
    // 결과 최심부는 정확히 60+3=64로 상한과 같다.
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        buildChain(idsFor("e", 60)),
        buildChain(idsFor("f", 4)),
        tailParagraphBlock,
      ],
    };
    const editor = createEditor({ initialDocument });

    expect(editor.commands.moveBlockBefore("f-1", "e-60")).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("다른 부모의 children 목록 임의 위치로 하위 트리를 동반 이동한다(D1a) — undo 1회로 복원된다", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "source-1",
          type: "paragraph",
          content: [{ text: "source" }],
          children: [
            {
              id: "source-1a",
              type: "paragraph",
              content: [{ text: "source child" }],
            },
          ],
        },
        {
          id: "dest-1",
          type: "paragraph",
          content: [{ text: "dest" }],
          children: [
            {
              id: "dest-1a",
              type: "paragraph",
              content: [{ text: "dest child" }],
            },
          ],
        },
        tailParagraphBlock,
      ],
    };
    const editor = createEditor({ initialDocument });
    const before = editor.getDocument();

    expect(editor.commands.moveBlockBefore("source-1", "dest-1a")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toMatchObject([
      {
        id: "dest-1",
        children: [
          { id: "source-1", children: [{ id: "source-1a" }] },
          { id: "dest-1a" },
        ],
      },
      { id: "tail" },
    ]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    // undo도 revision을 새로 증가시킨다(commitDocument가 reason과 무관하게
    // sessionRevision을 1 올린다) — 복원 비교는 blocks만 본다.
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("beforeBlockId가 null이면 중첩 하위 트리를 최상위 문서 끝으로 승격하고 빈 blockGroup을 남기지 않는다(D1b, R2) — undo 1회로 복원된다", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "host-1",
          type: "paragraph",
          content: [{ text: "host" }],
          children: [
            {
              id: "nested-1",
              type: "paragraph",
              content: [{ text: "nested" }],
              children: [
                {
                  id: "nested-1a",
                  type: "paragraph",
                  content: [{ text: "nested child" }],
                },
              ],
            },
          ],
        },
        tailParagraphBlock,
      ],
    };
    const editor = createEditor({
      initialDocument,
      createId: sequentialIds("gen"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const before = editor.getDocument();

    expect(editor.commands.moveBlockBefore("nested-1", null)).toEqual({
      ok: true,
      value: undefined,
    });
    const document = editor.getDocument();
    // nested-1(자식 딸린 블록)이 새 최상위 마지막 블록이 되므로, 같은
    // dispatch 안에서 UI-010 trailing paragraph(gen-1)가 함께 붙는다(D1b는
    // "최상위 승격"만 요구하고 trailing 불변식은 건드리지 않는다).
    expect(document.blocks).toMatchObject([
      { id: "host-1" },
      { id: "tail" },
      { id: "nested-1", children: [{ id: "nested-1a" }] },
      { id: "gen-1", type: "paragraph", content: [] },
    ]);
    expect(document.blocks[0]).not.toHaveProperty("children");

    // host-1은 유일한 자식(nested-1)을 잃어 자기 blockGroup이 사라진다 —
    // nested-1 자신은 여전히 nested-1a를 데리고 있어 그 하위 트리의
    // blockGroup 1개(nested-1 자신의 것)는 남는다. 0개가 아니라 정확히
    // 1개임을 확인해 "host-1의 그룹만 없어졌다"를 "문서 전체에 그룹이
    // 없다"와 혼동하지 않는다.
    let groupCount = 0;
    tiptap.state.doc.descendants((node) => {
      if (node.type.name === "blockGroup") groupCount += 1;
      return true;
    });
    expect(groupCount).toBe(1);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("표를 소스로 같은 부모 형제 간 이동이 성공한다(D5) — undo 1회로 복원된다", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        tableBlock("table-1", "col-1", "row-1", "cell-1"),
        tableBlock("table-2", "col-2", "row-2", "cell-2"),
        tailParagraphBlock,
      ],
    };
    const editor = createEditor({ initialDocument });
    const before = editor.getDocument();

    expect(editor.commands.moveBlockBefore("table-2", "table-1")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "table-2",
      "table-1",
      "tail",
    ]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("표를 다른 블록의 자식으로 넣는 cross-parent 이동이 성공한다(D5·D8) — undo 1회로 복원된다", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "host-1",
          type: "paragraph",
          content: [{ text: "host" }],
          children: [
            { id: "child-1", type: "paragraph", content: [{ text: "child" }] },
          ],
        },
        tableBlock("table-1", "col-1", "row-1", "cell-1"),
        tailParagraphBlock,
      ],
    };
    const editor = createEditor({ initialDocument });
    const before = editor.getDocument();

    expect(editor.commands.moveBlockBefore("table-1", "child-1")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(editor.getDocument().blocks).toMatchObject([
      {
        id: "host-1",
        children: [{ id: "table-1", type: "table" }, { id: "child-1" }],
      },
      { id: "tail" },
    ]);

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });
});

describe("duplicateBlock 하위 트리 계약(Issue #125)", () => {
  it("자식이 있는 블록을 duplicateBlock하면 하위 트리 전체를 복제하고 모든 blockId를 재귀적으로 재발급한다(D6) — undo 1회로 복원된다", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent-1",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [
            {
              id: "child-1",
              type: "paragraph",
              content: [{ text: "child one" }],
            },
            {
              id: "child-2",
              type: "paragraph",
              content: [{ text: "child two" }],
              children: [
                {
                  id: "grandchild-1",
                  type: "paragraph",
                  content: [{ text: "grandchild" }],
                },
              ],
            },
          ],
        },
        tailParagraphBlock,
      ],
    };
    const editor = createEditor({
      initialDocument,
      createId: sequentialIds("dup"),
    });

    expect(editor.commands.duplicateBlock("parent-1")).toEqual({
      ok: true,
      value: { blockId: "dup-1" },
    });
    const document = editor.getDocument();
    expect(document.blocks[1]).toMatchObject({
      id: "dup-1",
      content: [{ text: "parent" }],
      children: [
        { id: "dup-2", content: [{ text: "child one" }] },
        {
          id: "dup-3",
          content: [{ text: "child two" }],
          children: [{ id: "dup-4", content: [{ text: "grandchild" }] }],
        },
      ],
    });
    // 원본은 id·구조 모두 그대로 보존된다.
    expect(document.blocks[0]).toMatchObject({
      id: "parent-1",
      children: [
        { id: "child-1" },
        { id: "child-2", children: [{ id: "grandchild-1" }] },
      ],
    });

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toMatchObject([
      {
        id: "parent-1",
        children: [
          { id: "child-1" },
          { id: "child-2", children: [{ id: "grandchild-1" }] },
        ],
      },
      { id: "tail" },
    ]);
  });

  it("복제되는 하위 트리 안 표의 column/row/cell id도 재귀적으로 재발급한다(D7)", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent-1",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [tableBlock("table-1", "col-1", "row-1", "cell-1")],
        },
        tailParagraphBlock,
      ],
    };
    const editor = createEditor({
      initialDocument,
      createId: sequentialIds("dup"),
    });

    expect(editor.commands.duplicateBlock("parent-1")).toEqual({
      ok: true,
      value: { blockId: "dup-1" },
    });
    const document = editor.getDocument();
    const originalTable = findTableBlock(
      document.blocks[0]?.type === "paragraph"
        ? (document.blocks[0].children ?? [])
        : [],
    );
    const duplicatedTable = findTableBlock(
      document.blocks[1]?.type === "paragraph"
        ? (document.blocks[1].children ?? [])
        : [],
    );

    // 원본 표는 id가 그대로다.
    expect(originalTable).toMatchObject({
      id: "table-1",
      columns: [{ id: "col-1" }],
      rows: [{ id: "row-1", cells: [{ id: "cell-1", columnId: "col-1" }] }],
    });
    // 복제된 표는 자기 blockId뿐 아니라 column/row/cell id도 원본과
    // 겹치지 않는 새 id를 받는다.
    expect(duplicatedTable.id).not.toBe("table-1");
    expect(duplicatedTable.columns[0]?.id).not.toBe("col-1");
    expect(duplicatedTable.rows[0]?.id).not.toBe("row-1");
    expect(duplicatedTable.rows[0]?.cells[0]?.id).not.toBe("cell-1");
    // 셀의 columnId는 재발급된 새 column id를 정확히 가리킨다(참조 무결성).
    expect(duplicatedTable.rows[0]?.cells[0]?.columnId).toBe(
      duplicatedTable.columns[0]?.id,
    );
  });

  it("하위 트리 복제 도중 id가 고갈되면 RangeError를 던지고 문서·revision을 보존한다(완료 조건 6)", () => {
    const initialDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "parent-1",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [
            { id: "child-1", type: "paragraph", content: [{ text: "child" }] },
          ],
        },
        tailParagraphBlock,
      ],
    };
    // 첫 호출(루트 복제본 id)만 유일한 값을 내주고, 그 뒤로는 이미 점유된
    // "child-1"만 반환한다 — 자식 id 재발급 단계(재귀 두 번째 takeId 호출)에서
    // 100회 재시도가 소진돼 RangeError를 던진다. 이 실패는 runDocumentCommand의
    // run() 콜백 "안"(dispatch 이전)에서 일어나지만, dispatch 전이라 여전히
    // 문서를 바꾸지 않는다(G-EDT-001).
    let calls = 0;
    const editor = createEditor({
      initialDocument,
      createId: () => {
        calls += 1;
        return calls === 1 ? "root-copy" : "child-1";
      },
    });
    const before = editor.getDocument();

    expect(() => editor.commands.duplicateBlock("parent-1")).toThrow(
      new RangeError(
        "createId failed to return a valid unique document id after 100 attempts",
      ),
    );
    expect(editor.getDocument()).toEqual(before);
    expect(editor.getDocument().revision).toBe(0);
  });
});
