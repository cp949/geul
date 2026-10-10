/**
 * code 글자와 bold·italic·underline·strike·link 마크의 전면 공존을 고정한다
 * (Issue #349). model·io·마크다운은 이 조합을 허용하지만 편집기 스키마의 Code
 * 마크는 다섯 마크와 배타였다. 그래서 초기 문서 로드는 `doc.check()`가
 * `Invalid collection of marks for node text`를 던지고, 붙여넣기는 처리되지 않은
 * `RangeError`를 냈다. Code 마크의 excludes를 비운 뒤의 계약이다.
 *
 * 다루는 축은 다음과 같다.
 * - 스키마: Code 마크가 다섯 마크를 배제하지 않음(excludes "" 실측)
 * - 초기 문서 로드: 문단과 표 셀
 * - 표 밖 붙여넣기: html 중첩 두 방향, 링크, 마크다운
 * - 표 셀 안 붙여넣기: 한 블록과 여러 블록 html
 * - 편집기 → tiptapToModel → 편집기 왕복에서 마크 무손실
 * - 접힌 캐럿 stored mark: code와 서식을 서로 지우지 않음
 * - 범위 선택 명령: toggleCode와 서식 토글, setLink가 서로 지우지 않음
 * 색 마크와 code의 공존은 code-color-mark-coexistence.test.ts가 소유한다.
 */
import {
  type Block,
  canonicalizeTextMarks,
  type InlineContent,
  type TextMark,
} from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import type { TiptapJsonNode } from "../src/model-to-tiptap.js";
import { tiptapToModel } from "../src/tiptap-to-model.js";
import { contentTextStart } from "./block-test-support.js";
import {
  pasteData,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  contentOfB1,
  expectDocValid,
  mountedParagraph,
} from "./code-mark-test-support.js";
import {
  documentOf,
  mounted,
  paragraphBlock,
  sequentialIds,
} from "./list-item-block-type-support.js";
import { gridTable, inCell } from "./table-boundary-test-support.js";
import {
  findCell,
  pasteIn,
  textSelection,
} from "./table-cell-paste-test-support.js";

const HREF = "https://example.com";
const ok = { ok: true, value: undefined };

/** code와 함께 검증할 서식 마크 한 종류의 입력 표기를 모은다. */
type FormatCase = {
  name: string;
  mark: TextMark;
  open: string;
  close: string;
};

/** 다섯 서식 마크. html 여는 태그와 닫는 태그를 함께 가진다. */
const FORMATS: readonly FormatCase[] = [
  { name: "bold", mark: { type: "bold" }, open: "<b>", close: "</b>" },
  { name: "italic", mark: { type: "italic" }, open: "<i>", close: "</i>" },
  {
    name: "underline",
    mark: { type: "underline" },
    open: "<u>",
    close: "</u>",
  },
  { name: "strike", mark: { type: "strike" }, open: "<s>", close: "</s>" },
  {
    name: "link",
    mark: { type: "link", href: HREF },
    open: `<a href="${HREF}">`,
    close: "</a>",
  },
];

/** 접힌 캐럿 명령과 토글 명령이 있는 네 서식이다. link는 둘 다 없다. */
const TOGGLES = [
  { name: "bold", command: "toggleBold" },
  { name: "italic", command: "toggleItalic" },
  { name: "underline", command: "toggleUnderline" },
  { name: "strike", command: "toggleStrike" },
] as const;

/** 서식 하나와 code를 함께 가진 한 글자 조각이다. 마크는 model 정규 순서다. */
const codeWith = (format: FormatCase, text = "x"): InlineContent => [
  {
    text,
    marks: canonicalizeTextMarks([{ type: "code" }, format.mark]),
  },
];

/** 문서 안 텍스트 노드 중 text가 같은 첫 노드의 마크 이름을 정렬해 돌려준다. */
const markNamesOf = (tiptap: Editor, text: string): string[] => {
  let names: string[] | undefined;
  tiptap.state.doc.descendants((node) => {
    if (names === undefined && node.isText && node.text === text) {
      names = node.marks.map((mark) => mark.type.name).sort();
    }
    return names === undefined;
  });
  if (names === undefined) throw new Error(`텍스트 ${text} 조회 실패`);
  return names;
};

