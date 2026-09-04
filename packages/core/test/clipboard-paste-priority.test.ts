/**
 * Issue #38 슬라이스 10의 두 완료 기준(우선순위·fallback이 fixture로
 * 고정, 슬라이스 2~9 전체 블록 타입이 붙여넣기 대상)을 RD-001~005 개별
 * 검증 위에 교차로 고정한다(RD-006 DELTA-01). 표/HTML/Markdown/plain
 * 우선순위는 이미 `editor-controller-table-paste.test.ts`(표 단독·혼합)와
 * `clipboard-paste-extension.test.ts`(Markdown 단독·plain 위임)가 단일
 * MIME 조합으로 고정해 뒀다 — 이 파일은 그 커버리지를 재작성하지 않고,
 * **다중 MIME이 동시에 있을 때의 우선순위**(빈틈)와 **슬라이스 2~9 전체
 * 블록 타입을 한 fixture에 모은 교차 확인**, **중첩·id 유일성의 own+
 * production wrapper 교차**만 새로 다룬다.
 */
import { exportHtml } from "@cp949/geul-io";
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  nestedParagraphWrapperHtml,
  pasteData,
  pasteHtml,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  checkListItemBlock,
  codeBlockBlock,
  dividerBlock,
  documentOf,
  headingBlock,
  listItemBlock,
  mountTiptapEditor,
  paragraphBlock,
  paragraphDocument,
  quoteBlock,
  sequentialIds,
} from "./editor-controller-support.js";
import {
  productionDocumentOf,
  productionHtml,
} from "./production-editor-test-support.js";

describe("우선순위 교차(다중 MIME 동시 존재)", () => {
  // 순수 <table> 파싱은 io.importHtml도 일반 HTML 경로로 table 블록을
  // 만들 수 있어 "table 블록 존재 여부"만으로는 어느 확장이 처리했는지
  // 구별하지 못한다(readiness probe 실측 — 표 등록 순서를 임시로 뒤바꿔도
  // 이 기준으로는 RED가 재현되지 않았다). TablePasteExtension만 갖는
  // 고유 계약(10,000셀 상한 초과 시 CLIPBOARD_TABLE_INVALID를
  // onPasteRejected로 전달, editor-controller-table-paste.test.ts와 같은
  // 셀 수 기준)을 판별 기준으로 쓴다 — ClipboardPasteExtension이 대신
  // 처리했다면 이 콜백은 호출되지 않는다(그 확장은 `!imported.ok`일 때
  // 조용히 `true`만 반환한다).
  it("표 HTML과 Markdown처럼 보이는 plain text가 동시에 있으면 TablePasteExtension이 처리하고 ClipboardPasteExtension 경로로 새지 않는다", () => {
    const rejections: unknown[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
      onPasteRejected: (reason) => rejections.push(reason),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();

    const cells = Array.from({ length: 101 }, () => "<td>x</td>").join("");
    const rows = Array.from({ length: 101 }, () => `<tr>${cells}</tr>`).join(
      "",
    );

    withUnhandledErrorTracking((errors) => {
      pasteData(editable, {
        "text/html": `<table><tbody>${rows}</tbody></table>`,
        "text/plain": "# not a heading\n\n- not a list item",
      });

      expect(rejections).toHaveLength(1);
      expect(rejections[0]).toMatchObject({ code: "CLIPBOARD_TABLE_INVALID" });

      const blocks = editor.getDocument().blocks;
      expect(blocks.some((block) => block.type === "heading")).toBe(false);
      expect(blocks.some((block) => block.type === "bulletListItem")).toBe(
        false,
      );
      expect(errors).toEqual([]);
    });
  });

  it("비표 HTML과 Markdown 문법의 plain text가 동시에 있으면 HTML이 반영되고 Markdown 감지 결과는 버려진다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteData(editable, {
        "text/html": "<p>hello</p>",
        "text/plain": "# not a heading\n\n- not a list item",
      });

      const blocks = editor.getDocument().blocks;
      const inserted = blocks[1];
      expect(inserted).toMatchObject({
        type: "paragraph",
        content: [{ text: "hello" }],
      });
      expect(blocks.some((block) => block.type === "heading")).toBe(false);
      expect(blocks.some((block) => block.type === "bulletListItem")).toBe(
        false,
      );
      expect(errors).toEqual([]);
    });
  });
});

