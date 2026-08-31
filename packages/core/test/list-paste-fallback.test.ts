/**
 * PM 기본 붙여넣기 폴백으로 들어오는 외부 ul/ol이 목록 구조(마커 타입·
 * 중첩 계층·명시적 startNumber)를 보존하는지, 그리고 깊이 상한을 넘는
 * 입력이 throw 없이 평탄화되는지 검증한다(DELTA-03, Issue #143 (c)).
 * quote-paste-fallback.test.ts와 같은 패턴(errors 이벤트 리스너로 미처리
 * 예외 감지)을 쓴다.
 */
import { MAX_NESTING_DEPTH, type Block } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import { pasteHtml } from "./clipboard-test-support.js";
import {
  documentOf,
  listItemBlock,
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

/** jsdom dispatchEvent는 리스너 예외를 재던지지 않는다 — window의 전역
 * error 이벤트로만 실제 미처리 예외 유무를 잡는다(quote-paste-fallback와
 * 동일 근거). */
const withUnhandledErrorTracking = (run: (errors: unknown[]) => void) => {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => errors.push(event.error);
  window.addEventListener("error", onError);
  try {
    run(errors);
  } finally {
    window.removeEventListener("error", onError);
  }
};

/** depth단짜리 <ul><li>...</li></ul> 체인 HTML — li가 정확히 depth개
 * 중첩된다(리프는 leafText, 그 외는 "x"). */
const nestedListHtml = (depth: number, leafText: string): string => {
  let html = `<li>${leafText}</li>`;
  for (let level = 1; level < depth; level += 1) {
    html = `<li>x<ul>${html}</ul></li>`;
  }
  return `<ul>${html}</ul>`;
};

/** depth단짜리 bulletListItem 체인 model Block — chain-1이 top-level,
 * chain-depth가 가장 깊다(top-level=1 기준 절대 깊이 depth). */
const buildListDepthChain = (depth: number): Block => {
  let innermost = listItemBlock(`chain-${depth}`, "bulletListItem", "leaf");
  for (let level = depth - 1; level >= 1; level -= 1) {
    innermost = listItemBlock(`chain-${level}`, "bulletListItem", "mid", {
      children: [innermost],
    });
  }
  return innermost;
};

/** Document blocks 트리의 최대 절대 깊이(top-level=1)를 구한다. */
const maxBlockDepth = (blocks: readonly Block[], depth = 1): number =>
  blocks.reduce((max, block) => {
    const childDepth =
      block.children !== undefined && block.children.length > 0
        ? maxBlockDepth(block.children, depth + 1)
        : depth;
    return Math.max(max, childDepth);
  }, depth);

describe("PM 기본 붙여넣기 폴백의 외부 ul/ol", () => {
  it("문단 사이 목록이 섞인 외부 HTML을 붙여넣으면 throw 없이 bulletListItem이 문서에 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(
        editable,
        "<p>a</p><ul><li>x</li><li>y</li></ul><p>b</p>",
      );

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "bulletListItem");
      expect(items).toHaveLength(2);
      expect(items.map((item) => item.content)).toEqual([
        [{ text: "x" }],
        [{ text: "y" }],
      ]);

      expect(errors).toEqual([]);
    });
  });

  it("ol[start]가 첫 li의 numberedListItem.startNumber로 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, '<ol start="5"><li>z</li><li>w</li></ol>');

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter(
        (block) => block.type === "numberedListItem",
      );
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        content: [{ text: "z" }],
        startNumber: 5,
      });
      expect(items[1]?.startNumber).toBeUndefined();

      expect(errors).toEqual([]);
    });
  });

  it("중첩 목록이 children 트리로 반영되고 순서가 보존된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(
        editable,
        "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>",
      );

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "bulletListItem");
      expect(items).toHaveLength(2);
      expect(items[0]?.content).toEqual([{ text: "a" }]);
      expect(items[0]?.children).toHaveLength(1);
      expect(items[0]?.children?.[0]).toMatchObject({
        type: "bulletListItem",
        content: [{ text: "b" }],
      });
      expect(items[1]?.content).toEqual([{ text: "c" }]);
      expect(items[1]?.children).toBeUndefined();

      expect(errors).toEqual([]);
    });
  });

  // 완료 조건 4: slice 자신의 내부 깊이만으로 이미 MAX_NESTING_DEPTH를
  // 넘는 입력. guard 없이 그대로 반영하려 하면 readEditorDocument가
  // DOCUMENT_LIMIT_EXCEEDED를 throw new TypeError로 바꾼다(production-editor-
  // session.ts) — window의 error 이벤트로 이 미처리 예외를 잡는다.
  it("MAX_NESTING_DEPTH를 단독으로 넘는 깊게 중첩된 목록을 최상위에 붙이면 throw 없이 상한 안으로 평탄화된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(MAX_NESTING_DEPTH + 10, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBeLessThanOrEqual(
        MAX_NESTING_DEPTH,
      );
      const leaf = document.blocks
        .flatMap(function collect(block): Block[] {
          return [block, ...(block.children ?? []).flatMap(collect)];
        })
        .find((block) => block.content?.[0]?.text === "leaf");
      expect(leaf).toBeDefined();
    });
  });

  // 완료 조건 5(N1 재현): 대상 위치 자체가 이미 깊다(60) — 그 위치에
  // 캐럿을 두고 얕은(5단) slice를 붙여도 합산(60+4=64 근접~초과)이 상한을
  // 넘으면 throw 없이 평탄화된다. guard가 slice 내부 깊이만 보고 대상 위치
  // 깊이를 합산하지 않으면 이 케이스에서 TypeError가 재현된다.
  it("이미 깊은 위치에 캐럿을 두고 목록을 추가로 붙이면 합산 깊이가 상한을 넘어도 throw 없이 평탄화된다", () => {
    const deepChainDepth = 60;
    const editor = createEditor({
      initialDocument: documentOf(buildListDepthChain(deepChainDepth)),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, `chain-${deepChainDepth}`),
    );

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(10, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBeLessThanOrEqual(
        MAX_NESTING_DEPTH,
      );
    });
  });
});
