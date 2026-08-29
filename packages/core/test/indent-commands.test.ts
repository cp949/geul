/**
 * indentBlockCommand/outdentBlockCommand(형제↔자식 이동)를 검증한다. 신규
 * 명령이라 기존 결함 characterization은 없고, 완료 조건 1~9 각각의 동작과
 * 그 조건을 지게 만드는 변이(표 건너뛰기 오거절, 후행 형제 입양, 깊이 상한
 * 미가드, 빈 blockGroup 잔존)를 함께 다룬다. 표 명령
 * 파일(table-commands.test.ts)과 같은 격리 fixture(table-test-support.ts의
 * createTableFixtureEditor)를 그대로 쓴다 — indentBlockCommand/
 * outdentBlockCommand도 mergeTableCells와 같은 "Editor를 받아 스스로
 * dispatch하는 순수 함수" 형태이기 때문이다.
 */
import { MAX_NESTING_DEPTH, parseDocument } from "@cp949/geul-model";
import type { JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import {
  getBlockNestingActionState,
  indentBlockCommand,
  outdentBlockCommand,
} from "../src/indent-commands.js";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import { sequentialIds } from "./editor-controller-support.js";
import {
  cellJson,
  createTableFixtureEditor,
  docWithParagraph,
} from "./table-test-support.js";

/** doc.content[index]를 꺼낸다 — 없으면 fixture 준비 실패로 간주해 던진다. */
const childAt = (node: TiptapJsonNode, index: number): TiptapJsonNode => {
  const child = node.content?.[index];
  if (child === undefined) throw new Error(`child ${index} not found`);
  return child;
};

/** 노드의 blockId attr을 꺼낸다 — 없으면 fixture/결과 검증 실패로 던진다. */
const blockIdOf = (node: TiptapJsonNode): string => {
  const blockId = node.attrs?.blockId;
  if (typeof blockId !== "string") throw new Error("blockId missing");
  return blockId;
};

/** blockId를 가진 blockContainer 하나(자식 없는 leaf)의 tiptap JSON. */
const containerJson = (blockId: string, text: string): JSONContent => ({
  type: "blockContainer",
  attrs: { blockId },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/** children을 가진 blockGroup까지 포함한 blockContainer의 tiptap JSON. */
const containerWithGroupJson = (
  blockId: string,
  text: string,
  children: JSONContent[],
): JSONContent => ({
  type: "blockContainer",
  attrs: { blockId },
  content: [
    { type: "paragraph", content: [{ type: "text", text }] },
    { type: "blockGroup", content: children },
  ],
});

/** blockId를 가진 1행 1열 표 하나의 tiptap JSON. */
const tableJson = (blockId: string): JSONContent => ({
  type: "table",
  attrs: {
    blockId,
    columns: [{ id: "col-1", width: 160 }],
    headerRows: 0,
    headerColumns: 0,
  },
  content: [
    {
      type: "tableRow",
      attrs: { rowId: "row-1" },
      content: [cellJson("cell-1", "col-1")],
    },
  ],
});

/**
 * levels단 체인 문서를 만든다 — chain-1이 최상위, chain-<levels>가 그
 * blockGroup에 leafSiblings를 담는 가장 깊은 컨테이너다. leafSiblings는
 * chain-<levels>의 자식이라 모델 깊이 levels+1에 놓인다(완료 조건 8의 깊이
 * 상한 재현용).
 */
const buildDeepChainDoc = (
  levels: number,
  leafSiblings: JSONContent[],
): JSONContent => {
  let content: JSONContent[] = leafSiblings;
  for (let level = levels; level >= 1; level -= 1) {
    content = [
      containerWithGroupJson(`chain-${level}`, `chain ${level}`, content),
    ];
  }
  const root = content[0];
  if (root === undefined) throw new Error("chain fixture 준비 실패");
  return root;
};

type NestedFixtureBlock = {
  id: string;
  type: "paragraph";
  content: [];
  children?: NestedFixtureBlock[];
};

/**
 * model 계층(children 필드) 기준 depth단 체인 블록 하나를 만든다.
 * packages/model/test/document-nesting.test.ts의 buildNestedChainDocument와
 * 같은 모양이지만, 이 파일 전용 재현(완료 조건 8의 자기 왕복 실패 증거)이라
 * 로컬로 둔다(G-TST-002 — 공용화는 두 번째 사용처가 생길 때 판단).
 */
const buildNestedModelChain = (depth: number): NestedFixtureBlock => {
  let innermost: NestedFixtureBlock = {
    id: `deep-${depth}`,
    type: "paragraph",
    content: [],
  };
  for (let level = depth - 1; level >= 1; level -= 1) {
    innermost = {
      id: `deep-${level}`,
      type: "paragraph",
      content: [],
      children: [innermost],
    };
  }
  return innermost;
};

describe("indentBlock", () => {
  it("첫 형제·중첩 불가 직전 형제·깊이 상한에서는 들여쓰기를 불가로 판정한다", () => {
    const firstEditor = createTableFixtureEditor({
      type: "doc",
      content: [containerJson("p1", "one"), containerJson("p2", "two")],
    });
    expect(getBlockNestingActionState(firstEditor.state.doc, "p1")).toEqual({
      canIndent: false,
      canOutdent: false,
    });

    const tableEditor = createTableFixtureEditor({
      type: "doc",
      content: [tableJson("table-1"), containerJson("p1", "one")],
    });
    expect(getBlockNestingActionState(tableEditor.state.doc, "p1")).toEqual({
      canIndent: false,
      canOutdent: false,
    });

    const chainLevels = MAX_NESTING_DEPTH - 1;
    const deepEditor = createTableFixtureEditor({
      type: "doc",
      content: [
        buildDeepChainDoc(chainLevels, [
          containerJson(`chain-${MAX_NESTING_DEPTH}`, "sibling"),
          containerJson("target", "target"),
        ]),
      ],
    });
    expect(getBlockNestingActionState(deepEditor.state.doc, "target")).toEqual({
      canIndent: false,
      canOutdent: true,
    });
  });

  it("존재하지 않는 블록은 들여쓰기와 내어쓰기를 모두 불가로 판정한다", () => {
    const editor = createTableFixtureEditor(docWithParagraph);

    expect(
      getBlockNestingActionState(editor.state.doc, "no-such-block"),
    ).toEqual({ canIndent: false, canOutdent: false });
  });

  it("바로 앞 형제(컨테이너)의 자식으로 대상을 이동한다 — 자식 딸린 대상은 하위 트리째, undo 1회로 복원", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        containerJson("p1", "one"),
        containerWithGroupJson("p2", "two", [containerJson("c1", "child")]),
      ],
    });
    const before = editor.getJSON() as TiptapJsonNode;

    const result = indentBlockCommand(editor, "p2");

    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(1);
    const p1 = childAt(doc, 0);
    expect(blockIdOf(p1)).toBe("p1");
    const p1Group = childAt(p1, 1);
    expect(p1Group.type).toBe("blockGroup");
    const p2 = childAt(p1Group, 0);
    expect(blockIdOf(p2)).toBe("p2");
    // p2 자신의 자식(c1)이 하위 트리째 따라왔다.
    const p2Group = childAt(p2, 1);
    expect(p2Group.type).toBe("blockGroup");
    expect(blockIdOf(childAt(p2Group, 0))).toBe("c1");

    editor.commands.undo();
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("바로 앞 형제가 없으면(첫 자식/문서 첫 블록) COMMAND_NOT_APPLICABLE", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [containerJson("p1", "one"), containerJson("p2", "two")],
    });
    const before = editor.getJSON();

    const result = indentBlockCommand(editor, "p1");

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "indentBlock" },
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("존재하지 않는 blockId는 BLOCK_NOT_FOUND", () => {
    const editor = createTableFixtureEditor(docWithParagraph);

    const result = indentBlockCommand(editor, "no-such-block");

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "no-such-block" },
    });
  });

  it("TableBlock도 indent 대상이 된다 — 앞 형제 컨테이너의 자식이 된다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [containerJson("p1", "one"), tableJson("table-1")],
    });

    const result = indentBlockCommand(editor, "table-1");

    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(1);
    const p1 = childAt(doc, 0);
    const group = childAt(p1, 1);
    expect(group.type).toBe("blockGroup");
    const movedTable = childAt(group, 0);
    expect(movedTable.type).toBe("table");
    expect(blockIdOf(movedTable)).toBe("table-1");
  });

  it("바로 앞 형제가 TableBlock이면 COMMAND_NOT_APPLICABLE, 문서 무변경(D9)", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [tableJson("table-1"), containerJson("p1", "one")],
    });
    const before = editor.getJSON();

    const result = indentBlockCommand(editor, "p1");

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "indentBlock" },
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("[p1,(p1자식)table,p2]에서 p2의 indent는 성공한다 — 직전 형제는 p1이지 표가 아니다(오거절 검출)", () => {
    // p1의 blockGroup 안에 table이 이미 자식으로 들어 있다 — 문서 순서로는
    // table이 p2 바로 앞이지만, p2의 진짜 형제(같은 blockGroup/최상위 목록의
    // 이웃)는 p1이다. "직전 문서 순서 노드"로 판정하면 이 케이스가 거절돼야
    // 하는데, 그러면 이 테스트가 실패한다.
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        containerWithGroupJson("p1", "one", [tableJson("table-1")]),
        containerJson("p2", "two"),
      ],
    });

    const result = indentBlockCommand(editor, "p2");

    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(1);
    const p1 = childAt(doc, 0);
    const group = childAt(p1, 1);
    expect(group.content).toHaveLength(2);
    expect(childAt(group, 0).type).toBe("table");
    expect(blockIdOf(childAt(group, 1))).toBe("p2");
  });

  it("결과 최대 깊이(대상 depth + 하위 트리 높이)가 64를 초과하면 COMMAND_NOT_APPLICABLE, 문서 무변경", () => {
    // chain-1..chain-(MAX_NESTING_DEPTH-1)이 target을 MAX_NESTING_DEPTH(64)
    // 깊이에 놓는다 — 이미 상한에 있어 한 단 더 들어가면 65가 된다.
    const chainLevels = MAX_NESTING_DEPTH - 1;
    const doc = {
      type: "doc",
      content: [
        buildDeepChainDoc(chainLevels, [
          containerJson(`chain-${MAX_NESTING_DEPTH}`, "sibling"),
          containerJson("target", "target"),
        ]),
      ],
    };
    const editor = createTableFixtureEditor(doc);
    const before = editor.getJSON();

    const result = indentBlockCommand(editor, "target");

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "indentBlock" },
    });
    expect(editor.getJSON()).toEqual(before);

    // 통합 변이: 가드 없이 이 indent를 허용했다면 target은 깊이
    // MAX_NESTING_DEPTH+1에 놓인다 — 그 모양(model children 체인)을 그대로
    // parseDocument에 넣으면 DOCUMENT_LIMIT_EXCEEDED로 거절돼야 한다(자기
    // 왕복 실패 재현).
    const overLimit = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [buildNestedModelChain(MAX_NESTING_DEPTH + 1)],
    });
    expect(overLimit).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_LIMIT_EXCEEDED" },
    });
  });

  it("비축약 역방향 텍스트 선택의 오프셋과 방향을 들여쓰기 뒤 복원한다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [containerJson("p1", "one"), containerJson("p2", "second text")],
    });
    const beforePosition = findBlockPosition(editor.state.doc, "p2");
    if (beforePosition === null) throw new Error("p2 위치를 찾지 못했다");
    editor.commands.setTextSelection({
      from: beforePosition + 2,
      to: beforePosition + 8,
    });
    const forward = editor.state.selection;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, forward.head, forward.anchor),
      ),
    );
    const beforeAnchorOffset = editor.state.selection.anchor - beforePosition;
    const beforeHeadOffset = editor.state.selection.head - beforePosition;

    const result = indentBlockCommand(editor, "p2");

    expect(result.ok).toBe(true);
    const afterPosition = findBlockPosition(editor.state.doc, "p2");
    if (afterPosition === null) throw new Error("이동한 p2 위치를 찾지 못했다");
    expect(editor.state.selection.empty).toBe(false);
    expect(editor.state.selection.anchor - afterPosition).toBe(
      beforeAnchorOffset,
    );
    expect(editor.state.selection.head - afterPosition).toBe(beforeHeadOffset);
    expect(editor.state.selection.anchor).toBeGreaterThan(
      editor.state.selection.head,
    );
  });
});