/** 기대하는 마크 이름 집합이다. code와 서식 하나를 정렬해 돌려준다. */
const withCode = (format: string): string[] => ["code", format].sort();

/** 인라인 content의 조각별 마크 type 목록을 정렬해 뽑는다. */
const signature = (content: InlineContent | undefined): string[][] =>
  (content ?? []).map((item) =>
    "marks" in item && item.marks !== undefined
      ? item.marks.map((mark) => mark.type).sort()
      : [],
  );

/** 문단 "seed" 끝에 캐럿을 두고 붙여넣기를 실행한다. 미처리 오류를 함께 돌려준다. */
const pasteOutsideTable = (entries: Record<string, string>) => {
  const fixture = mounted(documentOf(paragraphBlock("p1", "seed")));
  fixture.editable.focus();
  fixture.tiptap.commands.setTextSelection(
    contentTextStart(fixture.tiptap, "p1") + 4,
  );
  let captured: unknown[] = [];
  withUnhandledErrorTracking((errors) => {
    pasteData(fixture.editable, entries);
    captured = errors;
  });
  return { ...fixture, errors: captured };
};

/** 셀 "cell" 끝에 캐럿을 두고 붙여넣기를 실행한다. */
const pasteInCell = (entries: Record<string, string>) => {
  let captured: unknown[] = [];
  let result: ReturnType<typeof pasteIn> | undefined;
  withUnhandledErrorTracking((errors) => {
    result = pasteIn(
      [
        paragraphBlock("p1", "para"),
        gridTable("t", 1, 1, ["cell"]),
        paragraphBlock("tail", "tail"),
      ],
      textSelection(inCell("t-r0c0", 4)),
      entries,
    );
    captured = errors;
  });
  if (result === undefined) throw new Error("붙여넣기 실행 실패");
  return { ...result, errors: captured };
};

describe("스키마의 Code 마크 배타 목록", () => {
  it.each(FORMATS)("Code 마크는 $name 마크를 배제하지 않는다", ({ name }) => {
    const { tiptap } = mounted(documentOf(paragraphBlock("b1", "a")));
    const { code, [name]: other } = tiptap.schema.marks;

    expect(code?.excludes(other!)).toBe(false);
    expect(other?.excludes(code!)).toBe(false);
  });

  it("Code 마크의 excluded 목록이 비어 있다(빈 문자열이 무시되지 않는다)", () => {
    const { tiptap } = mounted(documentOf(paragraphBlock("b1", "a")));

    expect(tiptap.schema.marks.code?.spec.excludes).toBe("");
    expect(tiptap.schema.marks.code?.excludes(tiptap.schema.marks.code)).toBe(
      false,
    );
  });
});

describe("초기 문서 로드의 code와 서식 마크 공존", () => {
  it.each(FORMATS)(
    "code와 $name 마크를 가진 문단으로 초기 문서를 열어도 스키마를 통과한다",
    (format) => {
      const { tiptap } = mounted(
        documentOf({
          id: "b1",
          type: "paragraph",
          content: codeWith(format),
        }),
      );

      expectDocValid(tiptap);
      expect(markNamesOf(tiptap, "x")).toEqual(withCode(format.name));
    },
  );

  it.each(FORMATS)(
    "code와 $name 마크를 가진 표 셀로 초기 문서를 열어도 스키마를 통과한다",
    (format) => {
      const table = gridTable("t", 1, 1, [""]) as Extract<
        Block,
        { type: "table" }
      >;
      const cell = table.rows[0]?.cells[0];
      if (cell === undefined) throw new Error("fixture 준비 실패");
      cell.content = codeWith(format);
      const { tiptap } = mounted(
        documentOf(table, paragraphBlock("tail", "t")),
      );

      expectDocValid(tiptap);
      expect(markNamesOf(tiptap, "x")).toEqual(withCode(format.name));
    },
  );
});

