/**
 * tiptap JSON(editor.getJSON() 형태)을 독자 문서 모델로 디코드하는
 * tiptapToModel의 계약과, model Document를 PM 트리로 인코드하는
 * modelToTiptap의 계약을 함께 확인한다. 이 경로는 라이브 에디터의 매 커맨드
 * 디스패치 뒤(readEditorDocument)를 타는데도 지금까지 직접 단위 테스트가
 * 없었다 — 카드 W 그릴링에서 발견해 추가했다.
 *
 * DELTA-02(중첩 컨테이너 스키마)부터 PM 문서는 진짜 중첩 노드 트리다(D19) —
 * paragraph/heading은 blockContainer(blockId 소유)로 감싸이고, 자식은
 * blockContainer 안의 선택적 blockGroup이 담는다. table은 컨테이너로
 * 감싸이지 않는다(D15/D19 — 표는 자식 블록을 가질 수 없다는 계약을 content
 * expression이 구조적으로 강제한다). 기존 케이스는 이 새 PM JSON 모양으로
 * 갱신했다 — 디코드된 model Document 값은 이전과 동일하다(회귀 없음).
 */
import { type Document, type IdFactory } from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";
import { DOMParser as PmDOMParser } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { modelToTiptap } from "../src/model-to-tiptap.js";
import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

// 모든 블록이 이미 id를 가진 문서를 왕복시킬 때 쓴다 — createId가 실제로
// 호출되면(즉 저장된 id를 잃어버렸으면) 테스트가 즉시 실패로 드러난다.
const unusedIdFactory: IdFactory = () => {
  throw new Error("createId는 모든 블록에 이미 id가 있을 때 호출되면 안 된다");
};

// 표 명령 등과 무관하게 스키마·appendTransaction만 검사하는 테스트가 공유하는
// 최소 마운트 헬퍼. paragraphDocument("seed")는 실제 콘텐츠와 무관한
// placeholder다 — 각 테스트가 자신의 트랜잭션으로 문서를 직접 조작한다.
const liveSchema = () => {
  const editor = createEditor({
    initialDocument: paragraphDocument("seed"),
    createId: sequentialIds("seed"),
  });
  return mountTiptapEditor(editor).tiptap.schema;
};

describe("tiptap JSON을 독자 문서 모델로 디코드한다", () => {
  it("문단·헤딩·표를 한 문서 안에서 함께 디코드한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "para-1" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "hello" }],
            },
          ],
        },
        {
          type: "blockContainer",
          attrs: { blockId: "heading-1" },
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "title" }],
            },
          ],
        },
        {
          type: "table",
          attrs: {
            blockId: "table-1",
            columns: [{ id: "col-1", width: 160 }],
            headerRows: 0,
            headerColumns: 0,
          },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: { cellId: "cell-1", columnId: "col-1" },
                  content: [{ type: "text", text: "cell" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result).toEqual({
      ok: true,
      value: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "para-1", type: "paragraph", content: [{ text: "hello" }] },
          {
            id: "heading-1",
            type: "heading",
            level: 2,
            content: [{ text: "title" }],
          },
          {
            id: "table-1",
            type: "table",
            columns: [{ id: "col-1", width: 160 }],
            rows: [
              {
                id: "row-1",
                cells: [
                  {
                    id: "cell-1",
                    columnId: "col-1",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "cell" }],
                  },
                ],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      },
    });
  });

  it("blockId가 없는 블록에는 createId로 새 id를 발급한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "x" }] },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("gen"));

    expect(result).toEqual({
      ok: true,
      value: {
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "gen-1", type: "paragraph", content: [{ text: "x" }] }],
      },
    });
  });

  it("표 셀 attrs가 없는 필드(rowspan/colspan 등)는 기본값으로 채운다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { blockId: "table-1", columns: [{ id: "col-1", width: 160 }] },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: { cellId: "cell-1", columnId: "col-1" },
                  content: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result).toEqual({
      ok: true,
      value: {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "table-1",
            type: "table",
            columns: [{ id: "col-1", width: 160 }],
            rows: [
              {
                id: "row-1",
                cells: [
                  {
                    id: "cell-1",
                    columnId: "col-1",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [],
                  },
                ],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      },
    });
  });

  it("cellId가 없으면 빈 문자열로 접었다가 문서 검증에서 깨끗하게 거절한다(크래시 아님)", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { blockId: "table-1", columns: [{ id: "col-1", width: 160 }] },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: { columnId: "col-1" },
                  content: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("DOCUMENT_INVALID");
  });

  it("문단에서 인식하지 못하는 mark를 만나면 조용히 버리지 않고 거절한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "para-1" },
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "x", marks: [{ type: "highlight" }] },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        message: "Unsupported mark: highlight",
      },
    });
  });

  it("표 셀 안에서 인식하지 못하는 mark를 만나도 같은 정책으로 거절한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { blockId: "table-1", columns: [{ id: "col-1", width: 160 }] },
          content: [
            {
              type: "tableRow",
              attrs: { rowId: "row-1" },
              content: [
                {
                  type: "tableCell",
                  attrs: { cellId: "cell-1", columnId: "col-1" },
                  content: [
                    { type: "text", text: "x", marks: [{ type: "highlight" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        message: "Unsupported mark: highlight",
      },
    });
  });

  it("link mark인데 href가 없으면 거절한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "para-1" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "x", marks: [{ type: "link" }] }],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 0, sequentialIds("id"));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        message: "Link mark requires an href",
      },
    });
  });
});

