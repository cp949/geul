/**
 * 여러 블록 선택이 접힌 toggle을 걸칠 때 숨은 자손을 블록 단위 수집과
 * codeBlock 교차 판정에서 빼는지 검증한다(Issue #264).
 *
 * 규칙:
 * - 숨은 자손은 조상 중 접힌 toggle이 하나라도 있는 블록이다. 라벨은 보인다.
 * - 블록 단위 수집(`getSelectionBlocks()`)과 공개 codeBlock 교차 판정
 *   (`selectionIntersectsCodeBlock()`)은 보이는 블록만 본다.
 * - 텍스트 범위 연산(mark 적용, 붙여넣기)은 범위 전체를 본다. 붙여넣기의
 *   codeBlock 분기는 범위 전체 판정을 그대로 쓴다.
 *
 * selection은 DOM selection이 아니라 view.dispatch(tr.setSelection(...))로
 * 만든다. jsdom selectionchange 큐잉이 순서 결함을 가리기 때문이다. 양 끝점은
 * 보이는 블록에 두어 #246 selection 가드가 끝점을 옮기지 않는다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  outline,
  pasteData,
  pasteHtml,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  mounted,
  mountTiptapEditor,
  okResult,
  paragraphBlock,
  sequentialIds,
  toggleBlock,
} from "./editor-controller-support.js";

const TEXT_A = "앞 문단";
const TEXT_Z = "뒤 문단";
const LABEL_T = "토글";
const TEXT_H = "숨은 자식";

/**
 * 공통 fixture 문서. [a(문단), t(toggle, 자식 hidden), z(문단)].
 * hidden은 호출부가 정한다(문단 또는 codeBlock). collapsed 기본값은 true다.
 */
const hiddenChildDocument = (hidden: Block, collapsed = true) =>
  documentOf(
    paragraphBlock("a", TEXT_A),
    toggleBlock("t", LABEL_T, { collapsed, children: [hidden] }),
    paragraphBlock("z", TEXT_Z),
  );

/** a 텍스트 시작부터 z 텍스트 끝까지 TextSelection을 dispatch한다. */
const selectAToZ = (tiptap: TiptapEditor): void => {
  const selection = TextSelection.create(
    tiptap.state.doc,
    contentTextStart(tiptap, "a"),
    contentTextStart(tiptap, "z") + TEXT_Z.length,
  );
  tiptap.view.dispatch(tiptap.state.tr.setSelection(selection));
};

/** 문서 전체 AllSelection을 dispatch한다. */
const selectAll = (tiptap: TiptapEditor): void => {
  tiptap.view.dispatch(
    tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)),
  );
};

/** getSelectionBlocks() 결과의 blockId 목록. */
const selectedIds = (editor: ReturnType<typeof mounted>["editor"]) =>
  editor.getSelectionBlocks().map((block) => block.blockId);

/** 저장 문서에서 blockId 블록을 꺼낸다. 없으면 던진다. */
const blockOf = (
  editor: ReturnType<typeof mounted>["editor"],
  blockId: string,
) => {
  const block = editor.getBlock(blockId);
  if (block === undefined) throw new Error(`블록 ${blockId} 조회 실패`);
  return block;
};