describe("표 밖 붙여넣기의 code와 서식 마크 공존", () => {
  it.each(FORMATS)(
    "`$name` 마크가 code 바깥인 html을 붙여도 던지지 않고 두 마크가 남는다",
    ({ name, open, close }) => {
      const fixture = pasteOutsideTable({
        "text/html": `${open}<code>x</code>${close}`,
      });

      expect(fixture.errors).toEqual([]);
      expectDocValid(fixture.tiptap);
      expect(markNamesOf(fixture.tiptap, "x")).toEqual(withCode(name));
    },
  );

  it.each(FORMATS)(
    "`$name` 마크가 code 안쪽인 html을 붙여도 던지지 않고 두 마크가 남는다",
    ({ name, open, close }) => {
      const fixture = pasteOutsideTable({
        "text/html": `<code>${open}x${close}</code>`,
      });

      expect(fixture.errors).toEqual([]);
      expectDocValid(fixture.tiptap);
      expect(markNamesOf(fixture.tiptap, "x")).toEqual(withCode(name));
    },
  );

  it.each([
    { name: "bold", markdown: "**`x`**" },
    { name: "italic", markdown: "_`x`_" },
    { name: "strike", markdown: "~~`x`~~" },
    { name: "link", markdown: `[\`x\`](${HREF})` },
  ])(
    "마크다운 $markdown 을 붙여도 던지지 않고 code와 $name 마크가 남는다",
    ({ name, markdown }) => {
      const fixture = pasteOutsideTable({
        "text/plain": `# 제목\n\n${markdown}`,
      });

      expect(fixture.errors).toEqual([]);
      expectDocValid(fixture.tiptap);
      expect(markNamesOf(fixture.tiptap, "x")).toEqual(withCode(name));
    },
  );
});

describe("표 셀 안 붙여넣기의 code와 서식 마크 공존", () => {
  it.each(FORMATS)(
    "셀에 `$name` 마크가 code 바깥인 한 블록 html을 붙여도 스키마를 통과하고 두 마크가 남는다",
    ({ name, open, close }) => {
      const result = pasteInCell({
        "text/html": `<p>${open}<code>x</code>${close}</p>`,
        "text/plain": "x",
      });

      expect(result.errors).toEqual([]);
      expectDocValid(result.tiptap);
      expect(markNamesOf(result.tiptap, "x")).toEqual(withCode(name));
    },
  );

  it.each(FORMATS)(
    "셀에 `$name` 마크가 code 바깥인 여러 블록 html을 붙여도 스키마를 통과하고 두 마크가 남는다",
    ({ name, open, close }) => {
      const result = pasteInCell({
        "text/html": `<p>${open}<code>x</code>${close}</p><p>y</p>`,
        "text/plain": "x\ny",
      });

      expect(result.errors).toEqual([]);
      expectDocValid(result.tiptap);
      expect(markNamesOf(result.tiptap, "x")).toEqual(withCode(name));
      expect(findCell(result.tiptap.state.doc, "t-r0c0").textContent).toBe(
        "cellxy",
      );
    },
  );

  it.each(FORMATS)(
    "셀에 `$name` 마크가 code 안쪽인 여러 블록 html을 붙여도 스키마를 통과하고 두 마크가 남는다",
    ({ name, open, close }) => {
      const result = pasteInCell({
        "text/html": `<p><code>${open}x${close}</code></p><p>y</p>`,
        "text/plain": "x\ny",
      });

      expect(result.errors).toEqual([]);
      expectDocValid(result.tiptap);
      expect(markNamesOf(result.tiptap, "x")).toEqual(withCode(name));
    },
  );
});

