/**
 * BlockTypeInputRuleExtension이 heading(1~6)·quote·divider·checkListItem·
 * codeBlock native markdown-style shorthand를 정확 일치에서만 변환하는지,
 * blockId·caret·즉시 Backspace 복원 계약을 지키는지 검증한다. divider는
 * content 없는 비포장 atom이라 구조적 치환(caret 배치·trailing paragraph)
 * 까지 고정한다. codeBlock은 `leafBlockContent`라 대상 문단에 이미 자식
 * 블록(blockGroup)이 있으면 변환하지 않는 구조 가드까지 고정한다(RD-003.md
 * "결정" (a)). 즉시 Backspace 복원은 이 확장이 아니라 ListInputRuleExtension
 * 의 전역 undo-bridge가 처리한다(list-input-rule-extension.test.ts와 같은
 * 계약 — dispatchTextInput/typeNativeText는 block-test-support.ts로 옮긴
 * 공유 헬퍼다).
 */
import { describe, expect, it } from "vitest";

import {
  contentTextStart,
  dispatchKeydown,
  dispatchTextInput,
  typeNativeText,
} from "./block-test-support.js";
import {
  checkListItemBlock,
  codeBlockBlock,
  dividerBlock,
  documentOf,
  headingBlock,
  mounted,
  paragraphBlock,
  quoteBlock,
} from "./editor-controller-support.js";

describe("heading/quote native shorthand exact 변환", () => {
  it.each([1, 2, 3, 4, 5, 6] as const)(
    "exact #×%i 뒤 native space는 안정 ID를 보존한 빈 heading으로 변환한다",
    (level) => {
      const marker = "#".repeat(level);
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", marker),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + marker.length,
      );

      expect(dispatchTextInput(tiptap, " ")).toBe(true);
      expect(editor.getDocument().blocks[0]).toEqual(
        headingBlock("target", level, ""),
      );
      expect(tiptap.state.selection.from).toBe(
        contentTextStart(tiptap, "target"),
      );
    },
  );

  it("exact > 뒤 native space는 안정 ID를 보존한 빈 quote로 변환한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", ">"), paragraphBlock("tail", "꼬리")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);

    expect(dispatchTextInput(tiptap, " ")).toBe(true);
    expect(editor.getDocument().blocks[0]).toEqual(quoteBlock("target", ""));
    expect(tiptap.state.selection.from).toBe(
      contentTextStart(tiptap, "target"),
    );
  });

  it.each([
    ["선행 공백", " #"],
    ["문장 중간", "문장#"],
    ["7개 해시(범위 밖)", "#######"],
  ])(
    "%s 텍스트 뒤 native space는 heading으로 변환하지 않는다",
    (_label, text) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", text),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + text.length,
      );

      expect(dispatchTextInput(tiptap, " ")).toBe(false);
      expect(editor.getDocument().blocks[0]).toEqual(
        paragraphBlock("target", text),
      );
    },
  );

  it("문장 중간 > 뒤 native space는 quote로 변환하지 않는다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("target", "문장>"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 2);

    expect(dispatchTextInput(tiptap, " ")).toBe(false);
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("target", "문장>"),
    );
  });
});

describe("divider native shorthand exact 변환", () => {
  it("exact --- 입력은 안정 ID를 보존한 divider로 변환하고 다음 형제 문단 선두로 caret을 옮긴다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("target", "--"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 2);

    expect(dispatchTextInput(tiptap, "-")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      dividerBlock("target"),
      paragraphBlock("tail", "꼬리"),
    ]);
    expect(tiptap.state.selection.from).toBe(contentTextStart(tiptap, "tail"));
  });

  it("문서 끝 유일 문단의 --- 변환은 trailing paragraph를 같은 dispatch로 만들고 그 선두로 caret을 옮긴다", () => {
    const { editor, changes, tiptap } = mounted(
      documentOf(paragraphBlock("target", "--")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 2);

    expect(dispatchTextInput(tiptap, "-")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      dividerBlock("target"),
      paragraphBlock("id-1", ""),
    ]);
    expect(changes).toHaveLength(1);
    expect(tiptap.state.selection.from).toBe(contentTextStart(tiptap, "id-1"));
  });

  it("4번째 - 입력은 이미 3개인 문단을 divider로 변환하지 않는다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("target", "---"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 3);

    expect(typeNativeText(tiptap, "-")).toBe(false);
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("target", "----"),
    );
  });
});

