/**
 * paragraph를 막은 enabledBlockTypes에서 문서 첫 텍스트 위치의 빈 텍스트
 * 블록 Backspace가 키만 소비하는지 확인한다(Issue #413).
 *
 * 앞에 병합할 블록이 없고 paragraph도 없으면 joinBackwardAtBlockStart가
 * false를 반환했다. 키가 Tiptap 기본 체인으로 새면 Keymap handleBackspace의
 * clearNodes()가 문서 첫 텍스트 위치의 빈 비-paragraph 텍스트블록을 스키마
 * 기본 채움 타입(level 1 heading)으로 바꾼다. 빈 h1은 겉모양 변화 없이 undo
 * 단위만 남는다. 앞이 divider·표뿐인 빈 블록은 문서 첫 텍스트 위치가 아니라
 * clearNodes가 닿지 않고, 기존대로 블록이 지워진다.
 *
 * | 상황                                         | 처리                  |
 * | -------------------------------------------- | --------------------- |
 * | 문서 첫 위치의 빈 블록(단독, 뒤에 다른 블록) | 키 소비, tr 없음      |
 * | 문서 첫 위치의 글자 있는 블록, 캐럿이 선두   | 문서 그대로(기존)     |
 * | 앞이 divider인 빈 블록                       | 블록 삭제(undo 1회)   |
 * | 앞에 heading이 있는 빈 블록                  | 병합(undo 1회)        |
 *
 * 설정 2종(paragraph 단독, paragraph+heading+quote+callout) × 대상 4종(h1, h2,
 * quote, callout) × 위치 4종 × 텍스트 2종(빈, `ab`)이다. 앞이 divider·heading인
 * 위치는 빈 블록만 다룬다. heading·quote·callout을 막은 설정에서 그 타입이
 * 필요한 조합은 문서 로드가 거절돼 그 거절만 확인한다. 대조군은
 * enabledBlockTypes를 undefined로 명시한다(기본 인자 `= deny` 패턴은
 * undefined를 deny로 치환해 대조군을 무효로 만든다).
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
  dividerBlock,
  documentOf,
  headingBlock,
  mountTiptapEditor,
  quoteBlock,
  sequentialIds,
} from "../editor-controller-support.js";
import {
  denyBlockTypes,
  expectBackspaceConsumedOnly,
  expectNoDeniedNodes,
  mountAtBlockStart,
  PARAGRAPH_BLOCKED_SETTINGS,
  pressCountingDocChanges,
  type DeniedType,
} from "./block-join-test-support.js";

// 대상 블록 타입 4종. 이 타입이 막혀 있으면 문서 로드가 거절된다.
const TYPES: ReadonlyArray<{
  name: DeniedType;
  label: string;
  build: (id: string, text: string) => Block;
}> = [
  {
    name: "heading",
    label: "h1",
    build: (id, text) => headingBlock(id, 1, text),
  },
  {
    name: "heading",
    label: "h2",
    build: (id, text) => headingBlock(id, 2, text),
  },
  {
    name: "quote",
    label: "quote",
    build: (id, text) => quoteBlock(id, text),
  },
  {
    name: "callout",
    label: "callout",
    build: (id, text) => calloutBlock(id, text),
  },
];

// 위치 4종. 대상 블록 id는 항상 "i"이고 캐럿은 그 텍스트 선두다.
type Position = {
  name: string;
  place: (target: Block) => Block[];
  // 위치 자체가 요구하는 타입.
  needs: readonly DeniedType[];
  // 대상이 문서 첫 텍스트 위치인가. 그렇지 않으면 빈 블록만 다룬다.
  atStart: boolean;
};

const POSITIONS: readonly Position[] = [
  { name: "단독", place: (target) => [target], needs: [], atStart: true },
  {
    name: "뒤에 heading",
    place: (target) => [target, headingBlock("h", 2, "x")],
    needs: ["heading"],
    atStart: true,
  },
  {
    name: "앞에 divider",
    place: (target) => [dividerBlock("d"), target],
    needs: [],
    atStart: false,
  },
  {
    name: "앞에 heading",
    place: (target) => [headingBlock("h", 2, "x"), target],
    needs: ["heading"],
    atStart: false,
  },
];

// 글자 있는 최선두 블록의 Backspace는 키를 소비하지 않아도 문서·selection·undo가
// 그대로다. 키 소비 여부는 이 경로의 계약이 아니라 기존 동작이다.
const expectBackspaceLeavesDocument = (tiptap: TiptapEditor): void => {
  const beforeJson = tiptap.state.doc.toJSON();
  const selection = tiptap.state.selection;
  const depth = undoDepth(tiptap.state);

  const result = pressCountingDocChanges(tiptap, () =>
    dispatchKeydown(tiptap, "Backspace"),
  );

  expect(result.docChanged).toBe(0);
  expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
  expect(tiptap.state.selection.eq(selection)).toBe(true);
  expect(undoDepth(tiptap.state)).toBe(depth);
};

describe("paragraph를 막은 설정의 문서 첫 위치 Backspace(Issue #413)", () => {
  for (const setting of PARAGRAPH_BLOCKED_SETTINGS) {
    describe(`${setting.name} 막음`, () => {
      for (const type of TYPES) {
        describe(`${type.label}`, () => {
          for (const position of POSITIONS) {
            for (const text of position.atStart ? ["", "ab"] : [""]) {
              const label = text === "" ? "빈 블록" : "글자 있는 블록";
              // 케이스마다 한 번만 쓰므로 미리 만들어 둔다.
              const documentBlocks = position.place(type.build("i", text));
              const needsDenied = [type.name, ...position.needs].some((name) =>
                setting.denied.includes(name),
              );

              if (needsDenied) {
                it(`${position.name} / ${label}: 막은 타입이 필요하니 문서 로드가 거절된다`, () => {
                  expect(() => {
                    const editor = createEditor({
                      initialDocument: documentOf(...documentBlocks),
                      createId: sequentialIds("id"),
                      enabledBlockTypes: denyBlockTypes(setting.denied),
                    });
                    mountTiptapEditor(editor);
                  }).toThrow(/disabled/);
                });
                continue;
              }

              if (position.atStart) {
                const title =
                  text === ""
                    ? "키만 소비하고 문서·selection·undo가 그대로다"
                    : "문서·selection·undo가 그대로다";
                it(`${position.name} / ${label}: ${title}`, () => {
                  const { editor, tiptap } = mountAtBlockStart(
                    documentBlocks,
                    denyBlockTypes(setting.denied),
                  );
                  const beforeOutline = outline(blocksOf(editor));

                  if (text === "") expectBackspaceConsumedOnly(tiptap);
                  else expectBackspaceLeavesDocument(tiptap);

                  expect(outline(blocksOf(editor))).toEqual(beforeOutline);
                  expectNoDeniedNodes(tiptap, setting.denied);
                });
                continue;
              }

              it(`${position.name} / ${label}: 빈 블록을 지우고 undo 한 번으로 복원한다`, () => {
                const { editor, tiptap } = mountAtBlockStart(
                  documentBlocks,
                  denyBlockTypes(setting.denied),
                );
                const beforeJson = tiptap.state.doc.toJSON();
                const beforeOutline = outline(blocksOf(editor));

                const result = pressCountingDocChanges(tiptap, () =>
                  dispatchKeydown(tiptap, "Backspace"),
                );

                expect(result).toEqual({ handled: true, docChanged: 1 });
                expect(outline(blocksOf(editor))).not.toEqual(beforeOutline);
                expectNoDeniedNodes(tiptap, setting.denied);

                tiptap.commands.undo();
                expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
              });
            }
          }
        });
      }
    });
  }
});

describe("paragraph를 막은 설정의 문서 첫 위치 Backspace 재현(Issue #413)", () => {
  const paragraphOnly = denyBlockTypes(["paragraph"]);

  for (const [name, build, expected] of [
    ["빈 h2", () => headingBlock("i", 2, ""), "h2:"],
    ["빈 h1", () => headingBlock("i", 1, ""), "h1:"],
    ["빈 quote", () => quoteBlock("i", ""), "quote:"],
    ["빈 callout", () => calloutBlock("i", ""), "callout:"],
  ] as const) {
    it(`${name} 단독 문서는 Backspace 뒤에도 그대로다`, () => {
      const { editor, tiptap } = mountAtBlockStart([build()], paragraphOnly);

      expectBackspaceConsumedOnly(tiptap);

      expect(outline(blocksOf(editor))).toEqual([expected]);
    });
  }

  it("뒤에 다른 블록이 있는 빈 quote는 Backspace 뒤에도 그대로다", () => {
    const { editor, tiptap } = mountAtBlockStart(
      [quoteBlock("i", ""), headingBlock("h", 2, "x")],
      paragraphOnly,
    );

    expectBackspaceConsumedOnly(tiptap);

    expect(outline(blocksOf(editor))).toEqual(["quote:", "h2:x"]);
  });

  // 가설 확인용 프로브: 첫 블록이 자식을 가진 빈 텍스트 블록이어도 소비하고 자식이 그대로다.
  for (const [name, build, expected] of [
    [
      "빈 quote",
      () => quoteBlock("i", "", [headingBlock("k", 2, "kid")]),
      ["quote:[h2:kid]"],
    ],
    [
      "빈 callout",
      () => calloutBlock("i", "", undefined, [headingBlock("k", 2, "kid")]),
      ["callout:[h2:kid]"],
    ],
  ] as const) {
    it(`자식이 있는 ${name} 단독 문서는 Backspace 뒤에도 자식이 그대로다`, () => {
      const { editor, tiptap } = mountAtBlockStart([build()], paragraphOnly);

      expectBackspaceConsumedOnly(tiptap);

      expect(outline(blocksOf(editor))).toEqual(expected);
    });
  }
});

describe("paragraph를 막은 설정의 인라인 원소만 든 최선두 블록(Issue #413)", () => {
  // Tiptap clearNodes 진입 조건은 textContent가 비어 있는 것이다. 인라인 원소는
  // textContent에 안 잡히므로 content.size가 1이어도 같은 경로로 샌다.
  it("인라인 원소만 든 h2 단독 문서는 Backspace 뒤에도 그대로다", () => {
    const editor = createEditor({
      initialDocument: documentOf({
        id: "i",
        type: "heading",
        level: 2,
        content: [{ type: "custom", customType: "myTag" }],
      }),
      createId: sequentialIds("id"),
      enabledBlockTypes: denyBlockTypes(["paragraph"]),
      customInlineContent: {
        myTag: { render: () => document.createElement("span") },
      },
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "i"));
    const before = outline(blocksOf(editor));

    expectBackspaceConsumedOnly(tiptap);

    expect(outline(blocksOf(editor))).toEqual(before);
    expect(before[0]).toMatch(/^h2:/);
  });
});

describe("paragraph를 막지 않은 대조군(Issue #413)", () => {
  // enabledBlockTypes를 undefined로 명시한다 — deny 기본 인자로 치환되지 않는다.
  // 끝의 "p:"는 문서가 heading으로 끝나서 TrailingBlockExtension이 붙인 문단이다.
  it("빈 h2 단독 문서의 Backspace는 문단으로 바꾼다", () => {
    const { editor, tiptap } = mountAtBlockStart(
      [headingBlock("i", 2, "")],
      undefined,
    );
    expect(outline(blocksOf(editor))).toEqual(["h2:", "p:"]);

    const result = pressCountingDocChanges(tiptap, () =>
      dispatchKeydown(tiptap, "Backspace"),
    );

    expect(result).toEqual({ handled: true, docChanged: 1 });
    expect(outline(blocksOf(editor))).toEqual(["p:", "p:"]);
  });
});
