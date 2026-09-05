/**
 * 4종 미디어 블록(file/image/video/audio) 삽입·기본 명령(슬라이스2 RD-001,
 * Issue #152 슬라이스2 MED-001·MED-004~006 일부, spec §5.1)을 고정한다.
 * setMediaPreviewWidth(슬라이스5 RD-001 DELTA-01, MED-007)와
 * setMediaShowPreview(슬라이스5 RD-002 DELTA-01, MED-008)도 이 파일이
 * 소유한다 — 같은 "media 명령 공용 골격" 관심사라 별도 파일로 쪼개지 않는다.
 *
 * insertMediaBlock의 selection 계약은 divider와 다르다 — 삽입한 블록 자신을
 * NodeSelection으로 선택한다(react File Panel의 자동 오픈 판정 근거,
 * media-commands.ts 주석 참고). setMediaBlockUrl/Name/Caption/
 * BackgroundColor의 media-only 가드(blockContainer 전제 helper 재사용
 * 불가)는 editor-controller.ts의 runSetMediaBlockAttrCommand 주석 참고.
 * setMediaPreviewWidth(값 타입 number, image/video만)와 setMediaShowPreview
 * (값 타입 boolean, image/video/audio만)는 값 타입과 kind 가드가 서로도
 * 다르고 그 헬퍼와도 달라 각각 별도 함수(runSetMediaPreviewWidthCommand·
 * runSetMediaShowPreviewCommand)로 구현한다(RD-001-DELTA-01.md·
 * RD-002-DELTA-01.md "배경" 참고). 콘텐츠 렌더링(renderHTML)의 투영은
 * media-block-extension.test.ts가, react 소비는 RD-003/004·슬라이스5
 * DELTA-02가 소관이다.
 */
import { describe, expect, it } from "vitest";
import type { MediaBlockKind } from "../src/index.js";
import {
  documentOf,
  editorState,
  expectMediaBlockNodeSelection,
  firstParagraphBlock,
  mediaBlock,
  mounted,
  notApplicable,
  okResult,
  paragraphBlock,
  restored,
  secondParagraphBlock,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const mediaKinds: readonly MediaBlockKind[] = [
  "file",
  "image",
  "video",
  "audio",
];

const twoBlocks = documentOf(firstParagraphBlock, secondParagraphBlock);

/** 삽입 성공 Result 리터럴 — insertDivider 테스트와 같은 로컬 관례. */
const inserted = (blockId: string) => ({ ok: true, value: { blockId } });

describe("insertMediaBlock(삽입 전용, G-EDT-001)", () => {
  it.each(mediaKinds)(
    "%s: 대상 블록 뒤에 빈 블록을 단일 트랜잭션으로 삽입하고 id를 명시 배정하며 삽입한 블록 자신을 선택하고 undo 1회로 복원한다",
    (kind) => {
      const { editor, tiptap, changes } = mounted(twoBlocks);
      const before = editorState(editor, tiptap);
      expect(editor.commands.insertMediaBlock("block-1", kind)).toEqual(
        inserted("id-1"),
      );
      expect(editor.getDocument().blocks).toEqual([
        firstParagraphBlock,
        mediaBlock(kind, "id-1"),
        secondParagraphBlock,
      ]);
      expectMediaBlockNodeSelection(tiptap, "id-1", kind);
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["block-2", "id-1"], reason: "local" },
      ]);
      expect(editor.commands.undo()).toEqual(okResult);
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["block-2", "id-1"], reason: "local" },
        { revision: 2, changedBlockIds: ["id-1", "block-2"], reason: "undo" },
      ]);
    },
  );

  it("문서 끝 삽입은 TrailingBlockExtension이 빈 paragraph를 같은 undo 단위로 동반하고 selection은 삽입한 블록 자신에 남는다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(firstParagraphBlock),
    );
    expect(editor.commands.insertMediaBlock("block-1", "image")).toEqual(
      inserted("id-1"),
    );
    expect(editor.getDocument().blocks).toEqual([
      firstParagraphBlock,
      mediaBlock("image", "id-1"),
      paragraphBlock("id-2", ""),
    ]);
    expectMediaBlockNodeSelection(tiptap, "id-1", "image");
    expect(changes).toHaveLength(1);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([firstParagraphBlock]);
  });

  it("clearAfterBlockText가 트리거 텍스트 삭제와 삽입을 한 undo 단위로 묶는다", () => {
    const slash = paragraphBlock("block-1", "/image");
    const { editor, tiptap, changes } = mounted(
      documentOf(slash, secondParagraphBlock),
    );
    const before = editorState(editor, tiptap);
    expect(
      editor.commands.insertMediaBlock("block-1", "image", {
        clearAfterBlockText: true,
      }),
    ).toEqual(inserted("id-1"));
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("block-1", ""),
      mediaBlock("image", "id-1"),
      secondParagraphBlock,
    ]);
    expect(changes).toHaveLength(1);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("알 수 없는 afterBlockId는 BLOCK_NOT_FOUND이고 문서·selection이 무변경이다", () => {
    const { editor, tiptap, changes } = mounted(twoBlocks);
    const before = editorState(editor, tiptap);
    expect(editor.commands.insertMediaBlock("missing", "file")).toEqual({
      ok: false,
      error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
    expect(editor.commands.undo()).toEqual(notApplicable("undo"));
  });
});

