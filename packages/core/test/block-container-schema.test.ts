/**
 * PM 스키마가 content expression으로 강제하는 블록 컨테이너 구조 계약을
 * 확인한다 — table 노드는 blockGroup을 자식으로 가질 수 없다는 구조
 * 제약(D15/D19, createChecked가 스키마 오류로 거절), 그리고 중첩 div
 * HTML을 PM DOMParser로 파싱할 때 blockContainer/blockGroup이
 * parseHTML을 선언하지 않아 중첩 컨테이너가 생성되지 않는 계약(D13
 * 계승). 둘 다 tiptapToModel/modelToTiptap을 거치지 않고 liveSchema()만
 * 쓰는 순수 PM 트리 검증이다. tiptap-to-model.test.ts에서 책임별로
 * 분리했다.
 */
import { DOMParser as PmDOMParser } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { liveSchema } from "./editor-controller-support.js";

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

describe("붙여넣기 평탄화(D13 계승)", () => {
  it("중첩 div 구조의 외부 HTML을 PM DOMParser로 파싱하면 중첩 컨테이너가 생성되지 않고 전부 최상위로 들어온다", () => {
    const schema = liveSchema();

    const container = globalThis.document.createElement("div");
    container.innerHTML = [
      '<div data-geul-block-id="outer">',
      "<p>Outer text</p>",
      "<div>",
      '<div data-geul-block-id="inner">',
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