describe("편집기 → tiptapToModel → 편집기 왕복의 code와 서식 마크", () => {
  it.each(FORMATS)(
    "code와 $name 문단이 model로 돌아와도 두 마크가 남고 다시 열어도 같다",
    (format) => {
      const first = mounted(
        documentOf({ id: "b1", type: "paragraph", content: codeWith(format) }),
      );

      const model = tiptapToModel(
        first.tiptap.getJSON() as TiptapJsonNode,
        0,
        sequentialIds("model"),
      );

      if (!model.ok) throw new Error(model.error.code);
      const block = model.value.blocks[0];
      const content =
        block !== undefined &&
        "content" in block &&
        Array.isArray(block.content)
          ? block.content
          : undefined;
      expect(signature(content)).toEqual([withCode(format.name)]);
      if (format.name === "link") {
        expect(content?.[0]).toMatchObject({
          marks: expect.arrayContaining([{ type: "link", href: HREF }]),
        });
      }

      const second = mounted(model.value);
      expectDocValid(second.tiptap);
      expect(markNamesOf(second.tiptap, "x")).toEqual(withCode(format.name));
    },
  );

  it.each(FORMATS)(
    "표 셀 안 code와 $name 글자가 model로 돌아와도 두 마크가 남는다",
    (format) => {
      const table = gridTable("t", 1, 1, [""]) as Extract<
        Block,
        { type: "table" }
      >;
      const cell = table.rows[0]?.cells[0];
      if (cell === undefined) throw new Error("fixture 준비 실패");
      cell.content = codeWith(format);
      const first = mounted(documentOf(table, paragraphBlock("tail", "t")));

      const model = tiptapToModel(
        first.tiptap.getJSON() as TiptapJsonNode,
        0,
        sequentialIds("model"),
      );

      expectDocValid(first.tiptap);
      if (!model.ok) throw new Error(model.error.code);
      const block = model.value.blocks[0] as Block | undefined;
      if (block?.type !== "table") throw new Error("표 블록 조회 실패");
      expect(signature(block.rows[0]?.cells[0]?.content)).toEqual([
        withCode(format.name),
      ]);
    },
  );
});

describe("접힌 캐럿 stored mark의 code와 서식 마크 공존", () => {
  it.each(TOGGLES)(
    "$name stored mark 위에 code를 켜면 `$name` 마크를 지우지 않고 둘이 함께 남는다",
    ({ name }) => {
      const fixture = mountedParagraph([{ text: "abc" }], 1);
      expect(fixture.editor.commands.toggleCaretMark(name)).toEqual(ok);

      expect(fixture.editor.commands.toggleCaretMark("code")).toEqual(ok);

      expect(
        fixture.tiptap.state.storedMarks?.map((mark) => mark.type.name).sort(),
      ).toEqual(withCode(name));
      fixture.tiptap.commands.insertContent("X");
      expect(markNamesOf(fixture.tiptap, "X")).toEqual(withCode(name));
      expectDocValid(fixture.tiptap);
    },
  );

  it.each(TOGGLES)(
    "code stored mark 위에 `$name` 마크를 켜면 거절하지 않고 둘이 함께 남는다",
    ({ name }) => {
      const fixture = mountedParagraph([{ text: "abc" }], 1);
      expect(fixture.editor.commands.toggleCaretMark("code")).toEqual(ok);

      expect(fixture.editor.commands.toggleCaretMark(name)).toEqual(ok);

      expect(
        fixture.tiptap.state.storedMarks?.map((mark) => mark.type.name).sort(),
      ).toEqual(withCode(name));
      fixture.tiptap.commands.insertContent("X");
      expect(markNamesOf(fixture.tiptap, "X")).toEqual(withCode(name));
      expectDocValid(fixture.tiptap);
    },
  );

  it.each(TOGGLES)(
    "code+$name 글자 안 캐럿에서 `$name` 마크를 끄면 code는 남는다",
    ({ name }) => {
      const format = FORMATS.find((candidate) => candidate.name === name);
      if (format === undefined) throw new Error("fixture 준비 실패");
      const fixture = mountedParagraph(codeWith(format, "abc"), 1);

      expect(fixture.editor.commands.toggleCaretMark(name)).toEqual(ok);

      expect(
        fixture.tiptap.state.storedMarks?.map((mark) => mark.type.name),
      ).toEqual(["code"]);
      expectDocValid(fixture.tiptap);
    },
  );
});

