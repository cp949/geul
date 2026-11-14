/**
 * 커스텀 단축 입력의 텍스트 입력 runner(CustomTextInputRuleExtension)와
 * Tiptap InputRule plugin의 처리 경계를 검증한다. runner가 처리한 입력은
 * Tiptap plugin에 다시 전달되지 않고, Tiptap plugin이 같은 입력을 받아도
 * 변환하지 않으며, 다른 확장의 규칙은 계속 Tiptap이 처리한다.
 */
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { Plugin } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { customTextInputRuleKey } from "../src/custom-text-input-rule-extension.js";
import { contentTextStart, dispatchTextInput } from "./block-test-support.js";
import {
  documentOf,
  mounted,
  paragraphBlock,
} from "./list-item-block-type-support.js";

type TextInputHandler = (
  view: TiptapEditor["view"],
  from: number,
  to: number,
  text: string,
  deflt: () => unknown,
) => boolean;

/** 이 runner를 뺀 Tiptap InputRule plugin(spec.isInputRules) 목록. */
const tiptapInputRulePlugins = (tiptap: TiptapEditor): Plugin[] =>
  tiptap.state.plugins.filter(
    (plugin) =>
      (plugin.spec as { isInputRules?: boolean }).isInputRules === true &&
      plugin !== customTextInputRuleKey.get(tiptap.state),
  );

/** plugin의 handleTextInput prop을 감시한다(someProp은 호출 시점에 prop을 읽는다). */
const spyTextInput = (plugin: Plugin) =>
  vi.spyOn(
    plugin.props as unknown as { handleTextInput: TextInputHandler },
    "handleTextInput",
  );

const runnerPlugin = (tiptap: TiptapEditor): Plugin => {
  const plugin = customTextInputRuleKey.get(tiptap.state);
  if (plugin === undefined) throw new Error("runner plugin 조회 실패");
  return plugin;
};

const shorthandCases = [
  ["-", " ", "bulletListItem"],
  ["1.", " ", "numberedListItem"],
  ["#", " ", "heading"],
  ["--", "-", "divider"],
  ["``", "`", "codeBlock"],
] as const;

describe("커스텀 단축 입력 runner와 Tiptap InputRule plugin의 경계", () => {
  it.each(shorthandCases)(
    "runner가 처리한 %s + %j 입력은 Tiptap InputRule plugin에 다시 전달되지 않는다",
    (marker, trigger, type) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", marker),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + marker.length,
      );
      const tiptapPlugins = tiptapInputRulePlugins(tiptap);
      expect(tiptapPlugins.length).toBeGreaterThan(0);
      const spies = tiptapPlugins.map(spyTextInput);
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      expect(dispatchTextInput(tiptap, trigger)).toBe(true);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(editor.getDocument().blocks[0]?.type).toBe(type);
    },
  );

  it.each(shorthandCases)(
    "Tiptap InputRule plugin은 %s + %j 입력을 직접 받아도 변환하지 않는다",
    (marker, trigger) => {
      const { tiptap } = mounted(
        documentOf(
          paragraphBlock("target", marker),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      const caret = contentTextStart(tiptap, "target") + marker.length;
      tiptap.commands.setTextSelection(caret);
      const before = tiptap.state.doc;
      const dispatch = vi.spyOn(tiptap.view, "dispatch");

      // runner가 없거나 거부했을 때 뒤따르는 Tiptap 경로다. Tiptap 3.31.4+는
      // 트리거 문자를 먼저 넣은 문서로 handler를 불러, 각 규칙의 정확 일치
      // 판정이 거부해야 한다. Tiptap이 이 경로를 바꾸면 이 테스트가 깨진다.
      const results = tiptapInputRulePlugins(tiptap).map((plugin) =>
        (plugin.props.handleTextInput as TextInputHandler | undefined)?.(
          tiptap.view,
          caret,
          caret,
          trigger,
          () => tiptap.state.tr.insertText(trigger, caret, caret),
        ),
      );

      expect(results.every((result) => result !== true)).toBe(true);
      expect(dispatch).not.toHaveBeenCalled();
      expect(tiptap.state.doc.eq(before)).toBe(true);
    },
  );

  it("비대상인 StarterKit Bold 규칙(**굵게**)은 Tiptap InputRule plugin이 계속 처리한다", () => {
    const { tiptap } = mounted(
      documentOf(
        paragraphBlock("target", "**굵게*"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    const start = contentTextStart(tiptap, "target");
    tiptap.commands.setTextSelection(start + "**굵게*".length);
    const runner = spyTextInput(runnerPlugin(tiptap));

    expect(dispatchTextInput(tiptap, "*")).toBe(true);
    expect(runner).toHaveReturnedWith(false);
    const paragraph = tiptap.state.doc.resolve(start).parent;
    expect(paragraph.textContent).toBe("굵게");
    expect(paragraph.firstChild?.marks.map((mark) => mark.type.name)).toEqual([
      "bold",
    ]);
  });
});