describe("컨테이너 구조 왕복(D19)", () => {
  it("children을 가진 Document를 modelToTiptap → tiptapToModel로 왕복하면 원본과 구조적으로 동일하다(id·타입·content·children)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 5,
      blocks: [
        {
          id: "parent-1",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [
            {
              id: "child-1",
              type: "heading",
              level: 2,
              content: [{ text: "child heading" }],
              children: [
                {
                  id: "grandchild-1",
                  type: "paragraph",
                  content: [{ text: "grandchild" }],
                },
              ],
            },
            {
              id: "child-2",
              type: "paragraph",
              content: [{ text: "second child" }],
            },
          ],
        },
        {
          id: "top-2",
          type: "paragraph",
          content: [{ text: "top-level sibling" }],
        },
      ],
    };

    const encoded = modelToTiptap(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    // 실제 PM 스키마가 인코딩 결과를 유효한 트리로 받아들이는지도 함께
    // 확인한다 — model↔PM JSON 모양이 우연히 맞아떨어지는 것과 스키마
    // content expression을 실제로 만족하는 것은 다르다(Node.fromJSON은
    // create()를 써 검증하지 않으므로 check()로 재귀 검증한다).
    const schema = liveSchema();
    expect(() => schema.nodeFromJSON(encoded.value).check()).not.toThrow();

    const decoded = tiptapToModel(
      encoded.value,
      document.revision,
      unusedIdFactory,
    );
    expect(decoded).toEqual({ ok: true, value: document });
  });

  it("TableBlock이 다른 블록의 자식으로 중첩된 문서도 동일하게 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 1,
      blocks: [
        {
          id: "parent-1",
          type: "paragraph",
          content: [{ text: "parent" }],
          children: [
            {
              id: "table-1",
              type: "table",
              columns: [{ id: "col-1", width: 120 }],
              rows: [
                {
                  id: "row-1",
                  cells: [
                    {
                      id: "cell-1",
                      columnId: "col-1",
                      rowSpan: 1,
                      columnSpan: 1,
                      content: [{ text: "cell" }],
                    },
                  ],
                },
              ],
              headerRows: 0,
              headerColumns: 0,
            },
            {
              id: "sibling-1",
              type: "paragraph",
              content: [{ text: "after table" }],
            },
          ],
        },
      ],
    };

    const encoded = modelToTiptap(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const schema = liveSchema();
    expect(() => schema.nodeFromJSON(encoded.value).check()).not.toThrow();

    const decoded = tiptapToModel(
      encoded.value,
      document.revision,
      unusedIdFactory,
    );
    expect(decoded).toEqual({ ok: true, value: document });
  });

  it("children이 없는 기존 문서의 model 계층 왕복 결과가 이전과 동일하다(회귀)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 2,
      blocks: [
        { id: "block-1", type: "paragraph", content: [{ text: "flat 1" }] },
        {
          id: "block-2",
          type: "heading",
          level: 1,
          content: [{ text: "flat heading" }],
        },
        {
          id: "block-3",
          type: "table",
          columns: [{ id: "col-1", width: 100 }],
          rows: [
            {
              id: "row-1",
              cells: [
                {
                  id: "cell-1",
                  columnId: "col-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "cell" }],
                },
              ],
            },
          ],
          headerRows: 0,
          headerColumns: 0,
        },
      ],
    };

    const encoded = modelToTiptap(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const decoded = tiptapToModel(
      encoded.value,
      document.revision,
      unusedIdFactory,
    );
    expect(decoded).toEqual({ ok: true, value: document });
  });
});

