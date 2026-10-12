/**
 * 로컬 프리뷰(ADR-0015) attrs의 판정·스캔을 소유하는 leaf
 * (media-local-preview.ts)를 고정한다(Issue #389).
 *
 * 판정은 둘이다. hasLocalPreview는 미디어 타입과 localPreviewUrl 문자열만
 * 본다. readLocalPreview는 거기에 blockId가 비어 있지 않을 것을 더해
 * {blockId, attrs} 또는 null을 돌려준다. listLocalPreviews는 서브트리를 doc
 * 순서로 스캔해 노드마다 한 항목을 낸다. indexLocalPreviewsByUrl은 그
 * 결과에서 URL 키 맵을 파생한다.
 *
 * 동작을 바꾸지 않는 리팩터의 특성화 테스트라 처음부터 GREEN이다. 통지·undo
 * 상호작용은 createEditor 경유 테스트(media-local-preview-cleanup 등)가
 * 증명하고, 여기서는 규칙만 단위로 본다(ADR-0007).
 * PM Node는 마운트한 편집기의 state.doc에서 얻는다. blockId가 빈 노드는
 * BlockIdExtension이 고치지 않는 비포장 미디어라 스키마로 직접 만든다.
 */
import type { Block } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { afterEach, describe, expect, it } from "vitest";
import { findBlockPosition } from "../src/block-position.js";
import {
  hasLocalPreview,
  indexLocalPreviewsByUrl,
  listLocalPreviews,
  readLocalPreview,
  type LocalPreviewEntry,
} from "../src/media-local-preview.js";
import {
  documentOf,
  localPreviewUrlOf,
  mediaBlock,
  mountedWithLocalPreviewCleanup,
  quoteBlock,
  requireNode,
  seedLocalPreview,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const testFile = () => new File(["binary"], "a.png", { type: "image/png" });

/** seed한 blob URL. 편집기는 support의 afterEach가 정리하고 URL은 여기서 해제한다. */
const seededUrls: string[] = [];

afterEach(() => {
  for (const url of seededUrls.splice(0)) URL.revokeObjectURL(url);
});

/** blockId 블록에 로컬 프리뷰를 채우고 그 노드를 돌려준다. */
const seeded = (tiptap: TiptapEditor, blockId: string, file = testFile()) => {
  seedLocalPreview(tiptap, blockId, file);
  const url = localPreviewUrlOf(tiptap, blockId);
  if (url !== null) seededUrls.push(url);
  return nodeOf(tiptap, blockId);
};

/** blockId 블록의 현재 PM 노드를 돌려준다. */
const nodeOf = (tiptap: TiptapEditor, blockId: string): ProseMirrorNode => {
  const position = findBlockPosition(tiptap.state.doc, blockId);
  const node = position === null ? null : tiptap.state.doc.nodeAt(position);
  if (node === null) throw new Error(`블록 ${blockId} 조회 실패`);
  return node;
};

/** 문서를 마운트하고 Tiptap 편집기를 돌려준다. */
const tiptapOf = (...blocks: Block[]): TiptapEditor =>
  mountedWithLocalPreviewCleanup(documentOf(...blocks, tailParagraphBlock))
    .tiptap;

/** 검증 없이 노드를 직접 만든다 — 편집기 transaction의 보정을 거치지 않는다. */
const createImage = (
  tiptap: TiptapEditor,
  attrs: Record<string, unknown>,
): ProseMirrorNode => requireNode(tiptap.schema, "image").create(attrs);

describe("hasLocalPreview", () => {
  describe.each(["file", "image", "video", "audio", "iframe"] as const)(
    "%s 노드",
    (kind) => {
      it("localPreviewUrl이 문자열이면 참이다", () => {
        const tiptap = tiptapOf(mediaBlock(kind, "m-1"));

        expect(hasLocalPreview(seeded(tiptap, "m-1"))).toBe(true);
      });

      it("localPreviewUrl이 null이면 거짓이다", () => {
        const tiptap = tiptapOf(mediaBlock(kind, "m-1"));

        expect(hasLocalPreview(nodeOf(tiptap, "m-1"))).toBe(false);
      });
    },
  );

  it("미디어가 아닌 타입은 localPreviewUrl 문자열이 있어도 거짓이다", () => {
    // 스키마는 문단에 localPreviewUrl을 허용하지 않아 타입 판정만 검증하려고
    // 노드 모양의 객체를 쓴다. 판정은 type과 attrs만 읽는다.
    const paragraphLike = {
      type: { name: "paragraph" },
      attrs: { blockId: "p-1", localPreviewUrl: "blob:p-1" },
    };

    expect(hasLocalPreview(paragraphLike)).toBe(false);
  });

  it("localPreviewUrl이 문자열이 아니면 거짓이다", () => {
    const tiptap = tiptapOf();
    const node = createImage(tiptap, {
      blockId: "m-1",
      localPreviewUrl: 42,
      localPreviewFile: testFile(),
    });

    expect(hasLocalPreview(node)).toBe(false);
  });

  it("blockId가 비어 있어도 판정에 영향이 없다", () => {
    const tiptap = tiptapOf();
    const node = createImage(tiptap, {
      blockId: "",
      localPreviewUrl: "blob:empty-id",
      localPreviewFile: testFile(),
    });

    expect(hasLocalPreview(node)).toBe(true);
  });
});

describe("readLocalPreview", () => {
  it("프리뷰가 있고 blockId가 비어 있지 않으면 blockId와 attrs를 돌려준다", () => {
    const tiptap = tiptapOf(mediaBlock("image", "m-1"));
    const file = testFile();
    const node = seeded(tiptap, "m-1", file);

    expect(readLocalPreview(node)).toEqual({
      blockId: "m-1",
      attrs: {
        localPreviewUrl: node.attrs.localPreviewUrl,
        localPreviewFile: file,
      },
    });
  });

  it("blockId가 빈 문자열이면 null이다", () => {
    const tiptap = tiptapOf();
    const node = createImage(tiptap, {
      blockId: "",
      localPreviewUrl: "blob:empty-id",
      localPreviewFile: testFile(),
    });

    expect(readLocalPreview(node)).toBeNull();
  });

  it("blockId가 null이면 null이다", () => {
    const tiptap = tiptapOf();
    const node = createImage(tiptap, {
      blockId: null,
      localPreviewUrl: "blob:null-id",
      localPreviewFile: testFile(),
    });

    expect(readLocalPreview(node)).toBeNull();
  });

  it("프리뷰가 없으면 null이다", () => {
    const tiptap = tiptapOf(mediaBlock("image", "m-1"));

    expect(readLocalPreview(nodeOf(tiptap, "m-1"))).toBeNull();
  });
});

describe("listLocalPreviews", () => {
  it("프리뷰가 없으면 빈 배열이다", () => {
    const tiptap = tiptapOf(mediaBlock("image", "m-1"));

    expect(listLocalPreviews(tiptap.state.doc)).toEqual([]);
  });

  it("중첩 블록까지 doc 순서로 노드마다 한 항목을 돌려준다", () => {
    const tiptap = tiptapOf(
      mediaBlock("image", "m-1"),
      quoteBlock("q-1", "인용", [
        mediaBlock("video", "m-2"),
        mediaBlock("audio", "m-3"),
        mediaBlock("file", "m-4"),
      ]),
      mediaBlock("iframe", "m-5"),
    );
    for (const id of ["m-5", "m-4", "m-2", "m-1"]) seeded(tiptap, id);

    const ids = listLocalPreviews(tiptap.state.doc).map(
      (entry) => entry.blockId,
    );

    expect(ids).toEqual(["m-1", "m-2", "m-4", "m-5"]);
  });

  it("항목의 attrs는 노드의 URL과 File이다", () => {
    const tiptap = tiptapOf(mediaBlock("image", "m-1"));
    const file = testFile();
    const node = seeded(tiptap, "m-1", file);

    expect(listLocalPreviews(tiptap.state.doc)).toEqual([
      {
        blockId: "m-1",
        attrs: {
          localPreviewUrl: node.attrs.localPreviewUrl,
          localPreviewFile: file,
        },
      },
    ]);
  });

  it("root 노드 자신이 프리뷰를 가지면 root를 먼저 포함한다", () => {
    const tiptap = tiptapOf(mediaBlock("image", "m-1"));
    const root = seeded(tiptap, "m-1");

    expect(listLocalPreviews(root).map((entry) => entry.blockId)).toEqual([
      "m-1",
    ]);
  });

  it("root 아래 서브트리만 스캔한다", () => {
    const tiptap = tiptapOf(
      mediaBlock("image", "m-1"),
      quoteBlock("q-1", "인용", [mediaBlock("video", "m-2")]),
    );
    seeded(tiptap, "m-1");
    seeded(tiptap, "m-2");

    const ids = listLocalPreviews(nodeOf(tiptap, "q-1")).map(
      (entry) => entry.blockId,
    );

    expect(ids).toEqual(["m-2"]);
  });

  it("blockId가 비어 있는 노드는 건너뛴다", () => {
    const tiptap = tiptapOf(mediaBlock("image", "m-1"));
    const kept = seeded(tiptap, "m-1");
    const skipped = createImage(tiptap, {
      blockId: "",
      localPreviewUrl: "blob:empty-id",
      localPreviewFile: testFile(),
    });
    const root = tiptap.schema.topNodeType.create(null, [skipped, kept]);

    expect(listLocalPreviews(root).map((entry) => entry.blockId)).toEqual([
      "m-1",
    ]);
  });

  it("blockId가 같은 노드가 둘이면 URL이 다른 두 항목을 모두 돌려준다", () => {
    // blockId 키 Map이던 옛 스캔은 마지막 하나만 남겼다. 편집기는 중복 id 삽입을
    // 되돌려 이 입력이 실제로는 생기지 않지만, 스캔 규칙은 노드마다 한 항목이다.
    const tiptap = tiptapOf();
    const first = createImage(tiptap, {
      blockId: "dup",
      localPreviewUrl: "blob:first",
      localPreviewFile: testFile(),
    });
    const second = createImage(tiptap, {
      blockId: "dup",
      localPreviewUrl: "blob:second",
      localPreviewFile: testFile(),
    });
    const root = tiptap.schema.topNodeType.create(null, [first, second]);

    expect(
      listLocalPreviews(root).map((entry) => entry.attrs.localPreviewUrl),
    ).toEqual(["blob:first", "blob:second"]);
  });
});

describe("indexLocalPreviewsByUrl", () => {
  const entry = (blockId: string, url: string): LocalPreviewEntry => ({
    blockId,
    attrs: { localPreviewUrl: url, localPreviewFile: testFile() },
  });

  it("항목이 없으면 빈 맵이다", () => {
    expect(indexLocalPreviewsByUrl([]).size).toBe(0);
  });

  it("URL을 키로 항목을 모은다", () => {
    const first = entry("m-1", "blob:1");
    const second = entry("m-2", "blob:2");

    const byUrl = indexLocalPreviewsByUrl([first, second]);

    expect([...byUrl]).toEqual([
      ["blob:1", first],
      ["blob:2", second],
    ]);
  });

  it("같은 URL이 여럿이면 먼저 만난 항목을 유지한다", () => {
    const first = entry("m-1", "blob:same");
    const later = entry("m-2", "blob:same");

    const byUrl = indexLocalPreviewsByUrl([first, later]);

    expect(byUrl.size).toBe(1);
    expect(byUrl.get("blob:same")).toBe(first);
  });
});