describe("접힌 toggle을 걸친 여러 블록 선택의 블록 수집", () => {
  it("숨은 자식은 getSelectionBlocks()에 들어가지 않는다", () => {
    const { editor, tiptap } = mounted(
      hiddenChildDocument(paragraphBlock("h", TEXT_H)),
    );

    selectAToZ(tiptap);

    expect(selectedIds(editor)).toEqual(["a", "t", "z"]);
  });

  it("AllSelection에서도 숨은 자식은 들어가지 않는다", () => {
    const { editor, tiptap } = mounted(
      hiddenChildDocument(paragraphBlock("h", TEXT_H)),
    );

    selectAll(tiptap);

    expect(selectedIds(editor)).toEqual(["a", "t", "z"]);
  });

  it("펼친 toggle의 자식은 그대로 들어간다", () => {
    const { editor, tiptap } = mounted(
      hiddenChildDocument(paragraphBlock("h", TEXT_H), false),
    );

    selectAToZ(tiptap);

    expect(selectedIds(editor)).toEqual(["a", "t", "h", "z"]);
  });

  it("펼친 toggle 안 접힌 toggle의 자식과 접힌 toggle 안 접힌 toggle의 자식이 모두 빠진다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("a", TEXT_A),
        toggleBlock("u", "펼침", {
          children: [
            toggleBlock("v", "안쪽 접힘", {
              collapsed: true,
              children: [paragraphBlock("w", "안쪽 숨김")],
            }),
            paragraphBlock("u2", "보이는 자식"),
          ],
        }),
        toggleBlock("x", "바깥 접힘", {
          collapsed: true,
          children: [
            toggleBlock("y", "숨은 접힘", {
              collapsed: true,
              children: [paragraphBlock("q", "깊은 숨김")],
            }),
          ],
        }),
        paragraphBlock("z", TEXT_Z),
      ),
    );

    selectAToZ(tiptap);

    expect(selectedIds(editor)).toEqual(["a", "u", "v", "u2", "x", "z"]);
  });

  it("수집 결과로 heading 변환하면 보이는 블록만 바뀌고 숨은 자식은 문단으로 남는다", () => {
    const { editor, tiptap } = mounted(
      hiddenChildDocument(paragraphBlock("h", TEXT_H)),
    );
    selectAToZ(tiptap);

    expect(
      editor.commands.setBlockTypes(selectedIds(editor), {
        type: "heading",
        level: 1,
      }),
    ).toEqual(okResult);

    for (const blockId of ["a", "t", "z"]) {
      expect(blockOf(editor, blockId), blockId).toMatchObject({
        type: "heading",
        level: 1,
      });
    }
    expect(blockOf(editor, "h")).toEqual(paragraphBlock("h", TEXT_H));
  });

  // blocker는 codeBlock 대상을 건너뛰어 수정 전에도 null이다. 회귀를 잡는
  // 것은 id 목록 단언이고, blocker 단언은 수집 결과가 그대로 쓰이는지만 본다.
  it("숨은 자식이 codeBlock이면 수집 id에서 빠지고 그 id 목록의 blocker는 null이다", () => {
    const { editor, tiptap } = mounted(
      hiddenChildDocument(codeBlockBlock("h", TEXT_H, "text")),
    );
    selectAToZ(tiptap);

    const ids = selectedIds(editor);

    expect(ids).toEqual(["a", "t", "z"]);
    expect(
      editor.getBlockTypesBlocker(ids, { type: "heading", level: 1 }),
    ).toBeNull();
  });
});

describe("접힌 toggle을 걸친 여러 블록 선택의 codeBlock 교차 판정", () => {
  it("숨은 codeBlock만 걸치면 selectionIntersectsCodeBlock()이 false다", () => {
    const { editor, tiptap } = mounted(
      hiddenChildDocument(codeBlockBlock("h", TEXT_H, "text")),
    );

    selectAToZ(tiptap);

    expect(editor.selectionIntersectsCodeBlock()).toBe(false);
  });

  it("AllSelection이 숨은 codeBlock만 걸쳐도 false다", () => {
    const { editor, tiptap } = mounted(
      hiddenChildDocument(codeBlockBlock("h", TEXT_H, "text")),
    );

    selectAll(tiptap);

    expect(editor.selectionIntersectsCodeBlock()).toBe(false);
  });

  it("숨은 codeBlock만 걸치면 toggleBold가 성공하고 보이는 텍스트에만 bold가 붙는다", () => {
    const { editor, tiptap } = mounted(
      hiddenChildDocument(codeBlockBlock("h", TEXT_H, "text")),
    );
    selectAToZ(tiptap);

    expect(editor.commands.toggleBold()).toEqual(okResult);

    const bold = [{ type: "bold" }];
    expect(blockOf(editor, "a")).toMatchObject({
      content: [{ text: TEXT_A, marks: bold }],
    });
    expect(blockOf(editor, "t")).toMatchObject({
      content: [{ text: LABEL_T, marks: bold }],
    });
    expect(blockOf(editor, "z")).toMatchObject({
      content: [{ text: TEXT_Z, marks: bold }],
    });
    expect(blockOf(editor, "h")).toEqual(codeBlockBlock("h", TEXT_H, "text"));
    // 툴바 눌림 상태의 원천이 명령 결과를 따른다.
    expect(editor.getSelectionMarks()).toContain("bold");
  });

  it("숨은 codeBlock만 걸친 범위에서 toggleBold를 두 번 하면 보이는 텍스트의 bold가 풀린다", () => {
    // mark를 허용하지 않는 숨은 codeBlock이 active 판정에서 빠져야 해제된다.
    const { editor, tiptap } = mounted(
      hiddenChildDocument(codeBlockBlock("h", TEXT_H, "text")),
    );
    selectAToZ(tiptap);

    expect(editor.commands.toggleBold()).toEqual(okResult);
    expect(editor.commands.toggleBold()).toEqual(okResult);

    expect(blockOf(editor, "a")).toEqual(paragraphBlock("a", TEXT_A));
    expect(blockOf(editor, "z")).toEqual(paragraphBlock("z", TEXT_Z));
    expect(editor.getSelectionMarks()).not.toContain("bold");
  });

  it("범위 mark는 범위 전체를 보므로 숨은 일반 텍스트에도 bold가 붙는다", () => {
    const { editor, tiptap } = mounted(
      hiddenChildDocument(paragraphBlock("h", TEXT_H)),
    );
    selectAToZ(tiptap);

    expect(editor.commands.toggleBold()).toEqual(okResult);

    expect(blockOf(editor, "h")).toMatchObject({
      content: [{ text: TEXT_H, marks: [{ type: "bold" }] }],
    });
  });

  it("보이는 codeBlock이 범위에 있으면 true이고 toggleBold는 CODE_BLOCK_MARK_NOT_ALLOWED다", () => {
    const { editor, tiptap } = mounted(
      documentOf(
        paragraphBlock("a", TEXT_A),
        codeBlockBlock("c", "보이는 코드", "text"),
        toggleBlock("t", LABEL_T, {
          collapsed: true,
          children: [paragraphBlock("h", TEXT_H)],
        }),
        paragraphBlock("z", TEXT_Z),
      ),
    );
    selectAToZ(tiptap);

    expect(editor.selectionIntersectsCodeBlock()).toBe(true);
    expect(editor.commands.toggleBold()).toEqual({
      ok: false,
      error: { code: "CODE_BLOCK_MARK_NOT_ALLOWED" },
    });
  });

  it("펼친 toggle 안 codeBlock은 보이므로 true다", () => {
    const { editor, tiptap } = mounted(
      hiddenChildDocument(codeBlockBlock("h", TEXT_H, "text"), false),
    );

    selectAToZ(tiptap);

    expect(editor.selectionIntersectsCodeBlock()).toBe(true);
  });
});