describe("표-부모 구조 강제(D15/D19)", () => {
  it("table 노드에 blockGroup을 자식으로 넣는 PM 조립이 스키마 오류로 거절된다(createChecked)", () => {
    const schema = liveSchema();

    const validRow = schema.nodes.tableRow!.create(
      { rowId: "row-1" },
      schema.nodes.tableCell!.create({ cellId: "cell-1", columnId: "col-1" }),
    );
    const nestedParagraph = schema.nodes.paragraph!.create(
      null,
      schema.text("nested"),
    );
    const nestedContainer = schema.nodes.blockContainer!.create(
      { blockId: "nested-1" },
      nestedParagraph,
    );
    const blockGroup = schema.nodes.blockGroup!.create(null, nestedContainer);

    expect(() =>
      schema.nodes.table!.createChecked(
        { blockId: "table-1", columns: [], headerRows: 0, headerColumns: 0 },
        [validRow, blockGroup],
      ),
    ).toThrow();
  });
});

describe("blockId 발급 재귀(D19)", () => {
  it("중첩 자식으로 삽입된 id 없는 컨테이너에도 appendTransaction이 id를 채운다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("root"),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootEnd: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootEnd !== null) return false;
      if (node.type.name === "blockContainer") {
        rootEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });
    if (rootEnd === null) throw new Error("rootEnd 조회 실패");

    // blockId가 null인(id 미발급) 중첩 컨테이너를 최상위 컨테이너의 콘텐츠
    // 끝(blockGroup 자리)에 직접 삽입한다 — 라이브 에디터의 정상 편집
    // 경로(예: paste)가 아니라 appendTransaction 자체의 재귀 탐색만 겨눈
    // 최소 재현이다.
    const nestedParagraph = schema.nodes.paragraph!.create(
      null,
      schema.text("nested"),
    );
    const nestedContainer = schema.nodes.blockContainer!.create(
      null,
      nestedParagraph,
    );
    const blockGroup = schema.nodes.blockGroup!.create(null, nestedContainer);

    const tr = tiptap.state.tr.insert(rootEnd, blockGroup);
    tiptap.view.dispatch(tr);

    let nestedId: unknown;
    tiptap.state.doc.descendants((node) => {
      if (
        node.type.name === "blockContainer" &&
        node.textContent === "nested"
      ) {
        nestedId = node.attrs.blockId;
      }
    });

    expect(typeof nestedId).toBe("string");
    expect((nestedId as string).length).toBeGreaterThan(0);
  });
});

