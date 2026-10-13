/**
 * paragraph를 막은 enabledBlockTypes에서 heading·quote·callout 끝 Enter가
 * 예외 없이 같은 타입 새 블록으로 분할되는지 확인한다(Issue #406).
 *
 * 끝 Enter는 원래 빈 paragraph를 여는데, 스키마에 paragraph가 없으면
 * `nodes.paragraph`가 undefined라 TypeError가 났다. 이제 paragraph가 없으면
 * 중간 분할처럼 원본 타입·attrs를 복사한다. paragraph를 막지 않은 설정은
 * 기존대로 빈 paragraph를 연다(대조군).
 *
 * 설정 8종(단독 deny 4종 + paragraph 조합 3종 + 넷 전부)과 세 블록 타입을
 * 곱한다. 대상 블록 타입 자체를 막은 조합은 문서 로드가 거절돼 Enter까지
 * 가지 않으므로, 그 거절만 확인한다.
 *
 * 여러 줄 붙여넣기 쪽 회귀는 clipboard-paste-plain-multiline.test.ts가 맡는다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor, type CreateEditorOptions } from "../src/index.js";
import { dispatchKeydown } from "./block-test-support.js";
import {
  blocksOf,
  outline,
  setupPasteSelection,
} from "./clipboard-test-support.js";
import {
  calloutBlock,
  documentOf,
  headingBlock,
  mountTiptapEditor,
  quoteBlock,
  sequentialIds,
} from "./editor-controller-support.js";

type BlockType = Block["type"];
type EnabledBlockTypes = NonNullable<CreateEditorOptions["enabledBlockTypes"]>;

// 끝 Enter 대상 블록 하나의 fixture. 끝 Enter 뒤 새 블록의 outline 한 줄도 담는다.
type Target = {
  type: "heading" | "quote" | "callout";
  block: () => Block;
  sameTypeOutline: string[];
};

const TARGETS: readonly Target[] = [
  {
    type: "heading",
    block: () => headingBlock("t", 2, "ab"),
    sameTypeOutline: ["h2:ab", "h2:"],
  },
  {
    type: "quote",
    block: () => quoteBlock("t", "ab"),
    sameTypeOutline: ["quote:ab", "quote:"],
  },
  {
    type: "callout",
    block: () => calloutBlock("t", "ab", "💡"),
    sameTypeOutline: ["callout:ab", "callout:"],
  },
];

const deny = (...types: BlockType[]): EnabledBlockTypes => ({
  mode: "deny",
  types,
});

// 설정 8종. 이름은 테스트 제목에 쓴다.
const SETTINGS: ReadonlyArray<{
  name: string;
  denied: readonly BlockType[];
}> = [
  { name: "paragraph", denied: ["paragraph"] },
  { name: "heading", denied: ["heading"] },
  { name: "quote", denied: ["quote"] },
  { name: "callout", denied: ["callout"] },
  { name: "paragraph+heading", denied: ["paragraph", "heading"] },
  { name: "paragraph+quote", denied: ["paragraph", "quote"] },
  { name: "paragraph+callout", denied: ["paragraph", "callout"] },
  {
    name: "paragraph+heading+quote+callout",
    denied: ["paragraph", "heading", "quote", "callout"],
  },
];

// 블록 끝(offset 2)에 캐럿을 두고 마운트한다. denied가 없으면 설정을 넘기지 않는다.
const mountAtEnd = (target: Target, denied: readonly BlockType[]) =>
  setupPasteSelection(
    [target.block()],
    { id: "t", offset: 2 },
    { id: "t", offset: 2 },
    denied.length === 0 ? {} : { enabledBlockTypes: deny(...denied) },
  );

describe("paragraph를 막은 설정의 끝 Enter(Issue #406)", () => {
  for (const setting of SETTINGS) {
    for (const target of TARGETS) {
      const title = `${setting.name} 막음 / ${target.type} 끝 Enter`;

      if (setting.denied.includes(target.type)) {
        it(`${title}: 대상 블록 타입을 막았으니 문서 로드가 거절된다`, () => {
          expect(() => {
            const editor = createEditor({
              initialDocument: documentOf(target.block()),
              createId: sequentialIds("id"),
              enabledBlockTypes: deny(...setting.denied),
            });
            mountTiptapEditor(editor);
          }).toThrow(/disabled/);
        });
        continue;
      }

      if (setting.denied.includes("paragraph")) {
        it(`${title}: 예외 없이 키를 소비하고 같은 타입 새 블록을 연다`, () => {
          const { editor, tiptap } = mountAtEnd(target, setting.denied);

          let consumed = false;
          expect(() => {
            consumed = dispatchKeydown(tiptap, "Enter");
          }).not.toThrow();

          expect(consumed).toBe(true);
          const blocks = blocksOf(editor);
          expect(outline(blocks)).toEqual(target.sameTypeOutline);
          // attrs(level·icon)는 원본과 같다. blockId만 새로 붙는다.
          expect(blocks[1]).toEqual({
            ...blocks[0],
            id: blocks[1]?.id,
            content: [],
          });
          expect(blocks[1]?.id).not.toBe(blocks[0]?.id);
          // 문서에 막은 타입이 없다.
          for (const block of blocks) {
            expect(setting.denied).not.toContain(block.type);
          }
        });
        continue;
      }

      it(`${title}: paragraph를 막지 않았으니 기존대로 빈 문단을 연다`, () => {
        const { editor, tiptap } = mountAtEnd(target, setting.denied);

        expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
        const blocks = blocksOf(editor);
        // 뒤의 "p:" 하나는 로드 때 TrailingBlockExtension이 붙인 문단이다.
        expect(outline(blocks)).toEqual([
          target.sameTypeOutline[0],
          "p:",
          "p:",
        ]);
      });
    }
  }

  it("대조군: 막은 타입이 없으면 세 블록 모두 끝 Enter가 빈 문단을 연다", () => {
    for (const target of TARGETS) {
      const { editor, tiptap } = mountAtEnd(target, []);

      expect(dispatchKeydown(tiptap, "Enter")).toBe(true);
      expect(outline(blocksOf(editor))).toEqual([
        target.sameTypeOutline[0],
        "p:",
        "p:",
      ]);
    }
  });
});