describe("setMediaBlockUrl", () => {
  it("isSupportedLinkHref를 통과하는 URL을 단일 트랜잭션으로 세팅하고 undo 1회로 복원한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(
        firstParagraphBlock,
        mediaBlock("image", "m-1"),
        secondParagraphBlock,
      ),
    );
    const before = editorState(editor, tiptap);
    expect(
      editor.commands.setMediaBlockUrl("m-1", "https://example.com/a.png"),
    ).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      firstParagraphBlock,
      mediaBlock("image", "m-1", { url: "https://example.com/a.png" }),
      secondParagraphBlock,
    ]);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["m-1"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("isSupportedLinkHref 위반 URL은 LINK_HREF_REJECTED이고 문서를 바꾸지 않는다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(mediaBlock("file", "m-1")),
    );
    const before = editorState(editor, tiptap);
    expect(
      editor.commands.setMediaBlockUrl("m-1", "javascript:alert(1)"),
    ).toEqual({
      ok: false,
      error: { code: "LINK_HREF_REJECTED", href: "javascript:alert(1)" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
  });

  it("media가 아닌 블록 대상은 COMMAND_NOT_APPLICABLE이고 문서를 바꾸지 않는다", () => {
    const { editor, tiptap } = mounted(twoBlocks);
    const before = editorState(editor, tiptap);
    expect(
      editor.commands.setMediaBlockUrl("block-1", "https://example.com"),
    ).toEqual(notApplicable("setMediaBlockUrl"));
    expect(editorState(editor, tiptap)).toEqual(before);
  });
});

describe("setMediaBlockName / setMediaBlockCaption", () => {
  it("plain string을 세팅하고 각각 undo 1회로 복원한다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(mediaBlock("file", "m-1"), tailParagraphBlock),
    );
    const before = editorState(editor, tiptap);
    expect(editor.commands.setMediaBlockName("m-1", "report.pdf")).toEqual(
      okResult,
    );
    expect(editor.commands.setMediaBlockCaption("m-1", "분기 보고서")).toEqual(
      okResult,
    );
    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("file", "m-1", {
        name: "report.pdf",
        caption: "분기 보고서",
      }),
      tailParagraphBlock,
    ]);
    expect(changes).toEqual([
      { revision: 1, changedBlockIds: ["m-1"], reason: "local" },
      { revision: 2, changedBlockIds: ["m-1"], reason: "local" },
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 4));
    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("file", "m-1"),
      tailParagraphBlock,
    ]);
  });
});

describe("setMediaBlockBackgroundColor", () => {
  it("정규 형식(#RRGGBB, 대문자) 색을 세팅하고 undo 1회로 복원한다", () => {
    const { editor, tiptap } = mounted(
      documentOf(mediaBlock("audio", "m-1"), tailParagraphBlock),
    );
    const before = editorState(editor, tiptap);
    expect(
      editor.commands.setMediaBlockBackgroundColor("m-1", "#AABBCC"),
    ).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("audio", "m-1", { backgroundColor: "#AABBCC" }),
      tailParagraphBlock,
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("비정규 색상은 INVALID_COLOR로 문서를 바꾸지 않는다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(mediaBlock("video", "m-1")),
    );
    const before = editorState(editor, tiptap);
    expect(
      editor.commands.setMediaBlockBackgroundColor("m-1", "#aabbcc"),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_COLOR", color: "#aabbcc" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
  });

  it("null은 기존 배경색을 지운다", () => {
    const { editor } = mounted(
      documentOf(
        mediaBlock("video", "m-1", { backgroundColor: "#AABBCC" }),
        tailParagraphBlock,
      ),
    );
    expect(editor.commands.setMediaBlockBackgroundColor("m-1", null)).toEqual(
      okResult,
    );
    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("video", "m-1"),
      tailParagraphBlock,
    ]);
  });
});

