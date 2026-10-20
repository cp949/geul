/**
 * Shift-Enter hardBreak 삽입이 결과 캐럿을 화면 안으로 스크롤하도록
 * transaction에 표시하는지 검증한다(Issue #428). jsdom은 실제 스크롤을 못
 * 하므로 dispatch된 transaction의 scrolledIntoView 플래그로 고정한다.
 *
 * 키는 view.someProp("handleKeyDown", ...)로 보내 실제 keymap을 거친다.
 * h1 무시·비대상 노드 계약은 hard-break-keyboard-extension.test.ts가
 * 소유하므로 여기서 다시 고정하지 않는다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { dispatchKeydown } from "./block-test-support.js";
import {
  calloutBlock,
  checkListItemBlock,
  collectDispatched,
  documentOf,
  headingBlock,
  listItemBlock,
  mounted,
  onlyDocChangedTransaction,
  paragraphBlock,
  quoteBlock,
  toggleBlock,
} from "./editor-controller-support.js";
import { inBlock, setLiveSelection } from "./table-boundary-test-support.js";

const TEXT = "source";

describe("Shift-Enter hardBreak 삽입의 스크롤 표시", () => {
  it.each<[string, Block]>([
    ["paragraph", paragraphBlock("source", TEXT)],
    ["heading level 2", headingBlock("source", 2, TEXT)],
    ["quote", quoteBlock("source", TEXT)],
    ["bulletListItem", listItemBlock("source", "bulletListItem", TEXT)],
    ["numberedListItem", listItemBlock("source", "numberedListItem", TEXT)],
    ["checkListItem", checkListItemBlock("source", TEXT, false)],
    ["toggleListItem", toggleBlock("source", TEXT)],
    ["callout", calloutBlock("source", TEXT)],
  ])(
    "%s 블록 끝에서 Shift-Enter를 누르면 hardBreak 삽입 transaction에 스크롤을 표시한다",
    (_label, block) => {
      const { tiptap } = mounted(
        documentOf(block, paragraphBlock("tail", "t")),
      );
      const caret = inBlock("source", TEXT.length)(tiptap);
      setLiveSelection(tiptap, caret, caret);
      const dispatched = collectDispatched(tiptap);

      expect(dispatchKeydown(tiptap, "Enter", true)).toBe(true);

      const transaction = onlyDocChangedTransaction(dispatched);
      expect(transaction?.scrolledIntoView).toBe(true);
      // hardBreak가 실제로 삽입된 분기를 탔는지 확인한다.
      let hardBreakCount = 0;
      tiptap.state.doc.descendants((node) => {
        if (node.type.name === "hardBreak") hardBreakCount += 1;
      });
      expect(hardBreakCount).toBe(1);
    },
  );
});
