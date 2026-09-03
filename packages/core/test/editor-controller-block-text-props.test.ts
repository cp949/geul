/**
 * 블록 수준 색상·정렬 명령(`setBlockTextColor`/`setBlockBackgroundColor`/
 * `setBlockTextAlignment`, RD-002 DELTA-02)을 검증한다. `blockId`로 지정한
 * 단일 블록의 `TextBlockProps`(textColor/backgroundColor/textAlignment)를
 * 왕복시킨다. 값 검증·원자성·undo는 `editor-controller-inline-color.test.ts`
 * (RD-002 DELTA-01)·`toggle-collapse-commands.test.ts`의 기존 계약과
 * 동형이다 — 대상이 선택/mark가 아니라 blockId로 지정한 블록 attrs라는 점만
 * 다르다.
 */
import type { Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import {
  documentOf,
  dividerBlock,
  editorState,
  listItemBlock,
  mounted,
  notApplicable,
  okResult,
  oneCellTableBlock,
  paragraphBlock,
  quoteBlock,
  restored,
} from "./editor-controller-support.js";

type ParagraphTextBlockProps = {
  textColor?: string;
  backgroundColor?: string;
  textAlignment?: "left" | "center" | "right";
};

/**
 * paragraphBlock에 TextBlockProps 필드를 얹은 버전을 만든다. paragraphBlock
 * 자체가 반환하는 타입은 넓은 Block 유니온이라, 그 결과를 spread한 뒤 새
 * 필드를 밖에서 얹으면 유니온의 다른 멤버(TableBlock 등)에 그 필드가 없어
 * 타입 오류가 난다 — 이 헬퍼는 단일 리터럴로 조립해 그 문제를 피한다
 * (list-item-block-type-support.ts의 headingBlock류가 쓰는 조건부 spread
 * 관례와 동형).
 */
const paragraphWithProps = (
  id: string,
  text: string,
  props: ParagraphTextBlockProps,
  children?: Block[],
): Block => ({
  id,
  type: "paragraph",
  content: text === "" ? [] : [{ text }],
  ...props,
  ...(children === undefined ? {} : { children }),
});

/** table/divider/codeBlock 셋 다 TextBlockProps 대상이 아니다(spec §3.3). */
const ineligibleBlocksDocument = () =>
  documentOf(
    oneCellTableBlock("table-1"),
    dividerBlock("divider-1"),
    {
      id: "code-1",
      type: "codeBlock",
      content: [{ text: "code" }],
      language: "text",
    } as Block,
    paragraphBlock("tail", "꼬리"),
  );

const blockColorCommands = [
  { command: "setBlockTextColor" as const, field: "textColor" as const },
  {
    command: "setBlockBackgroundColor" as const,
    field: "backgroundColor" as const,
  },
];

describe.each(blockColorCommands)("$command", ({ command, field }) => {
  it("정규 색상을 설정하고 undo 1회로 복원한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("p-1", "본문"), paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands[command]("p-1", "#AABBCC")).toEqual(okResult);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        paragraphWithProps("p-1", "본문", { [field]: "#AABBCC" }),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("이미 같은 색이 설정된 상태에서 같은 값을 다시 호출하면 무변경 COMMAND_NOT_APPLICABLE이다", () => {
    const source = paragraphWithProps("p-1", "본문", { [field]: "#AABBCC" });
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands[command]("p-1", "#AABBCC")).toEqual(
      notApplicable(command),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("명시적 null을 넘기면 설정된 색을 해제한다", () => {
    const source = paragraphWithProps("p-1", "본문", { [field]: "#AABBCC" });
    const { editor } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );

    expect(editor.commands[command]("p-1", null)).toEqual(okResult);

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        paragraphBlock("p-1", "본문"),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });
  });

  it("비정규 색상은 INVALID_COLOR로 문서·selection 무변경 거절한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("p-1", "본문"), paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands[command]("p-1", "#aabbcc")).toEqual({
      ok: false,
      error: { code: "INVALID_COLOR", color: "#aabbcc" },
    });
    expect(editor.commands[command]("p-1", "red")).toEqual({
      ok: false,
      error: { code: "INVALID_COLOR", color: "red" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("존재하지 않는 blockId는 BLOCK_NOT_FOUND를 무변경으로 반환한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("p-1", "본문")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands[command]("missing", "#AABBCC")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("table/divider/codeBlock blockId 대상은 무변경으로 COMMAND_NOT_APPLICABLE이다", () => {
    const { editor, tiptap } = mounted(ineligibleBlocksDocument());
    const before = editorState(editor, tiptap);

    expect(editor.commands[command]("table-1", "#AABBCC")).toEqual(
      notApplicable(command),
    );
    expect(editor.commands[command]("divider-1", "#AABBCC")).toEqual(
      notApplicable(command),
    );
    expect(editor.commands[command]("code-1", "#AABBCC")).toEqual(
      notApplicable(command),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
  });
});

describe("setBlockTextAlignment", () => {
  it("정규 정렬값을 설정하고 undo 1회로 복원한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("p-1", "본문"), paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setBlockTextAlignment("p-1", "center")).toEqual(
      okResult,
    );

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        paragraphWithProps("p-1", "본문", { textAlignment: "center" }),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });

    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("이미 같은 정렬이 설정된 상태에서 같은 값을 다시 호출하면 무변경 COMMAND_NOT_APPLICABLE이다", () => {
    const source = paragraphWithProps("p-1", "본문", {
      textAlignment: "center",
    });
    const { editor, tiptap } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setBlockTextAlignment("p-1", "center")).toEqual(
      notApplicable("setBlockTextAlignment"),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("명시적 null을 넘기면 설정된 정렬을 해제한다", () => {
    const source = paragraphWithProps("p-1", "본문", {
      textAlignment: "center",
    });
    const { editor } = mounted(
      documentOf(source, paragraphBlock("tail", "꼬리")),
    );

    expect(editor.commands.setBlockTextAlignment("p-1", null)).toEqual(
      okResult,
    );

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        paragraphBlock("p-1", "본문"),
        paragraphBlock("tail", "꼬리"),
      ),
      revision: 1,
    });
  });

  it("비정규 정렬값은 INVALID_ALIGN으로 문서·selection 무변경 거절한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("p-1", "본문"), paragraphBlock("tail", "꼬리")),
    );
    const before = editorState(editor, tiptap);

    expect(
      editor.commands.setBlockTextAlignment("p-1", "justify" as never),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_ALIGN", align: "justify" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("존재하지 않는 blockId는 BLOCK_NOT_FOUND를 무변경으로 반환한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("p-1", "본문")),
    );
    const before = editorState(editor, tiptap);

    expect(editor.commands.setBlockTextAlignment("missing", "center")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  it("table/divider/codeBlock blockId 대상은 무변경으로 COMMAND_NOT_APPLICABLE이다", () => {
    const { editor, tiptap } = mounted(ineligibleBlocksDocument());
    const before = editorState(editor, tiptap);

    expect(editor.commands.setBlockTextAlignment("table-1", "center")).toEqual(
      notApplicable("setBlockTextAlignment"),
    );
    expect(
      editor.commands.setBlockTextAlignment("divider-1", "center"),
    ).toEqual(notApplicable("setBlockTextAlignment"));
    expect(editor.commands.setBlockTextAlignment("code-1", "center")).toEqual(
      notApplicable("setBlockTextAlignment"),
    );
    expect(editorState(editor, tiptap)).toEqual(before);
  });
});

