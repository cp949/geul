/**
 * paragraph를 막은 enabledBlockTypes에서 문서 끝 블록의 Delete가 병합 대상 없이
 * 키만 소비하는지 확인한다(Issue #412).
 *
 * paragraph를 허용하면 TrailingBlockExtension이 문서 끝에 빈 paragraph를 붙여
 * 둔다. 마지막 블록은 늘 그 paragraph라 Delete가 도달하는 끝은 빈 paragraph뿐이다
 * (Issue #404가 소비한다). paragraph를 막으면 trailing 문단이 없어 어떤 블록이든
 * 문서 끝이 된다. 이때 Delete가 키를 소비하지 않으면 Tiptap 기본 체인의
 * deleteCurrentNode가 빈 블록을 스키마 기본 채움 타입(heading)으로 되채운다.
 *
 * | 상황                                       | 처리                   |
 * | ------------------------------------------ | ---------------------- |
 * | 끝 블록(빈 블록 또는 캐럿이 끝인 글자 블록) | 키 소비, tr 없음       |
 * | 빈 codeBlock, 최상위 유일한 블록           | 키 소비, tr 없음       |
 * | 빈 codeBlock, 앞 블록 있음                 | 블록 삭제(undo 1회)    |
 * | 빈 codeBlock, 중첩 유일 자식               | 블록 삭제(undo 1회)    |
 *
 * 설정 2종(paragraph 단독, paragraph+heading+quote+callout) × 타입 8종 ×
 * 위치 3종(단독, 앞 heading 뒤, toggle 아래 중첩) × 텍스트 2종(빈, `ab`)이다.
 * heading·quote·callout을 막은 설정에서 그 타입이 필요한 조합은 문서 로드가
 * 거절돼 그 거절만 확인한다. 대조군은 enabledBlockTypes를 undefined로 명시한다
 * (기본 인자 `= deny` 패턴은 undefined를 deny로 치환해 대조군을 무효로 만든다).
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";

import { createEditor } from "../../src/index.js";
import { contentTextStart, dispatchKeydown } from "../block-test-support.js";
import { blocksOf, outline } from "../clipboard-test-support.js";
import {
  calloutBlock,
  checkListItemBlock,
  codeBlockBlock,
  dividerBlock,
  documentOf,
  headingBlock,
  listItemBlock,
  mountTiptapEditor,
  oneCellTableBlock,
  quoteBlock,
  sequentialIds,
} from "../editor-controller-support.js";
import {
  denyBlockTypes,
  expectKeyConsumedUnchanged,
  expectNoDeniedNodes,
  PARAGRAPH_BLOCKED_SETTINGS,
  pressCountingDocChanges,
  type DeniedType,
  type EnabledBlockTypes,
} from "./block-join-test-support.js";

// 대상 블록 타입 8종. 이 타입이 막혀 있으면 문서 로드가 거절된다.
const TYPES: ReadonlyArray<{
  name: DeniedType;
  build: (id: string, text: string) => Block;
}> = [
  {
    name: "bulletListItem",
    build: (id, text) => listItemBlock(id, "bulletListItem", text),
  },
  {
    name: "numberedListItem",
    build: (id, text) => listItemBlock(id, "numberedListItem", text),
  },
  {
    name: "checkListItem",
    build: (id, text) => checkListItemBlock(id, text, false),
  },
  {
    name: "toggleListItem",
    build: (id, text) => listItemBlock(id, "toggleListItem", text),
  },
  { name: "heading", build: (id, text) => headingBlock(id, 2, text) },
  { name: "quote", build: (id, text) => quoteBlock(id, text) },
  { name: "callout", build: (id, text) => calloutBlock(id, text) },
  { name: "codeBlock", build: (id, text) => codeBlockBlock(id, text) },
];

// 위치 3종. 대상 블록 id는 항상 "i"이고 캐럿은 그 텍스트 끝이다.
type Position = {
  name: string;
  // 대상 블록을 문서에 놓는 방식. 문서 끝에 대상이 온다.
  place: (target: Block) => Block[];
  // 위치 자체가 요구하는 타입.
  needs: readonly DeniedType[];
  // 대상이 문서의 유일한 최상위 블록인가.
  alone: boolean;
};

const POSITIONS: readonly Position[] = [
  { name: "단독", place: (target) => [target], needs: [], alone: true },
  {
    name: "앞 heading 뒤",
    place: (target) => [headingBlock("h", 2, "x"), target],
    needs: ["heading"],
    alone: false,
  },
  {
    name: "toggle 아래 중첩",
    place: (target) => [
      listItemBlock("t", "toggleListItem", "t", { children: [target] }),
    ],
    needs: ["toggleListItem"],
    alone: false,
  },
];

// 문서를 마운트하고 캐럿을 블록 "i"의 텍스트 끝에 둔다. 빈 블록이면 시작이다.
const mountAtEnd = (
  blocks: Block[],
  text: string,
  enabledBlockTypes: EnabledBlockTypes | undefined,
) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
    // exactOptionalPropertyTypes라 undefined는 키째 뺀다.
    ...(enabledBlockTypes === undefined ? {} : { enabledBlockTypes }),
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  tiptap.commands.setTextSelection(contentTextStart(tiptap, "i") + text.length);
  return { editor, tiptap };
};

// Delete가 문서를 바꾸지 않고 키만 소비한다. selection과 undo 깊이도 그대로다.
const expectDeleteConsumedOnly = (tiptap: TiptapEditor): void => {
  const selection = tiptap.state.selection;
  const depth = undoDepth(tiptap.state);

  expectKeyConsumedUnchanged(tiptap, () => dispatchKeydown(tiptap, "Delete"));

  expect(tiptap.state.selection.eq(selection)).toBe(true);
  expect(undoDepth(tiptap.state)).toBe(depth);
};

describe("paragraph를 막은 설정의 문서 끝 블록 Delete(Issue #412)", () => {
  for (const setting of PARAGRAPH_BLOCKED_SETTINGS) {
    describe(`${setting.name} 막음`, () => {
      for (const type of TYPES) {
        describe(`${type.name}`, () => {
          for (const position of POSITIONS) {
            for (const text of ["", "ab"]) {
              const label = text === "" ? "빈 블록" : "글자 있는 블록";
              const blocks = (): Block[] =>
                position.place(type.build("i", text));
              const needed = [type.name, ...position.needs];
              const rejected = needed.some((name) =>
                setting.denied.includes(name),
              );

              if (rejected) {
                it(`${position.name} / ${label}: 막은 타입이 필요하니 문서 로드가 거절된다`, () => {
                  expect(() => {
                    const editor = createEditor({
                      initialDocument: documentOf(...blocks()),
                      createId: sequentialIds("id"),
                      enabledBlockTypes: denyBlockTypes(setting.denied),
                    });
                    mountTiptapEditor(editor);
                  }).toThrow(/disabled/);
                });
                continue;
              }

              // 빈 codeBlock은 문서에 다른 블록이 남으면 지워진다. 그 밖은 전부 키만 소비한다.
              const deletesCodeBlock =
                type.name === "codeBlock" && text === "" && !position.alone;

              if (deletesCodeBlock) {
                it(`${position.name} / ${label}: 빈 codeBlock을 지우고 undo 한 번으로 복원한다`, () => {
                  const { editor, tiptap } = mountAtEnd(
                    blocks(),
                    text,
                    denyBlockTypes(setting.denied),
                  );
                  const beforeJson = tiptap.state.doc.toJSON();
                  const beforeOutline = outline(blocksOf(editor));

                  const result = pressCountingDocChanges(tiptap, () =>
                    dispatchKeydown(tiptap, "Delete"),
                  );

                  expect(result).toEqual({ handled: true, docChanged: 1 });
                  expect(outline(blocksOf(editor))).not.toEqual(beforeOutline);
                  expectNoDeniedNodes(tiptap, setting.denied);

                  tiptap.commands.undo();
                  expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
                });
                continue;
              }

              it(`${position.name} / ${label}: 키만 소비하고 문서·selection·undo가 그대로다`, () => {
                const { editor, tiptap } = mountAtEnd(
                  blocks(),
                  text,
                  denyBlockTypes(setting.denied),
                );
                const beforeOutline = outline(blocksOf(editor));

                expectDeleteConsumedOnly(tiptap);

                expect(outline(blocksOf(editor))).toEqual(beforeOutline);
                expectNoDeniedNodes(tiptap, setting.denied);
              });
            }
          }
        });
      }
    });
  }
});

describe("paragraph를 막은 설정의 문서 끝 Delete 재현(Issue #412)", () => {
  const paragraphOnly = denyBlockTypes(["paragraph"]);

  it("빈 bullet 단독 문서는 Delete 뒤에도 빈 bullet이다", () => {
    const { editor, tiptap } = mountAtEnd(
      [listItemBlock("i", "bulletListItem", "")],
      "",
      paragraphOnly,
    );

    expectDeleteConsumedOnly(tiptap);

    expect(outline(blocksOf(editor))).toEqual(["ul:"]);
  });

  it("heading 뒤 빈 bullet은 Delete 뒤에도 그대로다", () => {
    const { editor, tiptap } = mountAtEnd(
      [headingBlock("h", 2, "x"), listItemBlock("i", "bulletListItem", "")],
      "",
      paragraphOnly,
    );

    expectDeleteConsumedOnly(tiptap);

    expect(outline(blocksOf(editor))).toEqual(["h2:x", "ul:"]);
  });

  it("toggle 아래 마지막 빈 bullet은 Delete 뒤에도 그대로다", () => {
    const { editor, tiptap } = mountAtEnd(
      [
        listItemBlock("t", "toggleListItem", "t", {
          children: [listItemBlock("i", "bulletListItem", "")],
        }),
      ],
      "",
      paragraphOnly,
    );

    expectDeleteConsumedOnly(tiptap);

    expect(outline(blocksOf(editor))).toEqual(["toggle:t[ul:]"]);
  });

  it("quote 아래 마지막 빈 heading은 Delete 뒤에도 그대로다", () => {
    const { editor, tiptap } = mountAtEnd(
      [quoteBlock("q", "q", [headingBlock("i", 2, "")])],
      "",
      paragraphOnly,
    );

    expectDeleteConsumedOnly(tiptap);

    expect(outline(blocksOf(editor))).toEqual(["quote:q[h2:]"]);
  });

  // 끝 블록 뒤에 atom·표만 있으면 탐색이 그것들을 건너뛰어 병합 대상이 없다.
  for (const [name, tail] of [
    ["divider", dividerBlock("d")],
    ["표", oneCellTableBlock("t")],
  ] as const) {
    it(`빈 bullet 뒤에 ${name}뿐이면 Delete는 키만 소비한다`, () => {
      const { editor, tiptap } = mountAtEnd(
        [listItemBlock("i", "bulletListItem", ""), tail],
        "",
        paragraphOnly,
      );
      const beforeOutline = outline(blocksOf(editor));

      expectDeleteConsumedOnly(tiptap);

      expect(outline(blocksOf(editor))).toEqual(beforeOutline);
    });
  }
});

describe("paragraph를 막지 않은 대조군(Issue #412)", () => {
  // enabledBlockTypes를 undefined로 명시한다 — deny 기본 인자로 치환되지 않는다.
  // 끝의 "p:"는 문서가 목록 항목으로 끝나서 TrailingBlockExtension이 붙인 문단이다.
  it("문서 끝 빈 bullet의 Delete는 trailing 문단 앞에서 키만 소비한다", () => {
    const { editor, tiptap } = mountAtEnd(
      [listItemBlock("i", "bulletListItem", "")],
      "",
      undefined,
    );
    expect(outline(blocksOf(editor))).toEqual(["ul:", "p:"]);

    expectDeleteConsumedOnly(tiptap);

    expect(outline(blocksOf(editor))).toEqual(["ul:", "p:"]);
  });
});
