/**
 * ClipboardPasteExtension이 목록류 HTML(외부 ul/ol, own-format 체크·토글
 * 목록, RD-003 production 마커)을 통합 경로(io.importHtml)로 처리하는지
 * 검증한다(Issue #38 슬라이스 10 RD-005). 옛 ListPasteFallbackExtension이
 * 독립 DOM 파서로 처리하던 시나리오(list-paste-fallback.test.ts, 삭제됨)를
 * 이 파일로 이관하고, production 왕복과 own-format 체크 목록 시나리오를
 * 새로 추가한다. quote-paste-fallback.test.ts와 같은 패턴(errors 이벤트
 * 리스너로 미처리 예외 감지)을 쓴다.
 */
import {
  isInlineContentBlockType,
  isNestableBlockType,
  MAX_NESTING_DEPTH,
  type Block,
  type InlineContentBlockType,
  type NestableBlockType,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  pasteHtml,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  dividerBlock,
  documentOf,
  editorWithTable,
  listItemBlock,
  maxBlockDepth,
  mountTiptapEditor,
  paragraphDocument,
  selectBlockNode,
  sequentialIds,
} from "./editor-controller-support.js";
import {
  productionDocumentOf,
  productionHtml,
} from "./production-editor-test-support.js";
import { placeCaretInCell } from "./table-test-support.js";

/** depth단짜리 <ul><li>...</li></ul> 체인 HTML — li가 정확히 depth개
 * 중첩된다(리프는 leafText, 그 외는 "x"). */
const nestedListHtml = (depth: number, leafText: string): string => {
  let html = `<li>${leafText}</li>`;
  for (let level = 1; level < depth; level += 1) {
    html = `<li>x<ul>${html}</ul></li>`;
  }
  return `<ul>${html}</ul>`;
};

/** depth단짜리 bulletListItem 체인 model Block — chain-1이 top-level,
 * chain-depth가 가장 깊다(top-level=1 기준 절대 깊이 depth). */
const buildListDepthChain = (depth: number): Block => {
  let innermost = listItemBlock(`chain-${depth}`, "bulletListItem", "leaf");
  for (let level = depth - 1; level >= 1; level -= 1) {
    innermost = listItemBlock(`chain-${level}`, "bulletListItem", "mid", {
      children: [innermost],
    });
  }
  return innermost;
};

/** depth단짜리 bulletListItem 체인이되, 가장 깊은 자리(chain-depth)가
 * bulletListItem이 아니라 divider인 model Block — buildListDepthChain과
 * 같은 모양이지만 리프만 다르다. divider는 blockContainer로 감싸이지
 * 않고 blockGroup의 직계 자식으로 나란히 들어간다(divider-extension.ts
 * 상단 주석)는 스키마 사실을 그대로 이용해, 실제 프로덕션 경로
 * (BlockJoinExtension.selectAdjacentAtom)가 만드는 것과 같은 "divider
 * 바로 앞 경계" NodeSelection을 그 depth에 재현한다. */
const buildListChainEndingInDivider = (depth: number): Block => {
  let innermost: Block = dividerBlock(`chain-${depth}`);
  for (let level = depth - 1; level >= 1; level -= 1) {
    innermost = listItemBlock(`chain-${level}`, "bulletListItem", "mid", {
      children: [innermost],
    });
  }
  return innermost;
};