describe("TextBlockProps 적용 대상 판정 공통 계약", () => {
  it("heading/quote/목록 항목에도 동작한다", () => {
    const heading: Block = {
      id: "h-1",
      type: "heading",
      level: 2,
      content: [{ text: "제목" }],
    };
    const quote = quoteBlock("q-1", "인용");
    const list = listItemBlock("bl-1", "bulletListItem", "항목");
    const { editor } = mounted(
      documentOf(heading, quote, list, paragraphBlock("tail", "꼬리")),
    );

    expect(editor.commands.setBlockTextColor("h-1", "#112233")).toEqual(
      okResult,
    );
    expect(editor.commands.setBlockTextColor("q-1", "#112233")).toEqual(
      okResult,
    );
    expect(editor.commands.setBlockTextColor("bl-1", "#112233")).toEqual(
      okResult,
    );

    const [resultHeading, resultQuote, resultList] =
      editor.getDocument().blocks;
    expect(resultHeading).toMatchObject({ textColor: "#112233" });
    expect(resultQuote).toMatchObject({ textColor: "#112233" });
    expect(resultList).toMatchObject({ textColor: "#112233" });
  });

  it("형제·자식 블록의 content·attrs는 건드리지 않고 대상의 지정 필드만 바꾼다", () => {
    const child = paragraphBlock("child-1", "자식");
    const source = paragraphBlock("p-1", "본문", [child]);
    const sibling = paragraphWithProps("sibling-1", "형제", {
      textColor: "#112233",
    });
    const tail = paragraphBlock("tail", "꼬리");
    const { editor } = mounted(documentOf(source, sibling, tail));

    expect(editor.commands.setBlockTextColor("p-1", "#AABBCC")).toEqual(
      okResult,
    );

    expect(editor.getDocument()).toEqual({
      ...documentOf(
        paragraphWithProps("p-1", "본문", { textColor: "#AABBCC" }, [child]),
        sibling,
        tail,
      ),
      revision: 1,
    });
  });

  it("textColor/backgroundColor/textAlignment는 서로 다른 필드라 한 블록에 동시 적용된다", () => {
    const { editor } = mounted(
      documentOf(paragraphBlock("p-1", "본문"), paragraphBlock("tail", "꼬리")),
    );

    expect(editor.commands.setBlockTextColor("p-1", "#AABBCC")).toEqual(
      okResult,
    );
    expect(editor.commands.setBlockBackgroundColor("p-1", "#112233")).toEqual(
      okResult,
    );
    expect(editor.commands.setBlockTextAlignment("p-1", "center")).toEqual(
      okResult,
    );

    const [result] = editor.getDocument().blocks;
    expect(result).toMatchObject({
      textColor: "#AABBCC",
      backgroundColor: "#112233",
      textAlignment: "center",
    });
  });
});