describe("범위 선택 명령의 code와 서식 마크 공존", () => {
  it.each(FORMATS.filter((format) => format.name !== "link"))(
    "$name 글자에 toggleCode를 적용하면 `$name` 마크를 지우지 않고 code를 더한다",
    ({ name, mark }) => {
      const fixture = mountedParagraph([{ text: "abc", marks: [mark] }], 0, 3);

      expect(fixture.editor.commands.toggleCode()).toEqual(ok);

      expect(signature(contentOfB1(fixture))).toEqual([withCode(name)]);
      expectDocValid(fixture.tiptap);
    },
  );

  it.each(TOGGLES)(
    "code 글자에 `$command`를 적용하면 code를 지우지 않고 `$name` 마크를 더한다",
    ({ name, command }) => {
      const fixture = mountedParagraph(
        [{ text: "abc", marks: [{ type: "code" }] }],
        0,
        3,
      );

      expect(fixture.editor.commands[command]()).toEqual(ok);

      expect(signature(contentOfB1(fixture))).toEqual([withCode(name)]);
      expectDocValid(fixture.tiptap);
    },
  );

  it.each(TOGGLES)(
    "code+$name 글자에 toggleCode를 적용하면 code만 해제하고 `$name` 마크는 남긴다",
    ({ name }) => {
      const format = FORMATS.find((candidate) => candidate.name === name);
      if (format === undefined) throw new Error("fixture 준비 실패");
      const fixture = mountedParagraph(codeWith(format, "abc"), 0, 3);

      expect(fixture.editor.commands.toggleCode()).toEqual(ok);

      expect(signature(contentOfB1(fixture))).toEqual([[name]]);
      expectDocValid(fixture.tiptap);
    },
  );

  it.each(TOGGLES)(
    "code+$name 글자에 `$command`를 적용하면 `$name` 마크만 해제하고 code는 남긴다",
    ({ name, command }) => {
      const format = FORMATS.find((candidate) => candidate.name === name);
      if (format === undefined) throw new Error("fixture 준비 실패");
      const fixture = mountedParagraph(codeWith(format, "abc"), 0, 3);

      expect(fixture.editor.commands[command]()).toEqual(ok);

      expect(signature(contentOfB1(fixture))).toEqual([["code"]]);
      expectDocValid(fixture.tiptap);
    },
  );

  it("code 글자에 setLink를 적용하면 code를 지우지 않고 link를 더한다", () => {
    const fixture = mountedParagraph(
      [{ text: "abc", marks: [{ type: "code" }] }],
      0,
      3,
    );

    expect(fixture.editor.commands.setLink(HREF)).toEqual(ok);

    expect(signature(contentOfB1(fixture))).toEqual([withCode("link")]);
    expectDocValid(fixture.tiptap);
  });

  it("link 글자에 toggleCode를 적용하면 link를 지우지 않고 code를 더한다", () => {
    const fixture = mountedParagraph(
      [{ text: "abc", marks: [{ type: "link", href: HREF }] }],
      0,
      3,
    );

    expect(fixture.editor.commands.toggleCode()).toEqual(ok);

    expect(signature(contentOfB1(fixture))).toEqual([withCode("link")]);
    expectDocValid(fixture.tiptap);
  });

  it("code+link 글자에 unsetLink를 적용하면 link만 해제하고 code는 남긴다", () => {
    const fixture = mountedParagraph(
      codeWith(FORMATS[4] as FormatCase, "abc"),
      0,
      3,
    );

    expect(fixture.editor.commands.unsetLink()).toEqual(ok);

    expect(signature(contentOfB1(fixture))).toEqual([["code"]]);
    expectDocValid(fixture.tiptap);
  });
});
