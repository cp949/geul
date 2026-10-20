/**
 * 일반 블록 타입 변환(슬래시 메뉴·툴바·단축키)이 결과 selection을 화면 안으로
 * 스크롤하도록 변환 transaction에 표시하는지 검증한다(Issue #426).
 * 변환 뒤 selection head가 변환한 블록 안일 때만 표시한다. 사이드 메뉴
 * Turn into처럼 head가 대상 밖이면 화면 밖 옛 selection으로 뷰가 튀므로
 * 표시하지 않는다. jsdom은 실제 스크롤을 못 하므로 transaction 플래그로
 * 고정한다.
 */
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { isHeadInsideBlockContent } from "../src/block-position.js";
import { setBlockTypeCommand } from "../src/block-type-commands.js";
import { setBlockTypeShortcut } from "../src/block-type-keyboard-extension.js";
import { contentTextStart } from "./block-test-support.js";
import {
  collectDispatched,
  documentOf,
  mounted,
  okResult,
  paragraphBlock,
} from "./editor-controller-support.js";

type Tiptap = ReturnType<typeof mounted>["tiptap"];

/** blockId 블록 텍스트 시작에서 offset만큼 떨어진 곳에 캐럿을 둔다. */
const placeCaret = (tiptap: Tiptap, blockId: string, offset = 0): number => {
  const position = contentTextStart(tiptap, blockId) + offset;
  tiptap.view.dispatch(
    tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, position),
    ),
  );
  return position;
};

/** 문서를 바꾼 transaction이 정확히 하나인지 확인하고 돌려준다. */
const onlyConversion = (dispatched: ReturnType<typeof collectDispatched>) => {
  const conversions = dispatched.filter((tr) => tr.docChanged);
  expect(conversions).toHaveLength(1);
  return conversions[0];
};

describe("setBlockType 일반 경로의 selection 스크롤 표시", () => {
  it("슬래시 경로(clearContent)로 캐럿 블록을 heading으로 바꾸면 스크롤을 표시한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("source", "/h1"), paragraphBlock("tail", "t")),
    );
    placeCaret(tiptap, "source", "/h1".length);
    const dispatched = collectDispatched(tiptap);

    expect(
      editor.commands.setBlockType(
        "source",
        { type: "heading", level: 1 },
        { clearContent: true },
      ),
    ).toEqual(okResult);

    expect(onlyConversion(dispatched)?.scrolledIntoView).toBe(true);
    expect(tiptap.state.selection.head).toBe(
      contentTextStart(tiptap, "source"),
    );
  });

  it("툴바 경로(clearContent 없음)로 캐럿 블록을 바꾸면 스크롤을 표시한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("source", "text"), paragraphBlock("tail", "t")),
    );
    placeCaret(tiptap, "source", 2);
    const dispatched = collectDispatched(tiptap);

    expect(
      editor.commands.setBlockType("source", { type: "heading", level: 2 }),
    ).toEqual(okResult);

    expect(onlyConversion(dispatched)?.scrolledIntoView).toBe(true);
  });

  it.each([
    { label: "블록 시작", offset: 0 },
    { label: "블록 끝", offset: "text".length },
  ])(
    "캐럿이 $label 경계에 있어도 대상 블록 안으로 보고 스크롤을 표시한다",
    ({ offset }) => {
      const { editor, tiptap } = mounted(
        documentOf(
          paragraphBlock("source", "text"),
          paragraphBlock("tail", "t"),
        ),
      );
      placeCaret(tiptap, "source", offset);
      const dispatched = collectDispatched(tiptap);

      expect(editor.commands.setBlockType("source", { type: "quote" })).toEqual(
        okResult,
      );

      expect(onlyConversion(dispatched)?.scrolledIntoView).toBe(true);
    },
  );

  it("사이드 메뉴 Turn into처럼 캐럿이 대상 밖이면 스크롤을 표시하지 않고 selection을 그대로 둔다", () => {
    const { editor, tiptap } = mounted(
      documentOf(paragraphBlock("source", "text"), paragraphBlock("tail", "t")),
    );
    const tailStart = placeCaret(tiptap, "tail");
    const dispatched = collectDispatched(tiptap);

    expect(
      editor.commands.setBlockType("source", { type: "heading", level: 1 }),
    ).toEqual(okResult);

    expect(onlyConversion(dispatched)?.scrolledIntoView).toBe(false);
    expect(tiptap.state.selection.toJSON()).toEqual({
      type: "text",
      anchor: tailStart,
      head: tailStart,
    });
  });
});