describe("외부 ul/ol HTML 붙여넣기", () => {
  it("문단 사이 목록이 섞인 외부 HTML을 붙여넣으면 throw 없이 bulletListItem이 문서에 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<p>a</p><ul><li>x</li><li>y</li></ul><p>b</p>");

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "bulletListItem");
      expect(items).toHaveLength(2);
      expect(items.map((item) => item.content)).toEqual([
        [{ text: "x" }],
        [{ text: "y" }],
      ]);

      expect(errors).toEqual([]);
    });
  });

  it("ol[start]가 첫 li의 numberedListItem.startNumber로 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, '<ol start="5"><li>z</li><li>w</li></ol>');

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "numberedListItem");
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        content: [{ text: "z" }],
        startNumber: 5,
      });
      expect(items[1]?.startNumber).toBeUndefined();

      expect(errors).toEqual([]);
    });
  });

  // model schema의 startNumber 범위(min(0).max(999_999_999))를 벗어난 값이
  // 검증 없이 insertContent되면 readEditorDocument가 그 범위 위반을
  // throw new TypeError로 바꿔 모델↔에디터를 영구 desync시킨다(트랙-6 결함
  // 탐지 BLOCKER, list-paste-fallback.test.ts 이월). 범위 밖 값은 explicit
  // start가 아예 없었던 것처럼(undefined) 처리해 throw 없이 진행돼야 한다.
  it("ol[start]가 model 범위를 벗어나면 무시되고 기본 번호로 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, '<ol start="-1"><li>z</li></ol>');

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "numberedListItem");
      expect(items).toHaveLength(1);
      expect(items[0]?.content).toEqual([{ text: "z" }]);
      expect(items[0]?.startNumber).toBeUndefined();

      expect(errors).toEqual([]);
    });
  });

  it("중첩 목록이 children 트리로 반영되고 순서가 보존된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "bulletListItem");
      expect(items).toHaveLength(2);
      expect(items[0]?.content).toEqual([{ text: "a" }]);
      expect(items[0]?.children).toHaveLength(1);
      expect(items[0]?.children?.[0]).toMatchObject({
        type: "bulletListItem",
        content: [{ text: "b" }],
      });
      expect(items[1]?.content).toEqual([{ text: "c" }]);
      expect(items[1]?.children).toBeUndefined();

      expect(errors).toEqual([]);
    });
  });

  it("MAX_NESTING_DEPTH를 단독으로 넘는 깊게 중첩된 목록을 최상위에 붙이면 throw 없이 상한 안으로 평탄화된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(MAX_NESTING_DEPTH + 10, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBeLessThanOrEqual(
        MAX_NESTING_DEPTH,
      );
      const leaf = document.blocks
        .flatMap(function collect(block): Block[] {
          const children = isNestableBlockType(block.type)
            ? ((block as Extract<Block, { type: NestableBlockType }>)
                .children ?? [])
            : [];
          return [block, ...children.flatMap(collect)];
        })
        .find(
          (block) =>
            isInlineContentBlockType(block.type) &&
            (block as Extract<Block, { type: InlineContentBlockType }>)
              .content[0]?.text === "leaf",
        );
      expect(leaf).toBeDefined();
    });
  });

  it("이미 깊은 위치에 캐럿을 두고 목록을 추가로 붙이면 합산 깊이가 상한을 넘어도 throw 없이 평탄화된다", () => {
    const deepChainDepth = 60;
    const editor = createEditor({
      initialDocument: documentOf(buildListDepthChain(deepChainDepth)),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, `chain-${deepChainDepth}`),
    );

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(10, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBeLessThanOrEqual(
        MAX_NESTING_DEPTH,
      );
    });
  });

  // 상한 근처에서 clampDepth의 "초과 지점 형제 승격" 전략이 시작 깊이 1단
  // 차이를 흡수해 off-by-one을 잡지 못하는 depth 조합이 있다(list-paste-
  // fallback.test.ts 트랙-7 결함 탐지 결함 2 주석 이월) — 이 테스트는
  // off-by-one 판별용이 아니라 "상한 근접에서 clamp가 정확히
  // MAX_NESTING_DEPTH에서 발동/도달하는가"만 고정한다. 판별력 있는 테스트는
  // 바로 다음 테스트다.
  it("깊이 62의 목록 체인에 캐럿을 두고 5단 목록을 붙이면 상한 근접 clamp가 정확히 MAX_NESTING_DEPTH에서 발동한다", () => {
    const deepChainDepth = 62;
    const editor = createEditor({
      initialDocument: documentOf(buildListDepthChain(deepChainDepth)),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, `chain-${deepChainDepth}`),
    );

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(5, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBe(MAX_NESTING_DEPTH);
    });
  });

  // 상한과 충분히(levels=5) 떨어진 시작 깊이에서는 clampDepth의
  // startDepth>=MAX_NESTING_DEPTH 조건이 전혀 발동하지 않아 결과 트리의
  // 각 레벨 depth가 정확히 startDepth, startDepth+1, …이 된다 — off-by-one
  // 이면(+1이든 -1이든) 이 값과 어긋난다(list-paste-fallback.test.ts
  // 트랙-7 결함 탐지 결함 2 이월, 실제 판별력을 갖는 테스트).
  it("상한에서 멀리 떨어진 위치에 목록을 붙이면 결과 최대 깊이가 정확한 값이 된다", () => {
    const deepChainDepth = 30;
    const levels = 5;
    const editor = createEditor({
      initialDocument: documentOf(buildListDepthChain(deepChainDepth)),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, `chain-${deepChainDepth}`),
    );

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(levels, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBe(deepChainDepth + levels - 1);
    });
  });

  // divider(divider-extension.ts)는 blockContainer로 감싸이지 않고
  // blockGroup/doc의 직계 자식으로 나란히 들어간다 — Backspace/Delete로
  // divider가 인접하면(block-join-extension.ts의 selectAdjacentAtom) 그
  // 자리에 NodeSelection이 서고, 그 $anchor는 "divider 바로 앞 경계"
  // 위치라 modelDepthAt이 원래 전제하는 계약과 정확히 일치한다(-1 보정이
  // 필요 없다) — 이 상태를 selectBlockNode로 재현한다. divider를
  // MAX_NESTING_DEPTH(64)에 두고 2단 목록을 붙였을 때 -1 보정을 잘못
  // 적용하면 clampDepth가 targetDepth를 63으로 오산해 flatten을 한 단
  // 늦게 시작해 상한을 넘긴다(list-paste-fallback.test.ts 트랙-7 결함
  // 탐지 결함 1 회귀 이월).
  it("divider가 MAX_NESTING_DEPTH에서 NodeSelection으로 선택된 상태로 목록을 붙이면 throw 없이 상한 안으로 유지된다", () => {
    const dividerDepth = MAX_NESTING_DEPTH;
    const editor = createEditor({
      initialDocument: documentOf(buildListChainEndingInDivider(dividerDepth)),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    selectBlockNode(tiptap, `chain-${dividerDepth}`);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(2, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBeLessThanOrEqual(
        MAX_NESTING_DEPTH,
      );
    });
  });

  // 목록은 표 셀의 블록 자식이 될 수 없다는 기존 제약(model
  // TableCell.content: InlineContent) 위에 새 동작을 얹지 않는다 — R1 표
  // 계약 그대로(RD-005 완료 조건 5, clipboard-paste-extension.test.ts의
  // 일반 사례를 목록으로 특화).
  it("표 셀 안에서는 목록 HTML 붙여넣기를 가로채지 않는다", () => {
    const { editor, cellIds } = editorWithTable();
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    const cellId = cellIds[0];
    if (cellId === undefined) throw new Error("셀 fixture 준비 실패");
    placeCaretInCell(tiptap, cellId);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<ul><li>x</li></ul>");

      const blocks = editor.getDocument().blocks;
      expect(blocks.filter((block) => block.type === "table")).toHaveLength(1);
      expect(blocks.some((block) => block.type === "bulletListItem")).toBe(
        false,
      );
      expect(errors).toEqual([]);
    });
  });
});

