/**
 * 4종 미디어 블록(file/image/video/audio) 삽입·기본 명령(슬라이스2 RD-001,
 * Issue #152 슬라이스2 MED-001·MED-004~006 일부, spec §5.1)을 고정한다.
 * setMediaPreviewWidth(슬라이스5 RD-001 DELTA-01, MED-007)와
 * setMediaShowPreview(슬라이스5 RD-002 DELTA-01, MED-008)도 이 파일이
 * 소유한다 — 같은 "media 명령 공용 골격" 관심사라 별도 파일로 쪼개지 않는다.
 * setMediaTextAlignment(Issue #154, MED-009)도 같은 이유로 여기에 둔다.
 *
 * insertMediaBlock의 selection 계약은 divider와 다르다 — 삽입한 블록 자신을
 * NodeSelection으로 선택한다(react File Panel의 자동 오픈 판정 근거,
 * media-commands.ts 주석 참고). setMediaBlockUrl/Name/Caption/
 * BackgroundColor의 media-only 가드(blockContainer 전제 helper 재사용
 * 불가)는 editor-controller.ts의 runSetMediaBlockAttrCommand 주석 참고.
 * setMediaPreviewWidth(값 타입 number, image/video만)·setMediaShowPreview
 * (값 타입 boolean, image/video/audio만)·setMediaTextAlignment(값 타입
 * string|null, image/video만)는 값 타입과 kind 가드가 서로도 다르고 그
 * 헬퍼와도 달라 각각 별도 함수(runSetMediaPreviewWidthCommand·
 * runSetMediaShowPreviewCommand·runSetMediaTextAlignmentCommand)로
 * 구현한다(RD-001-DELTA-01.md·RD-002-DELTA-01.md "배경", Issue #154 계획
 * "적용 계약과 가이드" 참고). 콘텐츠 렌더링(renderHTML)의 투영은
 * media-block-extension.test.ts가, react 소비는 RD-003/004·슬라이스5
 * DELTA-02가 소관이다.
 */
