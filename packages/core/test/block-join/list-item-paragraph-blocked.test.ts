/**
 * paragraph를 막은 enabledBlockTypes에서 목록 항목의 Backspace가 종료 규칙을
 * 건너뛰고 일반 규칙을 타는지 확인한다(Issue #411).
 *
 * 종료 규칙(항목을 paragraph로 바꾼다)은 대상 paragraph가 스키마에 없으면
 * false를 반환했고, 키가 Tiptap 기본 체인으로 샌다. 체인의 joinBackward는
 * 빈 항목을 앞 블록의 자식으로 들여쓰고, 앞 블록이 없으면 clearNodes가 스키마
 * 기본 채움 타입(heading)으로 바꾼다. 이제 paragraph가 없으면 종료 규칙을
 * 건너뛰고 아래 표대로 처리한다.
 *
 * | 상황                               | 처리                              |
 * | ---------------------------------- | --------------------------------- |
 * | 문서 최선두 항목(비어 있든 아니든) | 키 소비, tr 없음                  |
 * | 빈 항목, 앞 블록 있음              | 일반 병합(항목 삭제, 캐럿은 앞 끝) |
 * | toggle 헤더, 자식 있음             | 키 소비, tr 없음                  |
 * | toggle 헤더, 자식 없음             | 일반 병합                         |
 * | 코드 블록 바로 뒤 항목             | 바로 흡수, 항목 타입·id 유지      |
 *
 * 같은 설정의 빈 항목 Enter는 키를 소비하고 같은 타입의 새 빈 항목을 연다
 * (block-split-paragraph-blocked.test.ts도 같은 계약을 단언한다).
 *
 * 설정 2종(paragraph 단독, paragraph+heading+quote+callout) × 목록 4종 ×
 * 위치 5종 × 키 2종이다. heading을 막은 설정은 heading 뒤 위치의 문서 로드가
 * 거절돼 그 거절만 확인한다. 대조군은 enabledBlockTypes를 undefined로
 * 명시한다(기본 인자 `= deny` 패턴은 undefined를 deny로 치환해 대조군을
 * 무효로 만든다).
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createEditor } from "../../src/index.js";
import { dispatchKeydown } from "../block-test-support.js";
import { blocksOf, outline } from "../clipboard-test-support.js";
import {
  checkListItemBlock,
  codeBlockBlock,
  dividerBlock,
  documentOf,
  headingBlock,
  listItemBlock,
  mountTiptapEditor,
  oneCellTableBlock,
  sequentialIds,
} from "../editor-controller-support.js";
import {
  denyBlockTypes,
  expectBackspaceConsumedOnly,
  expectNoDeniedNodes,
  mountAtBlockStart,
  PARAGRAPH_BLOCKED_SETTINGS,
  pressCountingDocChanges,
} from "./block-join-test-support.js";

// 목록 4종. label은 outline 약어이고 item은 같은 모양의 항목 fixture다.
const LIST_TYPES: ReadonlyArray<{
  name: string;
  label: string;
  item: (id: string, text: string) => Block;
}> = [
  {
    name: "bulletListItem",
    label: "ul",
    item: (id, text) => listItemBlock(id, "bulletListItem", text),
  },
  {
    name: "numberedListItem",
    label: "ol",
    item: (id, text) => listItemBlock(id, "numberedListItem", text),
  },
  {
    name: "checkListItem",
    label: "checkListItem",
    item: (id, text) => checkListItemBlock(id, text, false),
  },
  {
    name: "toggleListItem",
    label: "toggle",
    item: (id, text) => listItemBlock(id, "toggleListItem", text),
  },
];

// 위치 5종. item이 없는 위치는 없다 — 대상 항목 id는 항상 "i"이고 캐럿은 그 선두다.
type Position = {
  name: string;
  // 앞 블록 fixture. 문서 최선두 위치는 비어 있다.
  before: () => Block[];
  // 대상 항목의 텍스트. 최선두 위치만 비어 있지 않다.
  text: string;
  needsHeading: boolean;
};

const POSITIONS: readonly Position[] = [
  {
    name: "빈 항목만 있는 문서",
    before: () => [],
    text: "",
    needsHeading: false,
  },
  {
    name: "heading 뒤",
    before: () => [headingBlock("h", 2, "x")],
    text: "",
    needsHeading: true,
  },
  {
    name: "목록 뒤",
    before: () => [listItemBlock("b", "bulletListItem", "x")],
    text: "",
    needsHeading: false,
  },
  {
    name: "코드 블록 뒤",
    before: () => [codeBlockBlock("c", "c")],
    text: "",
    needsHeading: false,
  },
  {
    name: "문서 최선두 비어 있지 않은 항목",
    before: () => [],
    text: "ab",
    needsHeading: false,
  },
];

// 키 하나가 문서를 정확히 한 번 바꾸고, undo 한 번이 원래 문서를 되돌린다.
// inspect는 키 직후(undo 전) 결과를 확인한다.
const expectOneUndoUnit = (
  tiptap: TiptapEditor,
  key: "Enter" | "Backspace",
  inspect: () => void,
): void => {
  const beforeJson = tiptap.state.doc.toJSON();

  const result = pressCountingDocChanges(tiptap, () =>
    dispatchKeydown(tiptap, key),
  );
  expect(result).toEqual({ handled: true, docChanged: 1 });
  inspect();

  tiptap.commands.undo();
  expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
};

describe("paragraph를 막은 설정의 목록 항목 Backspace·Enter(Issue #411)", () => {
  for (const setting of PARAGRAPH_BLOCKED_SETTINGS) {
    describe(`${setting.name} 막음`, () => {
      for (const list of LIST_TYPES) {
        describe(`${list.name}`, () => {
          for (const position of POSITIONS) {
            const blocks = (): Block[] => [
              ...position.before(),
              list.item("i", position.text),
            ];

            if (position.needsHeading && setting.denied.includes("heading")) {
              it(`${position.name}: heading을 막았으니 문서 로드가 거절된다`, () => {
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

            it(`${position.name} / Backspace: 종료 규칙을 건너뛰고 일반 규칙을 탄다`, () => {
              const { editor, tiptap } = mountAtBlockStart(
                blocks(),
                denyBlockTypes(setting.denied),
              );

              if (position.before().length === 0) {
                // 최선두: 비어 있든 아니든 키만 소비한다.
                expectBackspaceConsumedOnly(tiptap);
                expect(outline(blocksOf(editor))).toEqual([
                  `${list.label}:${position.text}`,
                ]);
              } else {
                expectOneUndoUnit(tiptap, "Backspace", () => {
                  const merged = outline(blocksOf(editor));
                  if (position.name === "heading 뒤") {
                    expect(merged).toEqual(["h2:x"]);
                  } else if (position.name === "목록 뒤") {
                    expect(merged).toEqual(["ul:x"]);
                  } else {
                    // 코드 블록 뒤: 코드가 항목에 붙고 항목 타입·id가 남는다.
                    expect(merged).toEqual([`${list.label}:c`]);
                    expect(blocksOf(editor)[0]?.id).toBe("i");
                  }
                  // 캐럿은 병합 접점이다. 세 경우 모두 한 글자 뒤다.
                  expect(tiptap.state.selection.empty).toBe(true);
                  expect(tiptap.state.selection.$from.parentOffset).toBe(1);
                  expectNoDeniedNodes(tiptap, setting.denied);
                });
                return;
              }
              expectNoDeniedNodes(tiptap, setting.denied);
            });

            it(`${position.name} / Enter: 키를 소비하고 같은 타입의 항목을 연다`, () => {
              const { editor, tiptap } = mountAtBlockStart(
                blocks(),
                denyBlockTypes(setting.denied),
              );

              const expectedItems = [
                `${list.label}:`,
                `${list.label}:${position.text}`,
              ];
              expectOneUndoUnit(tiptap, "Enter", () => {
                expect(outline(blocksOf(editor))).toEqual([
                  ...outline(position.before()),
                  ...expectedItems,
                ]);
                expectNoDeniedNodes(tiptap, setting.denied);
              });
            });
          }
        });
      }
    });
  }
});

describe("paragraph를 막은 설정의 toggle 헤더 Backspace(Issue #411)", () => {
  const withKid = (): Block =>
    listItemBlock("i", "toggleListItem", "", {
      children: [listItemBlock("k", "bulletListItem", "kid")],
    });

  for (const setting of PARAGRAPH_BLOCKED_SETTINGS) {
    it(`${setting.name} 막음: 자식 있는 빈 헤더는 키만 소비하고 자식을 승격하지 않는다`, () => {
      const { editor, tiptap } = mountAtBlockStart(
        [listItemBlock("a", "bulletListItem", "x"), withKid()],
        denyBlockTypes(setting.denied),
      );

      expectBackspaceConsumedOnly(tiptap);

      expect(outline(blocksOf(editor))).toEqual(["ul:x", "toggle:[ul:kid]"]);
      expectNoDeniedNodes(tiptap, setting.denied);
    });

    it(`${setting.name} 막음: 문서 최선두의 자식 있는 헤더는 키만 소비한다`, () => {
      const { editor, tiptap } = mountAtBlockStart(
        [withKid()],
        denyBlockTypes(setting.denied),
      );

      expectBackspaceConsumedOnly(tiptap);

      expect(outline(blocksOf(editor))).toEqual(["toggle:[ul:kid]"]);
    });

    it(`${setting.name} 막음: 자식 없는 비어 있지 않은 헤더는 앞 목록에 일반 병합한다`, () => {
      const { editor, tiptap } = mountAtBlockStart(
        [
          listItemBlock("a", "bulletListItem", "x"),
          listItemBlock("i", "toggleListItem", "ab"),
        ],
        denyBlockTypes(setting.denied),
      );

      expectOneUndoUnit(tiptap, "Backspace", () => {
        expect(outline(blocksOf(editor))).toEqual(["ul:xab"]);
        expectNoDeniedNodes(tiptap, setting.denied);
      });
    });
  }
});

describe("paragraph를 막은 설정의 divider 너머 코드 블록 뒤 항목 Backspace(Issue #411)", () => {
  for (const setting of PARAGRAPH_BLOCKED_SETTINGS) {
    it(`${setting.name} 막음: 코드 블록을 항목이 한 번에 흡수하고 divider는 제자리에 남는다`, () => {
      const { editor, tiptap } = mountAtBlockStart(
        [
          codeBlockBlock("c", "c"),
          dividerBlock("d"),
          listItemBlock("i", "bulletListItem", "ab"),
        ],
        denyBlockTypes(setting.denied),
      );

      expectOneUndoUnit(tiptap, "Backspace", () => {
        expect(outline(blocksOf(editor))).toEqual(["divider:", "ul:cab"]);
        expect(blocksOf(editor)[1]?.id).toBe("i");
        expectNoDeniedNodes(tiptap, setting.denied);
      });
    });
  }
});

describe("paragraph를 막은 설정의 병합 대상 없는 빈 항목 Backspace(Issue #411)", () => {
  // 앞이 divider·표뿐이면 건너뛸 너머에 병합 대상이 없다. 최선두 항목과 같이
  // 키만 소비해야 한다. false가 되면 키가 Tiptap 기본 체인으로 샌다.
  const ATOM_BEFORE: ReadonlyArray<{ name: string; before: () => Block }> = [
    { name: "divider", before: () => dividerBlock("d") },
    { name: "표", before: () => oneCellTableBlock("t") },
  ];

  for (const setting of PARAGRAPH_BLOCKED_SETTINGS) {
    for (const atom of ATOM_BEFORE) {
      it(`${setting.name} 막음: 앞이 ${atom.name}뿐인 빈 항목은 키만 소비한다`, () => {
        const { tiptap } = mountAtBlockStart(
          [atom.before(), listItemBlock("i", "bulletListItem", "")],
          denyBlockTypes(setting.denied),
        );
        const before = tiptap.state.doc.toJSON();

        expectBackspaceConsumedOnly(tiptap);

        expect(tiptap.state.doc.toJSON()).toEqual(before);
        expectNoDeniedNodes(tiptap, setting.denied);
      });
    }
  }
});

describe("paragraph를 막지 않은 대조군(Issue #411)", () => {
  // enabledBlockTypes를 undefined로 명시한다 — deny 기본 인자로 치환되지 않는다.
  // 끝의 "p:" 하나는 문서가 목록 항목으로 끝나서 TrailingBlockExtension이 붙인 문단이다.
  it("빈 bullet만 있는 문서의 Enter는 항목을 paragraph로 바꾼다", () => {
    const { editor, tiptap } = mountAtBlockStart(
      [listItemBlock("i", "bulletListItem", "")],
      undefined,
    );

    expect(dispatchKeydown(tiptap, "Enter")).toBe(true);

    expect(outline(blocksOf(editor))).toEqual(["p:", "p:"]);
  });

  it("빈 bullet만 있는 문서의 Backspace는 항목을 paragraph로 바꾼다", () => {
    const { editor, tiptap } = mountAtBlockStart(
      [listItemBlock("i", "bulletListItem", "")],
      undefined,
    );

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(outline(blocksOf(editor))).toEqual(["p:", "p:"]);
  });

  it("heading 뒤 빈 bullet의 Backspace는 항목을 paragraph로 바꾼다", () => {
    const { editor, tiptap } = mountAtBlockStart(
      [headingBlock("h", 2, "x"), listItemBlock("i", "bulletListItem", "")],
      undefined,
    );

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(outline(blocksOf(editor))).toEqual(["h2:x", "p:", "p:"]);
  });

  it("코드 블록 뒤 bullet의 첫 Backspace는 항목을 paragraph로 바꾸고 코드는 남긴다", () => {
    const { editor, tiptap } = mountAtBlockStart(
      [codeBlockBlock("c", "c"), listItemBlock("i", "bulletListItem", "ab")],
      undefined,
    );

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);

    expect(outline(blocksOf(editor))).toEqual(["code:c", "p:ab", "p:"]);
  });
});