describe("checkListItem native shorthand exact 변환", () => {
  it.each([
    ["[]", false],
    ["[ ]", false],
    ["[x]", true],
    ["[X]", true],
  ] as const)(
    "exact %s 뒤 native space는 안정 ID를 보존한 checkListItem(checked=%s)으로 변환한다",
    (marker, checked) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", marker),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + marker.length,
      );

      expect(dispatchTextInput(tiptap, " ")).toBe(true);
      expect(editor.getDocument().blocks[0]).toEqual(
        checkListItemBlock("target", "", checked),
      );
      expect(tiptap.state.selection.from).toBe(
        contentTextStart(tiptap, "target"),
      );
    },
  );

  it.each([
    ["대괄호 없음", "빈칸"],
    ["문자 포함", "[a]"],
    ["닫는 대괄호 없음", "[x"],
  ])(
    "%s 텍스트 뒤 native space는 checkListItem으로 변환하지 않는다",
    (_label, text) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", text),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + text.length,
      );

      expect(dispatchTextInput(tiptap, " ")).toBe(false);
      expect(editor.getDocument().blocks[0]).toEqual(
        paragraphBlock("target", text),
      );
    },
  );
});

describe("코드 블록 펜스 native shorthand exact 변환", () => {
  it.each([
    ["```js", "javascript"],
    ["```ts", "typescript"],
    ["```", "text"],
  ] as const)(
    "exact %s 뒤 native space는 안정 ID를 보존한 codeBlock(language=%s)으로 변환한다",
    (marker, language) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", marker),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + marker.length,
      );

      expect(dispatchTextInput(tiptap, " ")).toBe(true);
      expect(editor.getDocument().blocks[0]).toEqual(
        codeBlockBlock("target", "", language),
      );
      expect(tiptap.state.selection.from).toBe(
        contentTextStart(tiptap, "target"),
      );
    },
  );

  it.each([
    ["선행 공백", " ```"],
    ["문장 중간", "x```"],
    ["2개 백틱만", "``"],
  ])(
    "%s 텍스트 뒤 native space는 codeBlock으로 변환하지 않는다",
    (_label, text) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("target", text),
          paragraphBlock("tail", "꼬리"),
        ),
      );
      tiptap.commands.setTextSelection(
        contentTextStart(tiptap, "target") + text.length,
      );

      expect(dispatchTextInput(tiptap, " ")).toBe(false);
      expect(editor.getDocument().blocks[0]).toEqual(
        paragraphBlock("target", text),
      );
    },
  );

  it("자식 블록이 있는 문단은 codeBlock으로 변환하지 않는다(leafBlockContent는 blockGroup과 공존 불가)", () => {
    const child = paragraphBlock("child-1", "child");
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "```js", [child])),
    );
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "target") + "```js".length,
    );

    expect(dispatchTextInput(tiptap, " ")).toBe(false);
    expect(editor.getDocument().blocks[0]).toEqual(
      paragraphBlock("target", "```js", [child]),
    );
  });
});

describe("새 블록 타입 native shorthand 즉시 Backspace 복원", () => {
  it("heading 변환 직후 Backspace는 marker 문단으로 복원한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "#"), paragraphBlock("tail", "")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);
    expect(dispatchTextInput(tiptap, " ")).toBe(true);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("target", "# "),
      paragraphBlock("tail", ""),
    ]);
  });

  it("quote 변환 직후 Backspace는 marker 문단으로 복원한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", ">"), paragraphBlock("tail", "")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 1);
    expect(dispatchTextInput(tiptap, " ")).toBe(true);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("target", "> "),
      paragraphBlock("tail", ""),
    ]);
  });

  it("divider 변환 직후 Backspace는 marker 문단으로 복원한다(다음 형제 존재)", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("target", "--"),
        paragraphBlock("tail", "꼬리"),
      ),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 2);
    expect(dispatchTextInput(tiptap, "-")).toBe(true);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("target", "---"),
      paragraphBlock("tail", "꼬리"),
    ]);
  });

  it("문서 끝 유일 문단의 divider 변환 직후 Backspace는 trailing paragraph까지 함께 복원한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "--")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 2);
    expect(dispatchTextInput(tiptap, "-")).toBe(true);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("target", "---"),
    ]);
  });

  it("checkListItem 변환 직후 Backspace는 marker 문단으로 복원한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "[x]"), paragraphBlock("tail", "")),
    );
    tiptap.commands.setTextSelection(contentTextStart(tiptap, "target") + 3);
    expect(dispatchTextInput(tiptap, " ")).toBe(true);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("target", "[x] "),
      paragraphBlock("tail", ""),
    ]);
  });

  it("codeBlock 변환 직후 Backspace는 marker 문단으로 복원한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("target", "```js"), paragraphBlock("tail", "")),
    );
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, "target") + "```js".length,
    );
    expect(dispatchTextInput(tiptap, " ")).toBe(true);

    expect(dispatchKeydown(tiptap, "Backspace")).toBe(true);
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("target", "```js "),
      paragraphBlock("tail", ""),
    ]);
  });
});
