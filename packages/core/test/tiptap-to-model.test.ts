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

describe("네이티브 split/join 유효성(D21)", () => {
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

  // 알려진 한계(실측, 이 DELTA 범위 밖 — 보고에 기록): blockContainer의
  // content가 "blockContent blockGroup?"라 문단 하나를 둘로 쪼개려면
  // blockContent뿐 아니라 blockContainer 자체도 함께 split(depth 2)해야
  // 하는데, StarterKit 기본 splitBlock(Tiptap 3.30.1 core/@tiptap/pm/commands
  // 둘 다)은 depth를 1로 고정한다 — canSplit이 "컨테이너에 blockContent를
  // 2개 넣을 수 있는가"를 묻고 항상 false를 반환해 Enter가 자식 유무와
  // 무관하게 완전한 무동작이 된다(raw PM 스키마 + 실제 Tiptap Editor 양쪽
  // 실측 확인). D21은 "커스텀 keymap을 추가하지 않는다"를 명시하므로 이
  // DELTA는 이 결과를 고치지 않고 "스키마를 깨지 않고 결정적으로
  // 무동작한다"만 특성화한다 — 새 블록 생성(완료 조건 6-c)은 커스텀 split
  // 커맨드가 있어야 하는 후속 작업이다.
  it("자식 딸린 블록 콘텐츠 끝에서 Enter를 시뮬레이션하면 스키마를 깨지 않고 결정적으로 무동작한다(알려진 한계 — 보고 참고)", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("Parent"),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const schema = tiptap.schema;

    let rootEnd: number | null = null;
    let rootContentStart: number | null = null;
    tiptap.state.doc.descendants((node, pos) => {
      if (rootEnd !== null) return false;
      if (node.type.name === "blockContainer") {
        rootContentStart = pos + 1;
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

    // "Parent" 텍스트 끝(부모 자신의 콘텐츠 끝, 자식 앞)에 캐럿을 둔다.
    tiptap.commands.setTextSelection(rootContentStart + "Parent".length);

    const before = tiptap.state.doc.toJSON();
    const firstAttempt = tiptap.commands.splitBlock();
    const afterFirstAttempt = tiptap.state.doc.toJSON();
    const secondAttempt = tiptap.commands.splitBlock();
    const afterSecondAttempt = tiptap.state.doc.toJSON();

    expect(firstAttempt).toBe(false);
    expect(afterFirstAttempt).toEqual(before);
    expect(secondAttempt).toBe(false);
    expect(afterSecondAttempt).toEqual(before);
    expect(() => schema.nodeFromJSON(before).check()).not.toThrow();
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
