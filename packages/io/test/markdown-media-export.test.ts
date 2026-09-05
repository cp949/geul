// 4종 미디어 블록의 GFM 실제 출력 검증(Issue #152 슬라이스6, RD-002
// DELTA-01). 손실 카테고리 자체는 markdown-media-loss.test.ts가 고정한다 —
// 이 파일은 blockNode가 실제로 내는 markdown 문자열 모양(image 구문 vs
// link 강등)만 다룬다.
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";

describe("4종 미디어 블록 GFM export", () => {
  it("Image는 손실이 없으면 strict/lossy 둘 다 ![name](url)을 낸다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "![그림](https://example.com/a.png)\n",
    });

    const lossy = exportMarkdown(document, { mode: "lossy" });
    expect(lossy).toEqual({
      ok: true,
      value: { markdown: "![그림](https://example.com/a.png)\n", warnings: [] },
    });
  });

  it("Image에 previewWidth/textAlignment/caption/backgroundColor만 있으면(showPreview는 false 아님) lossy가 여전히 ![name](url)을 낸다 — 폐기된 값은 출력에 남지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
          previewWidth: 480,
          textAlignment: "center",
          caption: "설명",
          backgroundColor: "#FFFF00",
        },
      ],
    };

    const lossy = exportMarkdown(document, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
    if (!lossy.ok) throw new Error("expected ok");
    expect(lossy.value.markdown).toBe("![그림](https://example.com/a.png)\n");
    expect(lossy.value.warnings.map((loss) => loss.kind)).toEqual([
      "BLOCK_COLOR",
      "MEDIA_CAPTION",
      "MEDIA_PREVIEW_WIDTH",
      "MEDIA_TEXT_ALIGNMENT",
    ]);
  });

  it("Image의 showPreview:false는 lossy에서 [name](url) 링크로 강등된다(image 구문 아님)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
          showPreview: false,
        },
      ],
    };

    const lossy = exportMarkdown(document, { mode: "lossy" });
    expect(lossy).toEqual({
      ok: true,
      value: {
        markdown: "[그림](https://example.com/a.png)\n",
        warnings: [
          {
            kind: "MEDIA_SHOW_PREVIEW",
            blockId: "image-1",
            message: "Block image-1 has showPreview overridden to false",
          },
        ],
      },
    });
  });

  it.each([
    { type: "video" as const, url: "https://example.com/a.mp4", name: "영상" },
    { type: "audio" as const, url: "https://example.com/a.mp3", name: "소리" },
    { type: "file" as const, url: "https://example.com/a.pdf", name: "문서" },
  ])("$type은 lossy에서 [name](url) 링크로 강등된다", ({ type, url, name }) => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "media-1", type, url, name }],
    };

    const lossy = exportMarkdown(document, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
    if (!lossy.ok) throw new Error("expected ok");
    expect(lossy.value.markdown).toBe(`[${name}](${url})\n`);
    expect(lossy.value.warnings.map((loss) => loss.kind)).toEqual([
      "MEDIA_TYPE_LOST",
    ]);
  });

  it("name이 없으면 링크 텍스트로 url 자체를 쓴다(mediaAnchorNode HTML 전례와 동일 — remark-stringify가 text===url을 autolink `<url>`로 축약해 낸다)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "file-1", type: "file", url: "https://example.com/a.pdf" },
      ],
    };

    const lossy = exportMarkdown(document, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
    if (!lossy.ok) throw new Error("expected ok");
    expect(lossy.value.markdown).toBe("<https://example.com/a.pdf>\n");
  });

  it("url·name 둘 다 없는 빈 블록도 크래시 없이 lossy export가 성공한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "file-1", type: "file" }],
    };

    const lossy = exportMarkdown(document, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
  });

  it("4종 혼합 문서에서 순서가 보존된다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "p-1", type: "paragraph", content: [{ text: "before" }] },
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
        },
        {
          id: "video-1",
          type: "video",
          url: "https://example.com/a.mp4",
          name: "영상",
        },
        { id: "p-2", type: "paragraph", content: [{ text: "after" }] },
      ],
    };

    const lossy = exportMarkdown(document, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
    if (!lossy.ok) throw new Error("expected ok");
    expect(lossy.value.markdown).toBe(
      "before\n\n![그림](https://example.com/a.png)\n\n" +
        "[영상](https://example.com/a.mp4)\n\nafter\n",
    );
  });
});
