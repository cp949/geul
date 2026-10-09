/**
 * enabledBlockTypes가 막는 블록이 섞인 html·Markdown 붙여넣기가 같은
 * 클립보드의 text/plain으로 폴백하는 계약을 고정한다(Issue #318). 예전에는
 * 허용 블록까지 통째로 사라졌고, 범위 선택에서는 선택 글자만 지워졌다.
 *
 * 다루는 축은 html 분기(캐럿·범위, 목록·제목 차단, allow 모드, 차단 타입만 든
 * 입력), Markdown 분기(캐럿·범위), 허용 타입만 든 html과 미지정 설정의 대조군,
 * pasteHandler 위임 경로, transaction 계약(undo 1회 복원, 평문이 없을 때 문서·
 * selection 불변)이다. 입력은 mock 없이 실입력으로 유발한다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import type { CreateEditorOptions } from "../src/index.js";
import {
  blocksOf,
  outline,
  pasteData,
  setupPasteSelection,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import { paragraphBlock } from "./editor-controller-support.js";

type EnabledBlockTypes = NonNullable<CreateEditorOptions["enabledBlockTypes"]>;

const DENY_QUOTE: EnabledBlockTypes = { mode: "deny", types: ["quote"] };
const DENY_HEADING: EnabledBlockTypes = { mode: "deny", types: ["heading"] };
const DENY_BULLET: EnabledBlockTypes = {
  mode: "deny",
  types: ["bulletListItem"],
};
const ALLOW_PARAGRAPH: EnabledBlockTypes = {
  mode: "allow",
  types: ["paragraph"],
};

// 기준 문서: first, second 두 문단.
const twoParagraphs = (): Block[] => [
  paragraphBlock("p1", "first"),
  paragraphBlock("p2", "second"),
];

// 캐럿은 first 안(fi|rst), 범위는 first 앞 3글자(fir)다.
const CARET = { id: "p1", offset: 2 };
const RANGE_START = { id: "p1", offset: 0 };
const RANGE_END = { id: "p1", offset: 3 };

const MIXED_QUOTE_HTML = "<p>keep1</p><blockquote>q</blockquote><p>keep2</p>";
const MIXED_QUOTE_PLAIN = "keep1\nq\nkeep2";

// 선택(캐럿 또는 범위)에 클립보드를 붙이고 결과 outline을 돌려준다.
const pasteOutline = (
  enabledBlockTypes: EnabledBlockTypes | undefined,
  selection: { from: typeof CARET; to?: typeof CARET },
  clipboard: Record<string, string>,
): string[] => {
  const { editor, editable } = setupPasteSelection(
    twoParagraphs(),
    selection.from,
    selection.to,
    enabledBlockTypes === undefined ? {} : { enabledBlockTypes },
  );
  pasteData(editable, clipboard);
  return outline(blocksOf(editor));
};

const atCaret = { from: CARET };
const atRange = { from: RANGE_START, to: RANGE_END };

describe("차단 블록이 섞인 html은 text/plain으로 폴백한다(Issue #318)", () => {
  describe("quote 차단", () => {
    it("캐럿에서 평문 세 줄이 들어가고 quote 블록은 없다", () => {
      const result = pasteOutline(DENY_QUOTE, atCaret, {
        "text/html": MIXED_QUOTE_HTML,
        "text/plain": MIXED_QUOTE_PLAIN,
      });

      expect(result).toEqual(["p:fikeep1", "p:q", "p:keep2rst", "p:second"]);
    });

    it("범위에서는 선택 글자가 평문으로 대체된다", () => {
      const result = pasteOutline(DENY_QUOTE, atRange, {
        "text/html": MIXED_QUOTE_HTML,
        "text/plain": MIXED_QUOTE_PLAIN,
      });

      expect(result).toEqual(["p:keep1", "p:q", "p:keep2st", "p:second"]);
    });

    it("한 줄 평문이면 text/plain만 있는 클립보드와 결과가 같다", () => {
      const withHtml = pasteOutline(DENY_QUOTE, atRange, {
        "text/html": "<p>keep</p><blockquote>q</blockquote>",
        "text/plain": "X",
      });
      const plainOnly = pasteOutline(DENY_QUOTE, atRange, {
        "text/plain": "X",
      });

      expect(withHtml).toEqual(["p:Xst", "p:second"]);
      expect(withHtml).toEqual(plainOnly);
    });
  });

  describe("목록 차단", () => {
    it("deny bulletListItem이면 ul html이 평문으로 들어간다(이슈 재현)", () => {
      const result = pasteOutline(DENY_BULLET, atCaret, {
        "text/html": "<ul><li>a</li></ul><p>b</p>",
        "text/plain": "a\nb",
      });

      expect(result).toEqual(["p:fia", "p:brst", "p:second"]);
    });
  });

  describe("allow 모드", () => {
    it("allow paragraph이면 제목이 섞인 html이 평문으로 들어간다", () => {
      const result = pasteOutline(ALLOW_PARAGRAPH, atCaret, {
        "text/html": "<h1>H</h1><p>b</p>",
        "text/plain": "H\nb",
      });

      expect(result).toEqual(["p:fiH", "p:brst", "p:second"]);
    });
  });

  describe("차단 타입만 든 html", () => {
    it("평문이 있으면 평문이 들어간다", () => {
      const result = pasteOutline(DENY_QUOTE, atCaret, {
        "text/html": "<blockquote>q</blockquote>",
        "text/plain": "q",
      });

      expect(result).toEqual(["p:fiqrst", "p:second"]);
    });

    it("평문이 없으면 문서와 selection이 그대로다", () => {
      const { editor, editable, tiptap } = setupPasteSelection(
        twoParagraphs(),
        CARET,
        undefined,
        { enabledBlockTypes: DENY_QUOTE },
      );
      const before = editor.getDocument();
      const selection = tiptap.state.selection;

      withUnhandledErrorTracking((errors) => {
        pasteData(editable, { "text/html": "<blockquote>q</blockquote>" });

        expect(errors).toEqual([]);
      });

      expect(editor.getDocument()).toEqual(before);
      expect(tiptap.state.selection.eq(selection)).toBe(true);
    });
  });
});

describe("차단 블록이 든 Markdown 평문은 원문 줄 그대로 평문으로 들어간다(Issue #318)", () => {
  const MARKDOWN = "# Title\n\nbody text";

  it("캐럿에서 원문 줄이 평문으로 들어간다", () => {
    const result = pasteOutline(DENY_HEADING, atCaret, {
      "text/plain": MARKDOWN,
    });

    expect(result).toEqual(["p:fi# Title", "p:body textrst", "p:second"]);
  });

  it("한 줄 Markdown도 캐럿에서 원문 그대로 평문이 된다", () => {
    const result = pasteOutline(DENY_HEADING, atCaret, {
      "text/plain": "# Title",
    });

    expect(result).toEqual(["p:fi# Titlerst", "p:second"]);
  });

  it("범위에서는 선택 글자가 원문 줄로 대체된다", () => {
    const result = pasteOutline(DENY_HEADING, atRange, {
      "text/plain": MARKDOWN,
    });

    expect(result).toEqual(["p:# Title", "p:body textst", "p:second"]);
  });
});

describe("대조군", () => {
  it("허용 타입만 든 html은 차단 설정이 있어도 블록으로 들어간다", () => {
    const result = pasteOutline(DENY_QUOTE, atCaret, {
      "text/html": "<h1>H</h1><p>b</p>",
      "text/plain": "H\nb",
    });

    expect(result).toEqual(["p:fi", "h1:H", "p:b", "p:rst", "p:second"]);
  });

  it("enabledBlockTypes 미지정이면 quote가 섞인 html이 블록으로 들어간다", () => {
    const result = pasteOutline(undefined, atCaret, {
      "text/html": MIXED_QUOTE_HTML,
      "text/plain": MIXED_QUOTE_PLAIN,
    });

    expect(result).toContain("quote:q");
  });
});

describe("pasteHandler가 defaultPasteHandler()로 위임하는 경로", () => {
  it("직접 붙여넣기와 같이 평문으로 폴백하고 true를 돌려준다", () => {
    const results: boolean[] = [];
    const { editor, editable } = setupPasteSelection(
      twoParagraphs(),
      CARET,
      undefined,
      {
        enabledBlockTypes: DENY_QUOTE,
        pasteHandler: (context) => {
          results.push(context.defaultPasteHandler());
          return true;
        },
      },
    );

    pasteData(editable, {
      "text/html": MIXED_QUOTE_HTML,
      "text/plain": MIXED_QUOTE_PLAIN,
    });

    expect(outline(blocksOf(editor))).toEqual([
      "p:fikeep1",
      "p:q",
      "p:keep2rst",
      "p:second",
    ]);
    expect(results).toEqual([true]);
  });
});

describe("transaction 계약", () => {
  it("범위 폴백은 revision이 1 늘고 undo 1회로 복원된다", () => {
    const { editor, editable, tiptap } = setupPasteSelection(
      twoParagraphs(),
      RANGE_START,
      RANGE_END,
      { enabledBlockTypes: DENY_QUOTE },
    );
    const before = outline(blocksOf(editor));
    const revision = editor.getDocument().revision;

    pasteData(editable, {
      "text/html": MIXED_QUOTE_HTML,
      "text/plain": MIXED_QUOTE_PLAIN,
    });

    expect(outline(blocksOf(editor))).toEqual([
      "p:keep1",
      "p:q",
      "p:keep2st",
      "p:second",
    ]);
    expect(editor.getDocument().revision).toBe(revision + 1);

    tiptap.commands.undo();

    expect(outline(blocksOf(editor))).toEqual(before);
  });
});