describe("네이티브 split/join 유효성(D22)", () => {
  it("빈 자식 블록 선두 Backspace(join) 결과는 스키마 유효 트리다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("root"),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootEnd: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootEnd !== null) return false;
      if (node.type.name === "blockContainer") {
        rootEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });

    const emptyChildParagraph = schema.nodes.paragraph!.create();
    const childContainer = schema.nodes.blockContainer!.create(
      { blockId: "child-1" },
      emptyChildParagraph,
    );
    if (rootEnd === null) throw new Error("rootEnd 조회 실패");
    const blockGroup = schema.nodes.blockGroup!.create(null, childContainer);
    tiptap.view.dispatch(tiptap.state.tr.insert(rootEnd, blockGroup));

    let caretPos: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (caretPos !== null) return false;
      if (node.type.name === "paragraph" && node.textContent === "") {
        caretPos = pos + 1;
        return false;
      }
      return true;
    });
    if (caretPos === null) throw new Error("caretPos 조회 실패");
    tiptap.commands.setTextSelection(caretPos);

    // Backspace 키맵 체인(StarterKit 기본, keymap.ts handleBackspace의
    // 실사용 구간과 동형) — 커스텀 keymap을 추가하지 않는다(D21).
    const ok = tiptap.commands.first(({ commands }) => [
      () => commands.deleteSelection(),
      () => commands.joinBackward(),
      () => commands.selectNodeBackward(),
    ]);

    expect(ok).toBe(true);
    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();
  });

  // Enter 키다운을 real DOM KeyboardEvent로 시뮬레이션한다 — 이 커맨드는
  // BlockSplitExtension.addKeyboardShortcuts()로 등록돼 PM keymap
  // 플러그인이 실제 keydown 이벤트로만 트리거된다(editor.commands.xxx로
  // 노출하지 않는다 — 계획 "적용 계약과 가이드" G-WKS-001).
  const pressEnter = (editable: HTMLElement) => {
    editable.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  it("자식이 없는 최상위 블록 콘텐츠 끝에서 Enter를 시뮬레이션하면 새 블록이 원본의 형제로 삽입된다(D24)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("Parent"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootContentStart: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootContentStart !== null) return false;
      if (node.type.name === "paragraph") {
        rootContentStart = pos + 1;
        return false;
      }
      return true;
    });
    if (rootContentStart === null)
      throw new Error("rootContentStart 조회 실패");

    // "Parent" 텍스트 끝에 캐럿을 둔다.
    tiptap.commands.setTextSelection(rootContentStart + "Parent".length);

    pressEnter(editable);

    // (a) 스키마 유효 — 변이(depth 1 splitBlock으로 되돌림)라면 무동작이라
    // 아래 구조 assert가 실패한다.
    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    // D24: 자식이 전혀 없던 블록이므로 새 컨테이너는 첫 자식이 아니라
    // 문서 최상위의 다음 형제로 들어간다 — blockGroup은 만들어지지 않는다
    // (변이: 첫 자식으로 되돌리면 doc.childCount가 1로 남고 이 assert가
    // 실패한다).
    expect(tiptap.state.doc.childCount).toBe(2);

    const originalContainer = tiptap.state.doc.child(0);
    expect(originalContainer.type.name).toBe("blockContainer");
    expect(originalContainer.attrs.blockId).toBe("block-1"); // 원본 blockId 불변
    expect(originalContainer.childCount).toBe(1); // blockGroup 없음(자식 없음)
    expect(originalContainer.firstChild?.textContent).toBe("Parent"); // 끝에서 split — 원본 텍스트 불변

    const newContainer = tiptap.state.doc.child(1);
    expect(newContainer.type.name).toBe("blockContainer");
    expect(newContainer.firstChild?.textContent).toBe("");
    expect(typeof newContainer.attrs.blockId).toBe("string");
    expect((newContainer.attrs.blockId as string).length).toBeGreaterThan(0);
    expect(newContainer.attrs.blockId).not.toBe("block-1");
  });

  it("자식이 없는 최상위 블록 콘텐츠 중간에서 Enter를 시뮬레이션해도 형제로 삽입되고 분할된 텍스트 순서가 보존된다(D24)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("HelloWorld"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootContentStart: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootContentStart !== null) return false;
      if (node.type.name === "paragraph") {
        rootContentStart = pos + 1;
        return false;
      }
      return true;
    });
    if (rootContentStart === null)
      throw new Error("rootContentStart 조회 실패");

    // "Hello" 와 "World" 사이에 캐럿을 둔다.
    tiptap.commands.setTextSelection(rootContentStart + "Hello".length);

    pressEnter(editable);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    expect(tiptap.state.doc.childCount).toBe(2);
    const originalContainer = tiptap.state.doc.child(0);
    const newContainer = tiptap.state.doc.child(1);
    // 변이: 앞/뒤 텍스트가 뒤바뀌거나 유실되면 이 두 assert가 실패한다.
    expect(originalContainer.firstChild?.textContent).toBe("Hello");
    expect(newContainer.firstChild?.textContent).toBe("World");
    expect(originalContainer.attrs.blockId).toBe("block-1");
    expect(newContainer.attrs.blockId).not.toBe("block-1");
  });

  it("자식 딸린 블록 콘텐츠 끝에서 Enter를 시뮬레이션하면 새 블록이 원본의 첫 자식으로 삽입되고 기존 자식 귀속은 불변이다(D22/D23)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("Parent"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootEnd: number | null = null;
    let rootContentStart: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootEnd !== null) return false;
      if (node.type.name === "blockContainer") {
        // pos + 1은 컨테이너 진입(paragraph 노드 자신의 위치) — 텍스트
        // 안으로 들어가려면 paragraph의 여는 토큰도 지나야 한다(pos + 2).
        rootContentStart = pos + 2;
        rootEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });

    const childParagraph = schema.nodes.paragraph!.create(
      null,
      schema.text("Child"),
    );
    const childContainer = schema.nodes.blockContainer!.create(
      { blockId: "child-1" },
      childParagraph,
    );
    if (rootEnd === null) throw new Error("rootEnd 조회 실패");
    if (rootContentStart === null) {
      throw new Error("rootContentStart 조회 실패");
    }
    const blockGroup = schema.nodes.blockGroup!.create(null, childContainer);
    tiptap.view.dispatch(tiptap.state.tr.insert(rootEnd, blockGroup));
    const beforeSplitJson = tiptap.state.doc.toJSON();
    // history 경계를 명시적으로 닫는다 — split 트랜잭션의 replaceWith
    // 범위가 이 setup 삽입 범위와 겹쳐 PM history의 isAdjacentTo 병합
    // 휴리스틱이 시간차와 무관하게 둘을 한 undo 그룹으로 합친다. 무동작
    // closeHistory 트랜잭션(steps 0)을 끼워 넣으면 history 상태의
    // prevTime이 0으로 리셋되고, 이어지는 split 트랜잭션은 그 리셋만으로
    // 무조건 새 그룹이 된다(prosemirror-history applyTransaction: 0-step
    // 트랜잭션도 closeHistoryKey 메타를 조기에 반영하고 반환한다).
    tiptap.view.dispatch(closeHistory(tiptap.state.tr));

    // "Parent" 텍스트 끝(부모 자신의 콘텐츠 끝, 자식 앞)에 캐럿을 둔다.
    tiptap.commands.setTextSelection(rootContentStart + "Parent".length);

    pressEnter(editable);

    // (a) 스키마 유효
    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    const rootNode = tiptap.state.doc.child(0);
    expect(rootNode.type.name).toBe("blockContainer");
    expect(rootNode.attrs.blockId).toBe("block-1"); // 원본 blockId 불변
    expect(rootNode.firstChild?.textContent).toBe("Parent"); // 끝에서 split — 원본 텍스트 불변
    expect(rootNode.childCount).toBe(2);

    const group = rootNode.child(1);
    expect(group.type.name).toBe("blockGroup");
    expect(group.childCount).toBe(2);

    // (e) 새 블록이 첫 자식이다(D23) — 변이(다음 형제로 두는 형태)라면
    // group.child(0)이 child-1이 되어 아래 assert가 실패한다.
    const newContainer = group.child(0);
    expect(newContainer.type.name).toBe("blockContainer");
    expect(newContainer.firstChild?.textContent).toBe("");
    // (c) 새 blockId 부여
    expect(typeof newContainer.attrs.blockId).toBe("string");
    expect((newContainer.attrs.blockId as string).length).toBeGreaterThan(0);
    expect(newContainer.attrs.blockId).not.toBe("block-1");
    expect(newContainer.attrs.blockId).not.toBe("child-1");

    // (b) 기존 자식 귀속 불변 — child-1은 내용·id 그대로 두 번째 자식으로
    // 보존된다. 변이(naive depth-2 split으로 기존 blockGroup 전체가
    // 이관되는 형태)라면 child-1이 새 컨테이너 쪽으로 옮겨가 이 assert가
    // 실패한다.
    const existingChild = group.child(1);
    expect(existingChild.type.name).toBe("blockContainer");
    expect(existingChild.attrs.blockId).toBe("child-1");
    expect(existingChild.firstChild?.textContent).toBe("Child");

    // (d) 결정적 — 캐럿이 새 블록 텍스트 시작에 위치한다(G-EDT-001).
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(newContainer.firstChild);
    expect(selection.$from.parentOffset).toBe(0);

    // undo 1회로 split 전체가 복원된다 — replaceWith+setSelection이 같은
    // tr·단일 dispatch로 끝났다는 증거(G-EDT-001).
    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeSplitJson);
  });

  it("자식 딸린 블록 콘텐츠 중간에서 Enter를 시뮬레이션해도 (a)~(e)가 성립하고 분할된 텍스트 앞/뒤 순서가 보존된다(D22/D23)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("Parent"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootEnd: number | null = null;
    let rootContentStart: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootEnd !== null) return false;
      if (node.type.name === "blockContainer") {
        // pos + 1은 컨테이너 진입(paragraph 노드 자신의 위치) — 텍스트
        // 안으로 들어가려면 paragraph의 여는 토큰도 지나야 한다(pos + 2).
        rootContentStart = pos + 2;
        rootEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });

    const childParagraph = schema.nodes.paragraph!.create(
      null,
      schema.text("Child"),
    );
    const childContainer = schema.nodes.blockContainer!.create(
      { blockId: "child-1" },
      childParagraph,
    );
    if (rootEnd === null) throw new Error("rootEnd 조회 실패");
    if (rootContentStart === null) {
      throw new Error("rootContentStart 조회 실패");
    }
    const blockGroup = schema.nodes.blockGroup!.create(null, childContainer);
    tiptap.view.dispatch(tiptap.state.tr.insert(rootEnd, blockGroup));
    const beforeSplitJson = tiptap.state.doc.toJSON();
    // history 경계를 명시적으로 닫는다 — split 트랜잭션의 replaceWith
    // 범위가 이 setup 삽입 범위와 겹쳐 PM history의 isAdjacentTo 병합
    // 휴리스틱이 시간차와 무관하게 둘을 한 undo 그룹으로 합친다. 무동작
    // closeHistory 트랜잭션(steps 0)을 끼워 넣으면 history 상태의
    // prevTime이 0으로 리셋되고, 이어지는 split 트랜잭션은 그 리셋만으로
    // 무조건 새 그룹이 된다(prosemirror-history applyTransaction: 0-step
    // 트랜잭션도 closeHistoryKey 메타를 조기에 반영하고 반환한다).
    tiptap.view.dispatch(closeHistory(tiptap.state.tr));

    // "Parent" 중간("Par" | "ent")에 캐럿을 둔다 — 끝(조건2)과 다른 축인
    // 오프바이원 함정을 잡는 위치다.
    tiptap.commands.setTextSelection(rootContentStart + "Par".length);

    pressEnter(editable);

    // (a) 스키마 유효
    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    const rootNode = tiptap.state.doc.child(0);
    expect(rootNode.type.name).toBe("blockContainer");
    expect(rootNode.attrs.blockId).toBe("block-1");
    // 분할된 앞 텍스트가 원본에 남는다(뒤바뀌면 "ent"가 된다).
    expect(rootNode.firstChild?.textContent).toBe("Par");
    expect(rootNode.childCount).toBe(2);

    const group = rootNode.child(1);
    expect(group.type.name).toBe("blockGroup");
    expect(group.childCount).toBe(2);

    // (e) 새 블록이 첫 자식이다(D23)
    const newContainer = group.child(0);
    expect(newContainer.type.name).toBe("blockContainer");
    // 분할된 뒤 텍스트가 새 블록으로 간다(유실·뒤바뀜이면 실패).
    expect(newContainer.firstChild?.textContent).toBe("ent");
    // (c) 새 blockId 부여
    expect(typeof newContainer.attrs.blockId).toBe("string");
    expect((newContainer.attrs.blockId as string).length).toBeGreaterThan(0);
    expect(newContainer.attrs.blockId).not.toBe("block-1");
    expect(newContainer.attrs.blockId).not.toBe("child-1");

    // (b) 기존 자식 귀속 불변
    const existingChild = group.child(1);
    expect(existingChild.type.name).toBe("blockContainer");
    expect(existingChild.attrs.blockId).toBe("child-1");
    expect(existingChild.firstChild?.textContent).toBe("Child");

    // (d) 결정적 — 캐럿이 새 블록 텍스트 시작("ent" 앞)에 위치한다.
    const { selection } = tiptap.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent).toBe(newContainer.firstChild);
    expect(selection.$from.parentOffset).toBe(0);

    tiptap.commands.undo();
    expect(tiptap.state.doc.toJSON()).toEqual(beforeSplitJson);
  });

  /**
   * level 2 heading 블록 하나짜리 문서 — 블록 끝 Enter의 새 블록 타입
   * 규칙(끝 split은 빈 문단, 그 외는 원본 타입 복사)을 검증하는 출발점이다.
   */
  const headingDocument = (text: string): Document => ({
    formatVersion: 1,
    revision: 0,
    blocks: [{ id: "block-1", type: "heading", level: 2, content: [{ text }] }],
  });

  /**
   * 문서 첫 heading의 텍스트 시작 위치를 찾는다 — 위 문단 케이스들의
   * rootContentStart 조회와 같은 역할, 대상 노드 타입만 다르다.
   */
  const headingTextStart = (doc: import("@tiptap/pm/model").Node): number => {
    let start: number | null = null;
    doc.descendants((node, pos) => {
      if (start !== null) return false;
      if (node.type.name === "heading") {
        start = pos + 1;
        return false;
      }
      return true;
    });
    if (start === null) throw new Error("heading 조회 실패");
    return start;
  };

  it("heading 콘텐츠 끝에서 Enter를 시뮬레이션하면 새 블록은 heading 복사가 아니라 빈 문단이다", () => {
    const editor = createEditor({
      initialDocument: headingDocument("Title"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    // "Title" 텍스트 끝에 캐럿을 둔다.
    tiptap.commands.setTextSelection(
      headingTextStart(tiptap.state.doc) + "Title".length,
    );

    pressEnter(editable);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    expect(tiptap.state.doc.childCount).toBe(2);
    const originalContainer = tiptap.state.doc.child(0);
    // 원본은 그대로 heading이다.
    expect(originalContainer.firstChild?.type.name).toBe("heading");
    expect(originalContainer.firstChild?.attrs.level).toBe(2);
    expect(originalContainer.firstChild?.textContent).toBe("Title");

    // dev(StarterKit splitBlock + defaultBlockAt)의 "제목 뒤 Enter로 본문
    // 입력" 흐름 — 블록 끝 split의 새 블록은 같은 level heading 복사가
    // 아니라 빈 문단이다.
    const newContainer = tiptap.state.doc.child(1);
    expect(newContainer.firstChild?.type.name).toBe("paragraph");
    expect(newContainer.firstChild?.textContent).toBe("");
  });

  it("heading 콘텐츠 중간에서 Enter를 시뮬레이션하면 분할된 뒤쪽은 기존대로 같은 level의 heading이다", () => {
    const editor = createEditor({
      initialDocument: headingDocument("Title"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    // "Ti"와 "tle" 사이에 캐럿을 둔다 — 끝 split(빈 문단 규칙)이 중간
    // split까지 침범하지 않는지 고정한다.
    tiptap.commands.setTextSelection(
      headingTextStart(tiptap.state.doc) + "Ti".length,
    );

    pressEnter(editable);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    expect(tiptap.state.doc.childCount).toBe(2);
    const originalContainer = tiptap.state.doc.child(0);
    expect(originalContainer.firstChild?.type.name).toBe("heading");
    expect(originalContainer.firstChild?.attrs.level).toBe(2);
    expect(originalContainer.firstChild?.textContent).toBe("Ti");

    // 중간 split은 원본 타입·attrs 복사 유지.
    const newContainer = tiptap.state.doc.child(1);
    expect(newContainer.firstChild?.type.name).toBe("heading");
    expect(newContainer.firstChild?.attrs.level).toBe(2);
    expect(newContainer.firstChild?.textContent).toBe("tle");
  });

  it("자식 딸린 heading 콘텐츠 끝에서 Enter를 시뮬레이션해도 첫 자식 새 블록은 빈 문단이다(D23)", () => {
    const editor = createEditor({
      initialDocument: headingDocument("Title"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootEnd: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootEnd !== null) return false;
      if (node.type.name === "blockContainer") {
        rootEnd = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });
    if (rootEnd === null) throw new Error("rootEnd 조회 실패");

    const childParagraph = schema.nodes.paragraph!.create(
      null,
      schema.text("Child"),
    );
    const childContainer = schema.nodes.blockContainer!.create(
      { blockId: "child-1" },
      childParagraph,
    );
    const blockGroup = schema.nodes.blockGroup!.create(null, childContainer);
    tiptap.view.dispatch(tiptap.state.tr.insert(rootEnd, blockGroup));

    // "Title" 텍스트 끝(자식 앞)에 캐럿을 둔다.
    tiptap.commands.setTextSelection(
      headingTextStart(tiptap.state.doc) + "Title".length,
    );

    pressEnter(editable);

    expect(() =>
      schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
    ).not.toThrow();

    const rootNode = tiptap.state.doc.child(0);
    expect(rootNode.firstChild?.type.name).toBe("heading");
    expect(rootNode.firstChild?.textContent).toBe("Title");
    expect(rootNode.childCount).toBe(2);

    const group = rootNode.child(1);
    expect(group.type.name).toBe("blockGroup");
    expect(group.childCount).toBe(2);

    // 첫 자식으로 들어간 새 블록(D23)도 끝 split이므로 빈 문단이다.
    const newContainer = group.child(0);
    expect(newContainer.firstChild?.type.name).toBe("paragraph");
    expect(newContainer.firstChild?.textContent).toBe("");

    // 기존 자식 귀속 불변.
    const existingChild = group.child(1);
    expect(existingChild.attrs.blockId).toBe("child-1");
    expect(existingChild.firstChild?.textContent).toBe("Child");
  });
});

describe("붙여넣기 평탄화(D13 계승)", () => {
  it("중첩 div 구조의 외부 HTML을 PM DOMParser로 파싱하면 중첩 컨테이너가 생성되지 않고 전부 최상위로 들어온다", () => {
    const schema = liveSchema();

    const container = globalThis.document.createElement("div");
    container.innerHTML = [
      '<div data-be-block-id="outer">',
      "<p>Outer text</p>",
      "<div>",
      '<div data-be-block-id="inner">',
      "<p>Inner text</p>",
      "</div>",
      "</div>",
      "</div>",
    ].join("");

    const parsed = PmDOMParser.fromSchema(schema).parse(container);

    const topLevelTypeNames: string[] = [];
    parsed.forEach((node) => topLevelTypeNames.push(node.type.name));

    // blockContainer/blockGroup은 parseHTML을 선언하지 않는다(D13 계승) —
    // 중첩 div가 중첩 컨테이너로 파싱되지 않고, 두 <p>가 각자 새
    // blockContainer로 auto-wrap되어 doc 최상위 형제가 된다.
    expect(topLevelTypeNames).toEqual(["blockContainer", "blockContainer"]);
    parsed.forEach((node) => {
      expect(node.type.name).toBe("blockContainer");
      expect(node.childCount).toBe(1);
      expect(node.firstChild?.type.name).toBe("paragraph");
    });
    expect(parsed.textContent).toBe("Outer textInner text");
    expect(() => parsed.check()).not.toThrow();
  });
});

describe("손상된 blockContainer content 방어(트랙-4 즉시 리뷰 발견)", () => {
  it("blockContent/blockGroup 뒤에 여벌 노드가 있으면 무음 소실 대신 거절한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "p1" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "hi" }] },
            {
              type: "blockGroup",
              content: [
                {
                  type: "blockContainer",
                  attrs: { blockId: "c1" },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "child" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "stray" }],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 1, unusedIdFactory);

    expect(result.ok).toBe(false);
  });

  it("두 번째 자식이 blockGroup이 아니면 자식으로 무음 흡수하지 않고 거절한다", () => {
    const json: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "blockContainer",
          attrs: { blockId: "p1" },
          content: [
            { type: "paragraph", content: [{ type: "text", text: "hi" }] },
            {
              type: "paragraph",
              content: [{ type: "text", text: "not-a-group" }],
            },
          ],
        },
      ],
    };

    const result = tiptapToModel(json, 1, unusedIdFactory);

    expect(result.ok).toBe(false);
  });
});
