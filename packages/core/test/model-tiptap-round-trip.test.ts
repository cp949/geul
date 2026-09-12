/**
 * model Document를 modelToTiptap으로 인코드하고 tiptapToModel로 다시
 * 디코드했을 때 원본과 구조적으로 동일한지(id·타입·content·children)
 * 확인한다(D19 — DELTA-02 중첩 컨테이너 스키마 도입 이후 PM 문서는 진짜
 * 중첩 노드 트리다: paragraph/heading은 blockContainer로, 자식은 그
 * 안의 선택적 blockGroup이 담는다). tiptapToModel 단독 디코드 계약은
 * tiptap-to-model.test.ts가 소유한다. tiptap-to-model.test.ts에서
 * 책임별로 분리했다.
 */
import { type Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { modelToTiptap, type TiptapJsonNode } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import { liveSchema, unusedIdFactory } from "./editor-controller-support.js";

const containsHardBreak = (node: TiptapJsonNode): boolean =>
  node.type === "hardBreak" || (node.content?.some(containsHardBreak) ?? false);

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

// hardBreak(RD-001) — 스키마·model↔tiptap 변환 계층만의 독립 결과다. 키맵
// (Shift+Enter)은 RD-002/RD-003이 소유하며 이 파일은 다루지 않는다.
describe("hardBreak 왕복(RD-001)", () => {
  it("텍스트 런의 `\\n`이 hardBreak 노드로 인코드되고 실제 PM 스키마가 받아들인다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 1,
      blocks: [
        {
          id: "p-1",
          type: "paragraph",
          content: [{ text: "line1\nline2" }],
        },
      ],
    };

    const encoded = modelToTiptap(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    // 변이: model-to-tiptap.ts의 `\n` split 로직을 지우면(리터럴 `\n`만
    // text 노드에 남으면) 트리 안에 hardBreak 노드가 없어 이 assert가
    // 실패한다.
    expect(containsHardBreak(encoded.value)).toBe(true);

    const schema = liveSchema();
    // 변이: production-editor-assembly.ts가 hardBreak를 계속 비활성 상태로
    // 두면(스키마에 노드가 없으면) check()가 던진다.
    expect(() => schema.nodeFromJSON(encoded.value).check()).not.toThrow();

    const decoded = tiptapToModel(
      encoded.value,
      document.revision,
      unusedIdFactory,
    );
    // 변이: tiptap-to-model.ts에서 hardBreak 분기를 지우면(invalid를
    // 반환하면) 실패한다.
    expect(decoded).toEqual({ ok: true, value: document });
  });

  it("마크가 걸린 텍스트 런 안의 연속 `\\n`도 원본 그대로 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 1,
      blocks: [
        {
          id: "p-1",
          type: "paragraph",
          content: [
            { text: "a\n\nb", marks: [{ type: "bold" }] },
            { text: "plain" },
          ],
        },
      ],
    };

    const encoded = modelToTiptap(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    // 연속 `\n`(빈 세그먼트)이 hardBreak 노드 2개로 인코드됐는지도
    // 구조적으로 확인한다 — 아래 왕복 등식만으로는 encode/decode 양쪽이
    // 똑같이 리터럴 `\n`을 아무 변환 없이 통과시켜도(둘 다 안 바뀐 옛
    // 동작) 우연히 통과해버린다(변이 검출력 없음). hardBreak 노드 개수를
    // 세어 실제로 스키마 레벨 변환이 일어났는지 검증한다.
    let hardBreakCount = 0;
    const countHardBreaks = (node: TiptapJsonNode) => {
      if (node.type === "hardBreak") hardBreakCount += 1;
      node.content?.forEach(countHardBreaks);
    };
    countHardBreaks(encoded.value);
    expect(hardBreakCount).toBe(2);

    const schema = liveSchema();
    expect(() => schema.nodeFromJSON(encoded.value).check()).not.toThrow();

    const decoded = tiptapToModel(
      encoded.value,
      document.revision,
      unusedIdFactory,
    );
    // 변이: hardBreak 병합 로직이 없으면 "a"/"\n"/"\n"/"b"가 별도 항목으로
    // 남아 이 등식이 깨진다(inline-content-merge.ts의 "인접 동일 mark는
    // 항상 병합" 불변식을 tiptap-to-model.ts에도 적용한 결과를 검증한다).
    expect(decoded).toEqual({ ok: true, value: document });
  });
});