import type { Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { findBlockPosition } from "../src/block-position.js";
import { createEditor, type MediaBlockKind } from "../src/index.js";
import { createLocalPreviewAttrs } from "../src/media-local-preview.js";
import {
  childParagraphBlock,
  documentOf,
  editorState,
  expectMediaBlockNodeSelection,
  firstParagraphBlock,
  mediaBlock,
  mounted,
  mountTiptapEditor,
  notApplicable,
  okResult,
  paragraphBlock,
  restored,
  secondParagraphBlock,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const mediaKinds: readonly MediaBlockKind[] = [
  "file",
  "image",
  "video",
  "audio",
];

const twoBlocks = documentOf(firstParagraphBlock, secondParagraphBlock);

/**
 * `mounted()`와 같은 모양이되 `onLocalPreviewCleanup`을 추가로 배선한다
 * (editor-controller-media-upload.test.ts::mountedWithUpload과 동일
 * "로컬 override" 전례) — setMediaBlockUrl이 로컬 프리뷰를 정리하며 신호를
 * 발생시키는지 검증할 때만 쓴다(Issue #168 roadmap RD-001 DELTA-05).
 */
const mountedWithLocalPreviewCleanup = (initialDocument: Document) => {
  const changes: {
    revision: number;
    changedBlockIds: readonly string[];
    reason: string;
  }[] = [];
  const localPreviewCleared: {
    blockId: string;
    localPreviewUrl: string;
    localPreviewFile: File;
  }[] = [];
  const editor = createEditor({
    initialDocument,
    createId: sequentialIds("id"),
    onChange: (event) => changes.push(event),
    onLocalPreviewCleanup: (blockId, cleared) =>
      localPreviewCleared.push({ blockId, ...cleared }),
  });
  return {
    editor,
    changes,
    localPreviewCleared,
    ...mountTiptapEditor(editor),
  };
};

/**
 * blockId 노드에 로컬 프리뷰(ADR 0015) attrs를 직접 채운다 —
 * editor-controller-media-upload.test.ts::seedLocalPreview와 동일 근거
 * (공개 명령 표면에는 "url도 있고 로컬 프리뷰도 있는 블록"을 만드는
 * 경로가 없다).
 */
const seedLocalPreview = (
  tiptap: TiptapEditor,
  blockId: string,
  file: File,
): void => {
  const position = findBlockPosition(tiptap.state.doc, blockId);
  const node = position === null ? null : tiptap.state.doc.nodeAt(position);
  if (position === null || node === null) {
    throw new Error(`블록 ${blockId} 조회 실패`);
  }
  const transaction = tiptap.state.tr.setNodeMarkup(position, undefined, {
    ...node.attrs,
    ...createLocalPreviewAttrs(file),
  });
  tiptap.view.dispatch(transaction);
};

const testFile = (name = "stale.png") =>
  new File(["binary"], name, { type: "image/png" });

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

  it("clearAfterBlockText가 트리거 컨테이너를 미디어 블록으로 치환하고 한 undo 단위로 묶는다(2026-09-12 버그 리포트 — 트리거 줄이 빈 문단으로 안 남는다)", () => {
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
    // block-1은 완전히 사라지고 미디어 블록이 그 자리를 대신한다.
    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("image", "id-1"),
      secondParagraphBlock,
    ]);
    expectMediaBlockNodeSelection(tiptap, "id-1", "image");
    expect(changes).toHaveLength(1);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("트리거 블록에 중첩 자식이 있으면 컨테이너를 보존하고 텍스트만 지운다(하위 트리 보존 우선)", () => {
    const nestedSlash = documentOf(
      paragraphBlock("block-1", "/image", [childParagraphBlock]),
    );
    const { editor, tiptap } = mounted(nestedSlash);
    // block-1이 자식을 가져 로드 시 trailing paragraph(id-1)가 붙는다 —
    // divider 전례(editor-controller-divider.test.ts)와 동일.
    const loaded = editor.getDocument().blocks;
    expect(
      editor.commands.insertMediaBlock("block-1", "image", {
        clearAfterBlockText: true,
      }),
    ).toEqual(inserted("id-2"));
    expect(editor.getDocument().blocks).toEqual([
      paragraphBlock("block-1", "", [childParagraphBlock]),
      mediaBlock("image", "id-2"),
      loaded[1],
    ]);
    expectMediaBlockNodeSelection(tiptap, "id-2", "image");
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
  it("isSupportedMediaUrl을 통과하는 URL을 단일 트랜잭션으로 세팅하고 undo 1회로 복원한다", () => {
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

  it("isSupportedMediaUrl 위반 URL은 LINK_HREF_REJECTED이고 문서를 바꾸지 않는다", () => {
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

  // spec §3.2 2026-09-11 개정(ADR-0017) — media url은 isSupportedMediaUrl
  // 전용이라 data:/blob:도 성공으로 세팅된다. link mark href는 그대로
  // 거부한다(document-link-policy.test.ts가 고정).
  it.each([
    "data:image/png;base64,QUJD",
    "blob:https://example.com/9f1c9f4e-0000-0000-0000-000000000000",
  ])("%s도 isSupportedMediaUrl을 통과해 세팅된다", (url) => {
    const { editor, tiptap } = mounted(
      documentOf(mediaBlock("image", "m-1"), tailParagraphBlock),
    );
    const before = editorState(editor, tiptap);
    expect(editor.commands.setMediaBlockUrl("m-1", url)).toEqual(okResult);
    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("image", "m-1", { url }),
      tailParagraphBlock,
    ]);
    expect(editor.commands.undo()).toEqual(okResult);
    expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
  });

  it("media가 아닌 블록 대상은 COMMAND_NOT_APPLICABLE이고 문서를 바꾸지 않는다", () => {
    const { editor, tiptap } = mounted(twoBlocks);
    const before = editorState(editor, tiptap);
    expect(
      editor.commands.setMediaBlockUrl("block-1", "https://example.com"),
    ).toEqual(notApplicable("setMediaBlockUrl"));
    expect(editorState(editor, tiptap)).toEqual(before);
  });

  // Issue #168 roadmap RD-001 DELTA-05 — url 확정 시 로컬 프리뷰(ADR 0015)
  // 정리. runSetMediaBlockAttrCommand(공유 본체)가 localPreviewUrl 전환
  // (문자열→null)을 감지해 신호를 발생시킨다 — command 문자열이 아니라
  // attrs 상태로 판정하므로 아래 "다른 setter는 영향 없음" 테스트가 그
  // 판정 방식 자체를 고정한다.
  it("대상에 로컬 프리뷰가 있었으면 성공 시 attrs를 null로 정리하고 onLocalPreviewCleanup을 정리 전 값 그대로 1회 호출한다", () => {
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(documentOf(mediaBlock("image", "m-1")));
    const staleFile = testFile();
    seedLocalPreview(tiptap, "m-1", staleFile);

    expect(
      editor.commands.setMediaBlockUrl("m-1", "https://example.com/a.png"),
    ).toEqual(okResult);

    const position = findBlockPosition(tiptap.state.doc, "m-1");
    const node = position === null ? null : tiptap.state.doc.nodeAt(position);
    expect(node?.attrs.localPreviewUrl).toBeNull();
    expect(node?.attrs.localPreviewFile).toBeNull();
    expect(localPreviewCleared).toEqual([
      {
        blockId: "m-1",
        localPreviewUrl: expect.stringContaining("blob:"),
        localPreviewFile: staleFile,
      },
    ]);
  });

  it("대상에 로컬 프리뷰가 없었으면 성공해도 onLocalPreviewCleanup을 호출하지 않는다", () => {
    const { editor, localPreviewCleared } = mountedWithLocalPreviewCleanup(
      documentOf(mediaBlock("image", "m-1")),
    );

    expect(
      editor.commands.setMediaBlockUrl("m-1", "https://example.com/a.png"),
    ).toEqual(okResult);

    expect(localPreviewCleared).toEqual([]);
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

  // Issue #168 roadmap RD-001 DELTA-05 — setMediaBlockUrl과 같은 공유 본체
  // (runSetMediaBlockAttrCommand)를 쓰지만 이 두 setter는 url을 세팅하지
  // 않으므로 localPreviewUrl 전환(문자열→null) 자체가 일어나지 않는다.
  // 공유 본체에 넣은 전환 감지가 이 두 setter를 오염시키지 않음을 고정한다.
  it("로컬 프리뷰가 있어도 name/caption 세팅은 이를 건드리지 않고 onLocalPreviewCleanup을 호출하지 않는다", () => {
    const { editor, tiptap, localPreviewCleared } =
      mountedWithLocalPreviewCleanup(documentOf(mediaBlock("file", "m-1")));
    seedLocalPreview(tiptap, "m-1", testFile());

    expect(editor.commands.setMediaBlockName("m-1", "report.pdf")).toEqual(
      okResult,
    );
    expect(editor.commands.setMediaBlockCaption("m-1", "분기 보고서")).toEqual(
      okResult,
    );

    const position = findBlockPosition(tiptap.state.doc, "m-1");
    const node = position === null ? null : tiptap.state.doc.nodeAt(position);
    expect(typeof node?.attrs.localPreviewUrl).toBe("string");
    expect(localPreviewCleared).toEqual([]);
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

describe("setMediaTextAlignment(Issue #154, MED-009)", () => {
  it.each(["image", "video"] as const)(
    "%s: left/center/right 값을 단일 트랜잭션으로 세팅하고 undo 1회로 복원한다",
    (kind) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(mediaBlock(kind, "m-1"), tailParagraphBlock),
      );
      const before = editorState(editor, tiptap);
      expect(editor.commands.setMediaTextAlignment("m-1", "center")).toEqual(
        okResult,
      );
      expect(editor.getDocument().blocks).toEqual([
        mediaBlock(kind, "m-1", { textAlignment: "center" }),
        tailParagraphBlock,
      ]);
      expect(changes).toEqual([
        { revision: 1, changedBlockIds: ["m-1"], reason: "local" },
      ]);
      expect(editor.commands.undo()).toEqual(okResult);
      expect(editorState(editor, tiptap)).toEqual(restored(before, 2));
    },
  );

  it("null은 기존 정렬 값을 지운다", () => {
    const { editor } = mounted(
      documentOf(
        mediaBlock("image", "m-1", { textAlignment: "left" }),
        tailParagraphBlock,
      ),
    );
    expect(editor.commands.setMediaTextAlignment("m-1", null)).toEqual(
      okResult,
    );
    expect(editor.getDocument().blocks).toEqual([
      mediaBlock("image", "m-1"),
      tailParagraphBlock,
    ]);
  });

  it.each(["audio", "file"] as const)(
    "%s 대상은 MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED이고 문서를 바꾸지 않는다",
    (kind) => {
      const { editor, tiptap, changes } = mounted(
        documentOf(mediaBlock(kind, "m-1")),
      );
      const before = editorState(editor, tiptap);
      expect(editor.commands.setMediaTextAlignment("m-1", "left")).toEqual({
        ok: false,
        error: { code: "MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED" },
      });
      expect(editorState(editor, tiptap)).toEqual(before);
      expect(changes).toEqual([]);
    },
  );
});

describe("알 수 없는 blockId — setter 7개 공통", () => {
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
    {
      command: "setMediaTextAlignment",
      call: (editor: ReturnType<typeof mounted>["editor"]) =>
        editor.commands.setMediaTextAlignment("missing", "left"),
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