describe("슬라이스 2~9 전체 블록 타입 fixture(완료 조건 3)", () => {
  // 슬라이스 2~9가 추가한 11종 대표 1건씩 — own export document HTML
  // 왕복으로 타입·상태·content가 정확히 반영되는지 한 번에 고정한다.
  // `io.exportHtml`을 소스로 쓴다 — roadmap.md "전체 결과
  // 경계"가 own export document HTML을 명시 대상으로 두는 반면, 생산
  // 편집기 in-editor copy의 상태 보존은 목록류 4종(RD-003)에만 범위가
  // 있고 토글 heading에는 없다(own export만 `<details data-be-toggleable>`
  // 로 isToggleable/collapsed를 표현한다, export-html.ts). 목록 4종은
  // clipboard-paste-list.test.ts가, 비목록 5종은 clipboard-paste-extension.
  // test.ts가 이미 개별로 검증했다 — 이 fixture의 새 가치는 11종 전체를
  // 하나의 문서·paste로 교차 확인하는 것과, 토글 heading·인라인/블록
  // 색상·정렬(어느 기존 clipboard 테스트도 다루지 않았던 3종)이다.
  const blockTypeFixtures: Block[] = [
    headingBlock("hd", 2, "heading text"),
    quoteBlock("qt", "quote text"),
    dividerBlock("dv"),
    // canonicalizeCodeBlockLanguages(model/src/code-block.ts)가 별칭을
    // 정규형으로 접는다("ts"→"typescript") — 이 fixture는 그 정규화
    // 자체를 검증 대상으로 삼지 않으므로 정규형을 직접 쓴다.
    codeBlockBlock("cb", "code text", "typescript"),
    listItemBlock("bl", "bulletListItem", "bullet text"),
    listItemBlock("nl", "numberedListItem", "numbered text", {
      startNumber: 5,
    }),
    checkListItemBlock("cl", "check text", true),
    {
      id: "tl",
      type: "toggleListItem",
      content: [{ text: "toggle text" }],
      collapsed: true,
    },
    headingBlock("th", 3, "toggle heading text", {
      isToggleable: true,
      collapsed: false,
    }),
    {
      id: "ic",
      type: "paragraph",
      content: [
        { text: "colored", marks: [{ type: "textColor", color: "#FF0000" }] },
      ],
    },
    {
      id: "bc",
      type: "paragraph",
      content: [{ text: "aligned" }],
      textColor: "#00AA00",
      textAlignment: "center",
    },
  ];

  it("11종 모두 own export document HTML 붙여넣기로 타입·상태·content가 정확히 반영된다", () => {
    const exported = exportHtml(documentOf(...blockTypeFixtures));
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    const sourceHtml = exported.value;

    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, sourceHtml);

      const blocks = editor.getDocument().blocks;
      for (const fixture of blockTypeFixtures) {
        expect(blocks).toContainEqual({ ...fixture, id: expect.any(String) });
      }
      expect(errors).toEqual([]);
    });
  });
});

describe("중첩 보존 교차(RD-002·RD-003, 완료 조건 5)", () => {
  it("own-export data-be-children wrapper가 정상 깊이에서 비목록 부모+자식을 children으로 보존한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedParagraphWrapperHtml(2));

      const blocks = editor.getDocument().blocks;
      const parent = blocks.find(
        (block) =>
          block.type === "paragraph" && block.content[0]?.text === "t1",
      );
      expect(parent?.type === "paragraph" && parent.children).toMatchObject([
        { type: "paragraph", content: [{ text: "t2" }] },
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("생산 편집기 data-be-block-group wrapper가 비목록·목록 부모+자식을 함께 보존한다", () => {
    const paragraphParent = paragraphBlock("np", "parent", [
      paragraphBlock("nc", "child"),
    ]);
    const listParent = listItemBlock("lp", "bulletListItem", "parent", {
      children: [listItemBlock("lc", "bulletListItem", "child")],
    });
    const sourceHtml = productionHtml(
      productionDocumentOf(paragraphParent, listParent),
    );

    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, sourceHtml);

      const blocks = editor.getDocument().blocks;
      const pastedParagraphParent = blocks.find(
        (block) =>
          block.type === "paragraph" && block.content[0]?.text === "parent",
      );
      expect(
        pastedParagraphParent?.type === "paragraph" &&
          pastedParagraphParent.children,
      ).toMatchObject([{ type: "paragraph", content: [{ text: "child" }] }]);

      const pastedListParent = blocks.find(
        (block) =>
          block.type === "bulletListItem" &&
          block.content[0]?.text === "parent",
      );
      expect(
        pastedListParent?.type === "bulletListItem" &&
          pastedListParent.children,
      ).toMatchObject([
        { type: "bulletListItem", content: [{ text: "child" }] },
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("id 유일성(비표 own HTML, 완료 조건 6)", () => {
  it("대상 문서와 같은 data-be-block-id를 담은 own HTML을 붙여넣어도 id 유일성이 유지되고 undo 1회로 복원된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);
    const beforeBlocks = editor.getDocument().blocks;

    withUnhandledErrorTracking((errors) => {
      // "block-1"은 paragraphDocument가 만드는 대상 문서의 실제 블록 id다
      // (editor-controller-support.ts) — 충돌하지 않는 임의 id가 아니라
      // 대상 문서와 실제로 같은 id를 쓴다.
      pasteHtml(editable, '<p data-be-block-id="block-1">dup</p>');

      const blocks = editor.getDocument().blocks;
      const ids = blocks.map((block) => block.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(errors).toEqual([]);
    });

    // revision은 undo 자신도 하나 발행하는 명령 카운터라 원본 값으로
    // 되돌아가지 않는다(editor-controller-revision.test.ts "undo와
    // redo마다 revision을 하나씩 발행한다") — blocks만 비교한다.
    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(beforeBlocks);
  });
});
