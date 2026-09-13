// @vitest-environment jsdom

/**
 * SlashMenu가 MediaHandleOverlays를 자동 마운트하고, 공용 BlockSideMenu가
 * media를 hover 대상에서 제외함을 검증한다(Issue #187 RD-001 DELTA-02).
 * drag-handle.test.tsx의 "표 위에 hover해도 블록 거터를 표시하지 않는다"와
 * 같은 구조 — table 대신 media, TableHandles 대신 MediaHandleOverlays다.
 */

import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SlashMenu } from "../../src/index.js";
import { mountBlockEditor } from "../mount-editor.js";

afterEach(cleanup);

if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}

const mediaOverlaySelector = ".geul-media-handle-overlay";
const blockGutterSelector = ".geul-block-gutter";

// TrailingBlockExtension이 atom(media)으로 끝난 문서에 로드 시점 빈 문단을
// 자동 동반한다(DELTA-01, media-block-extension.test.ts와 같은 함정) —
// 명시 문단으로 닫아 둔다.
const renderMediaAndParagraph = () =>
  mountBlockEditor({
    initialBlocks: [
      { id: "image-1", type: "image", url: "https://example.com/x.png" },
      { id: "para-1", type: "paragraph", content: [] },
    ],
    children: <SlashMenu />,
  });

describe("SlashMenu의 MediaHandleOverlays 자동 마운트", () => {
  it("media 위에 hover하면 MediaHandleOverlays만 뜨고 공용 BlockSideMenu의 거터는 뜨지 않는다", () => {
    const rendered = renderMediaAndParagraph();
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");

    fireEvent.pointerMove(media);

    expect(document.querySelector(mediaOverlaySelector)).not.toBeNull();
    expect(document.querySelector(blockGutterSelector)).toBeNull();
  });

  it("paragraph 위에 hover하면 여전히 공용 BlockSideMenu의 거터가 뜬다(회귀 없음)", () => {
    const rendered = renderMediaAndParagraph();
    const [, paragraph] = rendered.blocks;
    if (paragraph === undefined) throw new Error("paragraph 요소가 없다");

    fireEvent.pointerMove(paragraph);

    expect(document.querySelector(blockGutterSelector)).not.toBeNull();
    expect(document.querySelector(mediaOverlaySelector)).toBeNull();
  });
});