describe("outdentBlock", () => {
  it("최상위(부모 없는) 블록은 COMMAND_NOT_APPLICABLE", () => {
    const editor = createTableFixtureEditor(docWithParagraph);
    const before = editor.getJSON();

    const result = outdentBlockCommand(editor, "para-1");

    expect(result).toEqual({
      ok: false,
      error: { code: "COMMAND_NOT_APPLICABLE", command: "outdentBlock" },
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("존재하지 않는 blockId는 BLOCK_NOT_FOUND", () => {
    const editor = createTableFixtureEditor(docWithParagraph);

    const result = outdentBlockCommand(editor, "no-such-block");

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "no-such-block" },
    });
  });

  it("대상을 부모의 다음 형제로 lift한다 — 자식 딸린 대상은 하위 트리째, 후행 형제는 원 부모에 남는다, undo 1회로 복원", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        containerWithGroupJson("p1", "parent", [
          containerWithGroupJson("c1", "c1", [containerJson("c1a", "c1a")]),
          containerJson("c2", "c2"),
        ]),
      ],
    });
    const before = editor.getJSON() as TiptapJsonNode;

    const result = outdentBlockCommand(editor, "c1");

    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(2);

    // p1은 후행 형제(c2)만 자기 blockGroup에 남겨 그대로 부모다 — c2를
    // c1의 자식으로 입양하지 않는다.
    const p1 = childAt(doc, 0);
    expect(blockIdOf(p1)).toBe("p1");
    const p1Group = childAt(p1, 1);
    expect(p1Group.content).toHaveLength(1);
    expect(blockIdOf(childAt(p1Group, 0))).toBe("c2");

    // c1은 p1의 다음 형제로 나왔고, 자신의 자식(c1a)은 하위 트리째 따라왔다.
    const c1 = childAt(doc, 1);
    expect(blockIdOf(c1)).toBe("c1");
    const c1Group = childAt(c1, 1);
    expect(blockIdOf(childAt(c1Group, 0))).toBe("c1a");

    editor.commands.undo();
    expect(editor.getJSON() as TiptapJsonNode).toEqual(before);
  });

  it("TableBlock 대상 outdent가 동작한다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [containerWithGroupJson("p1", "parent", [tableJson("table-1")])],
    });

    const result = outdentBlockCommand(editor, "table-1");

    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(2);
    expect(blockIdOf(childAt(doc, 0))).toBe("p1");
    expect(childAt(doc, 1).type).toBe("table");
    expect(blockIdOf(childAt(doc, 1))).toBe("table-1");
  });

  it("비축약 텍스트 선택의 오프셋을 내어쓰기 뒤 복원한다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        containerWithGroupJson("p1", "parent", [
          containerJson("c1", "child text"),
        ]),
      ],
    });
    const beforePosition = findBlockPosition(editor.state.doc, "c1");
    if (beforePosition === null) throw new Error("c1 위치를 찾지 못했다");
    editor.commands.setTextSelection({
      from: beforePosition + 2,
      to: beforePosition + 7,
    });
    const beforeAnchorOffset = editor.state.selection.anchor - beforePosition;
    const beforeHeadOffset = editor.state.selection.head - beforePosition;

    const result = outdentBlockCommand(editor, "c1");

    expect(result.ok).toBe(true);
    const afterPosition = findBlockPosition(editor.state.doc, "c1");
    if (afterPosition === null) throw new Error("이동한 c1 위치를 찾지 못했다");
    expect(editor.state.selection.empty).toBe(false);
    expect(editor.state.selection.anchor - afterPosition).toBe(
      beforeAnchorOffset,
    );
    expect(editor.state.selection.head - afterPosition).toBe(beforeHeadOffset);
  });

  it("outdent로 부모의 blockGroup이 비면 그룹 노드가 제거되고 문서가 스키마-유효하다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        containerWithGroupJson("p1", "parent", [containerJson("c1", "child")]),
      ],
    });

    const result = outdentBlockCommand(editor, "c1");

    expect(result.ok).toBe(true);
    const doc = editor.getJSON() as TiptapJsonNode;
    expect(doc.content).toHaveLength(2);
    // p1은 이제 blockContent 하나뿐이다 — 빈 blockGroup이 남지 않았다
    // ("block+"는 빈 그룹을 금지한다).
    const p1 = childAt(doc, 0);
    expect(p1.content).toHaveLength(1);
    expect(childAt(p1, 0).type).toBe("paragraph");

    // model 왕복(tiptapToModel → parseDocument)이 통과해 스키마-유효를
    // 직접 증명한다.
    const converted = tiptapToModel(doc, 0, sequentialIds("id"));
    expect(converted.ok).toBe(true);
  });
});
