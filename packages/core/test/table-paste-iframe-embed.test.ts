/**
 * 표가 든 html 붙여넣기가 호스트의 `iframeEmbed` 설정을 따르는지 검증한다(Issue #359).
 *
 * - 호스트가 url을 허용하면 표 옆 iframe 블록에 url이 붙는다.
 * - 표 없는 붙여넣기(ClipboardPasteExtension 경로)와 같은 결과다.
 * - 설정이 없거나 url을 허용하지 않으면 url 없는 iframe 블록이다.
 */
import type { CreateEditorOptions } from "../src/index.js";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  pasteHtml,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  mountTiptapEditor,
  paragraphDocument,
  sequentialIds,
} from "./editor-controller-support.js";

const SRC = "https://www.youtube.com/embed/xyz";

const IFRAME = (src: string): string =>
  `<div data-geul-block-id="ifr-1" data-geul-media-type="iframe" data-geul-src="${src}"></div>`;

const TABLE = "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>";

const YOUTUBE: NonNullable<CreateEditorOptions["iframeEmbed"]> = {
  providers: [
    { name: "youtube", match: { type: "wildcard", pattern: "*.youtube.com" } },
  ],
};

/** html을 붙여넣은 뒤 iframe 블록을 꺼낸다. 없으면 던진다. */
const pastedIframe = (
  html: string,
  iframeEmbed: CreateEditorOptions["iframeEmbed"],
): Record<string, unknown> => {
  const editor = createEditor({
    initialDocument: paragraphDocument("seed"),
    createId: sequentialIds("id"),
    ...(iframeEmbed === undefined ? {} : { iframeEmbed }),
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

  let found: Record<string, unknown> | undefined;
  withUnhandledErrorTracking((errors) => {
    pasteHtml(editable, html);
    found = editor
      .getDocument()
      .blocks.find((block) => block.type === "iframe") as
      Record<string, unknown> | undefined;
    expect(errors).toEqual([]);
  });
  editor.destroy();
  if (found === undefined) throw new Error("iframe 블록이 붙지 않았다");
  return found;
};

describe("표가 든 html 붙여넣기의 iframeEmbed (Issue #359)", () => {
  it("호스트가 url을 허용하면 표 옆 iframe 블록에 url이 붙는다", () => {
    expect(pastedIframe(`${IFRAME(SRC)}${TABLE}`, YOUTUBE)).toMatchObject({
      type: "iframe",
      url: SRC,
    });
  });

  it("표가 있어도 표 없는 붙여넣기와 같은 url이 붙는다", () => {
    const withTable = pastedIframe(`${IFRAME(SRC)}${TABLE}`, YOUTUBE);
    const withoutTable = pastedIframe(IFRAME(SRC), YOUTUBE);

    expect(withTable.url).toBe(withoutTable.url);
  });

  it("providers 밖 url도 allowCustomUrl이면 표 옆 iframe 블록에 붙는다", () => {
    // 설정 일부(providers)만 넘기는 배선을 잡는다(IMPL-REVIEW-01 F1).
    const custom = "https://example.org/custom/x";

    expect(
      pastedIframe(`${IFRAME(custom)}${TABLE}`, { allowCustomUrl: true }),
    ).toMatchObject({ type: "iframe", url: custom });
  });

  it("iframeEmbed가 없으면 표 옆 iframe 블록에 url이 없다", () => {
    const block = pastedIframe(`${IFRAME(SRC)}${TABLE}`, undefined);

    expect(block).toMatchObject({ type: "iframe" });
    expect(block).not.toHaveProperty("url");
  });

  it("iframeEmbed가 url을 허용하지 않으면 표 옆 iframe 블록에 url이 없다", () => {
    const block = pastedIframe(
      `${IFRAME("https://evil.example.com/x")}${TABLE}`,
      YOUTUBE,
    );

    expect(block).toMatchObject({ type: "iframe" });
    expect(block).not.toHaveProperty("url");
  });
});