describe("own-format 체크 목록 붙여넣기", () => {
  it("data-be-checked가 붙은 li는 checkListItem으로 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(
        editable,
        '<ul><li data-be-checked="true">done</li><li data-be-checked="false">todo</li></ul>',
      );

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "checkListItem");
      expect(items).toHaveLength(2);
      expect(
        items.map((item) => (item as { checked?: boolean }).checked),
      ).toEqual([true, false]);

      expect(errors).toEqual([]);
    });
  });
});

describe("production 목록류 렌더 DOM 붙여넣기(RD-003 왕복)", () => {
  it("production 렌더 HTML을 붙여넣으면 타입과 상태가 그대로 반영된다", () => {
    const sourceHtml = productionHtml(
      productionDocumentOf(
        { id: "B", type: "bulletListItem", content: [{ text: "bullet" }] },
        {
          id: "N",
          type: "numberedListItem",
          content: [{ text: "num" }],
          startNumber: 3,
        },
        {
          id: "C",
          type: "checkListItem",
          content: [{ text: "check" }],
          checked: true,
        },
        {
          id: "T",
          type: "toggleListItem",
          content: [{ text: "toggle" }],
          collapsed: true,
        },
      ),
    );

    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, sourceHtml);

      const blocks = editor.getDocument().blocks;
      expect(blocks).toContainEqual({
        id: expect.any(String),
        type: "bulletListItem",
        content: [{ text: "bullet" }],
      });
      expect(blocks).toContainEqual({
        id: expect.any(String),
        type: "numberedListItem",
        content: [{ text: "num" }],
        startNumber: 3,
      });
      expect(blocks).toContainEqual({
        id: expect.any(String),
        type: "checkListItem",
        content: [{ text: "check" }],
        checked: true,
      });
      expect(blocks).toContainEqual({
        id: expect.any(String),
        type: "toggleListItem",
        content: [{ text: "toggle" }],
        collapsed: true,
      });

      expect(errors).toEqual([]);
    });
  });
});