describe("setMediaPreviewWidth", () => {
  it.each(["image", "video"] as const)(
    "%s: 양의 유한수를 단일 트랜잭션으로 세팅하고 undo 1회로 복원한다",
    (kind) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(mediaBlock(kind, "m-1"), tailParagraphBlock),
      );
      const before = editorState(editor, tiptap);
      expect(editor.commands.setMediaPreviewWidth("m-1", 320)).toEqual(
        okResult,
      );
      expect(editor.getDocument().blocks).toEqual([
        mediaBlock(kind, "m-1", { previewWidth: 320 }),
        tailParagraphBlock,
      ]);
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["m-1"], reason: "local" },
      ]);
      expect(editor.commands.undo()).toEqual(okResult);
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );

  it.each(["audio", "file"] as const)(
    "%s 대상은 MEDIA_RESIZE_NOT_SUPPORTED이고 문서를 바꾸지 않는다",
    (kind) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(mediaBlock(kind, "m-1")),
      );
      const before = editorState(editor, tiptap);
      expect(editor.commands.setMediaPreviewWidth("m-1", 320)).toEqual({
        ok: false,
        error: { code: "MEDIA_RESIZE_NOT_SUPPORTED" },
      });
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
    },
  );

  it.each([-1, 0, Number.NaN, Number.POSITIVE_INFINITY])(
    "%s는 DOCUMENT_INVALID이고 문서를 바꾸지 않는다",
    (value) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(mediaBlock("image", "m-1")),
      );
      const before = editorState(editor, tiptap);
      expect(editor.commands.setMediaPreviewWidth("m-1", value)).toMatchObject({
        ok: false,
        error: { code: "DOCUMENT_INVALID" },
      });
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
    },
  );
});

describe("setMediaShowPreview", () => {
  it.each(["image", "video", "audio"] as const)(
    "%s: boolean 값을 단일 트랜잭션으로 세팅하고 undo 1회로 복원한다",
    (kind) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(mediaBlock(kind, "m-1"), tailParagraphBlock),
      );
      const before = editorState(editor, tiptap);
      expect(editor.commands.setMediaShowPreview("m-1", false)).toEqual(
        okResult,
      );
      expect(editor.getDocument().blocks).toEqual([
        mediaBlock(kind, "m-1", { showPreview: false }),
        tailParagraphBlock,
      ]);
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["m-1"], reason: "local" },
      ]);
      expect(editor.commands.undo()).toEqual(okResult);
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );

  it("file 대상은 MEDIA_PREVIEW_TOGGLE_NOT_SUPPORTED이고 문서를 바꾸지 않는다", () => {
    const { editor, tiptap, changes } = mounted(
      documentOf(mediaBlock("file", "m-1")),
    );
    const before = editorState(editor, tiptap);
    expect(editor.commands.setMediaShowPreview("m-1", false)).toEqual({
      ok: false,
      error: { code: "MEDIA_PREVIEW_TOGGLE_NOT_SUPPORTED" },
    });
    expect(editorState(editor, tiptap)).toEqual(before);
    expect(changes).toEqual([]);
  });
});

describe("알 수 없는 blockId — setter 6개 공통", () => {
  const missingBlockCases = [
    {
      command: "setMediaBlockUrl",
      call: (editor: ReturnType<typeof mounted>["editor"]) =>
        editor.commands.setMediaBlockUrl("missing", "https://example.com"),
    },
    {
      command: "setMediaBlockName",
      call: (editor: ReturnType<typeof mounted>["editor"]) =>
        editor.commands.setMediaBlockName("missing", "name"),
    },
    {
      command: "setMediaBlockCaption",
      call: (editor: ReturnType<typeof mounted>["editor"]) =>
        editor.commands.setMediaBlockCaption("missing", "caption"),
    },
    {
      command: "setMediaBlockBackgroundColor",
      call: (editor: ReturnType<typeof mounted>["editor"]) =>
        editor.commands.setMediaBlockBackgroundColor("missing", "#AABBCC"),
    },
    {
      command: "setMediaPreviewWidth",
      call: (editor: ReturnType<typeof mounted>["editor"]) =>
        editor.commands.setMediaPreviewWidth("missing", 320),
    },
    {
      command: "setMediaShowPreview",
      call: (editor: ReturnType<typeof mounted>["editor"]) =>
        editor.commands.setMediaShowPreview("missing", false),
    },
  ] as const;

  it.each(missingBlockCases)(
    "%s는 BLOCK_NOT_FOUND이고 문서·selection이 무변경이다",
    ({ call }) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(mediaBlock("file", "m-1")),
      );
      const before = editorState(editor, tiptap);
      expect(call(editor)).toEqual({
        ok: false,
        error: { code: "BLOCK_NOT_FOUND", blockId: "missing" },
      });
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
    },
  );
});