describe("setBlockTypes의 selection 스크롤 표시", () => {
  it("selection head가 변환한 블록 중 하나 안이면 스크롤을 표시한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("a", "one"),
        paragraphBlock("b", "two"),
        paragraphBlock("tail", "t"),
      ),
    );
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.create(
          tiptap.state.doc,
          contentTextStart(tiptap, "a"),
          contentTextStart(tiptap, "b") + 1,
        ),
      ),
    );
    const dispatched = collectDispatched(tiptap);

    expect(
      editor.commands.setBlockTypes(["a", "b"], { type: "heading", level: 3 }),
    ).toEqual(okResult);

    expect(onlyConversion(dispatched)?.scrolledIntoView).toBe(true);
  });

  it("selection head가 이미 같은 타입이라 건너뛴 대상 블록 안이어도 스크롤을 표시한다", () => {
    // 앞 블록이 커지면 건너뛴 블록 안의 캐럿도 아래로 밀린다.
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("a", "one"),
        { id: "b", type: "heading", level: 3, content: [{ text: "two" }] },
        paragraphBlock("tail", "t"),
      ),
    );
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(
        TextSelection.create(
          tiptap.state.doc,
          contentTextStart(tiptap, "a"),
          contentTextStart(tiptap, "b") + 2,
        ),
      ),
    );
    const dispatched = collectDispatched(tiptap);

    expect(
      editor.commands.setBlockTypes(["a", "b"], { type: "heading", level: 3 }),
    ).toEqual(okResult);

    expect(onlyConversion(dispatched)?.scrolledIntoView).toBe(true);
  });

  it("selection head가 변환한 모든 블록 밖이면 스크롤을 표시하지 않는다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("a", "one"),
        paragraphBlock("b", "two"),
        paragraphBlock("tail", "t"),
      ),
    );
    const tailStart = placeCaret(tiptap, "tail");
    const dispatched = collectDispatched(tiptap);

    expect(
      editor.commands.setBlockTypes(["a", "b"], { type: "quote" }),
    ).toEqual(okResult);

    expect(onlyConversion(dispatched)?.scrolledIntoView).toBe(false);
    expect(tiptap.state.selection.head).toBe(tailStart);
  });
});

describe("단축키 경로의 selection 스크롤 표시", () => {
  it("Mod-Alt-1 단축키 변환은 캐럿 블록 안이므로 스크롤을 표시한다", () => {
    const { tiptap } = mounted(
      documentOf(paragraphBlock("source", "text"), paragraphBlock("tail", "t")),
    );
    placeCaret(tiptap, "source", 1);
    const dispatched = collectDispatched(tiptap);

    expect(setBlockTypeShortcut(tiptap, { type: "heading", level: 1 })).toBe(
      true,
    );

    expect(onlyConversion(dispatched)?.scrolledIntoView).toBe(true);
  });

  it("setBlockTypeCommand도 캐럿이 대상 밖이면 스크롤을 표시하지 않는다", () => {
    const { tiptap } = mounted(
      documentOf(paragraphBlock("source", "text"), paragraphBlock("tail", "t")),
    );
    const tailStart = placeCaret(tiptap, "tail");
    const dispatched = collectDispatched(tiptap);

    expect(
      setBlockTypeCommand(tiptap, "source", { type: "heading", level: 1 }),
    ).toEqual(okResult);

    expect(onlyConversion(dispatched)?.scrolledIntoView).toBe(false);
    expect(tiptap.state.selection.head).toBe(tailStart);
  });
});

describe("isHeadInsideBlockContent 경계", () => {
  // source 콘텐츠 노드("text")의 position과 텍스트 시작·끝 기준 offset이다.
  // 콘텐츠 노드 position은 텍스트 시작 바로 앞이다.
  it.each([
    { label: "콘텐츠 노드 바로 앞", offset: -1, result: "밖", expected: false },
    { label: "텍스트 시작", offset: 0, result: "안", expected: true },
    { label: "텍스트 끝", offset: "text".length, result: "안", expected: true },
    {
      label: "콘텐츠 노드 바로 뒤",
      offset: "text".length + 1,
      result: "밖",
      expected: false,
    },
  ])(
    "head가 $label 위치에 있으면 블록 $result 판정이다",
    ({ offset, expected }) => {
      const { tiptap } = mounted(
        documentOf(
          paragraphBlock("source", "text"),
          paragraphBlock("tail", "t"),
        ),
      );
      const textStart = contentTextStart(tiptap, "source");

      expect(
        isHeadInsideBlockContent(tiptap.state.doc, textStart + offset, [
          textStart - 1,
        ]),
      ).toBe(expected);
    },
  );

  it("빈 블록은 텍스트 시작이 곧 끝이라 안으로 보고 다음 블록 텍스트는 밖으로 본다", () => {
    const { tiptap } = mounted(
      documentOf(paragraphBlock("source", ""), paragraphBlock("tail", "t")),
    );
    const textStart = contentTextStart(tiptap, "source");
    const { doc } = tiptap.state;

    expect(isHeadInsideBlockContent(doc, textStart, [textStart - 1])).toBe(
      true,
    );
    expect(
      isHeadInsideBlockContent(doc, contentTextStart(tiptap, "tail"), [
        textStart - 1,
      ]),
    ).toBe(false);
  });

  it("여러 position 중 하나라도 head를 담으면 참이다", () => {
    const { tiptap } = mounted(
      documentOf(
        paragraphBlock("a", "one"),
        paragraphBlock("b", "two"),
        paragraphBlock("tail", "t"),
      ),
    );
    const aStart = contentTextStart(tiptap, "a");
    const bStart = contentTextStart(tiptap, "b");

    expect(
      isHeadInsideBlockContent(tiptap.state.doc, bStart + 1, [
        aStart - 1,
        bStart - 1,
      ]),
    ).toBe(true);
    expect(
      isHeadInsideBlockContent(
        tiptap.state.doc,
        contentTextStart(tiptap, "tail"),
        [aStart - 1, bStart - 1],
      ),
    ).toBe(false);
  });
});