describe("접힌 toggle을 걸친 범위의 붙여넣기 codeBlock 분기", () => {
  // 숨은 codeBlock이 범위 안이어도 평문은 codeBlock 분기가 처리한다(Issue
  // #264). 유효한 한 줄 평문이라 PM 파싱 slice가 범위를 대체한다(Issue #306
  // 전에는 PM 기본 위임 false였다). HTML은 시작이 codeBlock 밖이면 이 분기를
  // 지나 HTML 분기로 합류한다(Issue #286) — 아래 두 번째 테스트가 맡는다.
  it("숨은 codeBlock을 걸친 범위에서도 평문 기본 붙여넣기는 codeBlock 분기로 처리를 넘긴다", () => {
    const results: boolean[] = [];
    const editor = createEditor({
      initialDocument: hiddenChildDocument(codeBlockBlock("h", TEXT_H, "text")),
      createId: sequentialIds("id"),
      pasteHandler: (context) => {
        results.push(context.defaultPasteHandler());
        return true;
      },
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    selectAToZ(tiptap);

    withUnhandledErrorTracking((errors) => {
      pasteData(editable, { "text/plain": "붙임" });

      // 범위 전체(숨은 codeBlock 포함)가 평문 한 문단으로 대체된다.
      expect(results).toEqual([true]);
      expect(outline(editor.getDocument().blocks)).toEqual(["p:붙임"]);
      expect(errors).toEqual([]);
    });
  });

  it("숨은 codeBlock을 걸친 범위라도 시작이 codeBlock 밖이면 HTML은 HTML 분기가 처리한다(Issue #286)", () => {
    const results: boolean[] = [];
    const editor = createEditor({
      initialDocument: hiddenChildDocument(codeBlockBlock("h", TEXT_H, "text")),
      createId: sequentialIds("id"),
      pasteHandler: (context) => {
        results.push(context.defaultPasteHandler());
        return true;
      },
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    selectAToZ(tiptap);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<h4>붙임</h4>");

      // true는 HTML 분기가 처리했다는 뜻이다. 범위가 h4 하나로 대체되고
      // 양끝 문단은 빈 문단으로 남으며 숨은 codeBlock은 남지 않는다.
      expect(results).toEqual([true]);
      expect(outline(editor.getDocument().blocks)).toEqual([
        "p:",
        "h4:붙임",
        "p:",
      ]);
      expect(errors).toEqual([]);
    });
  });
});
