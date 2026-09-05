// 4종 미디어 블록(file/image/video/audio)의 GFM 손실 카테고리 검증(Issue
// #152 슬라이스6, RD-002 DELTA-01). Image만 previewWidth/showPreview/
// textAlignment/caption/backgroundColor가 전부 없을 때 손실 0건 — 나머지
// 조합은 새 카테고리 5개(MEDIA_PREVIEW_WIDTH/MEDIA_SHOW_PREVIEW/
// MEDIA_TEXT_ALIGNMENT/MEDIA_CAPTION/BLOCK_COLOR 재사용)로 보고한다.
// Video/Audio/File은 다른 prop이 전부 비어 있어도 MEDIA_TYPE_LOST(신규,
// spec이 이름 붙이지 않은 kind — TOGGLE_STATE_LOST와 동일 논리로 이번
// DELTA가 도입, RD-002-DELTA-01.md "결정" 참고)가 항상 보고된다.
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";

describe("4종 미디어 블록 GFM 손실", () => {
  it("Image에 previewWidth/showPreview/textAlignment/caption/backgroundColor가 전혀 없으면 손실 0건, strict가 성공한다", () => {
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
  });

  it("Image의 previewWidth를 MEDIA_PREVIEW_WIDTH 손실로 보고한다", () => {
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
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "MEDIA_PREVIEW_WIDTH",
            blockId: "image-1",
            message: "Block image-1 has a preview width",
          },
        ],
      },
    });
  });

  it("Image의 showPreview:false를 MEDIA_SHOW_PREVIEW 손실로 보고한다(showPreview:true는 손실 아님)", () => {
    const hidden: Document = {
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
    expect(exportMarkdown(hidden, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "MEDIA_SHOW_PREVIEW",
            blockId: "image-1",
            message: "Block image-1 has showPreview overridden to false",
          },
        ],
      },
    });

    const shown: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "image-2",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
          showPreview: true,
        },
      ],
    };
    expect(exportMarkdown(shown, { mode: "strict" })).toEqual({
      ok: true,
      value: expect.any(String),
    });
  });

  it("Image의 textAlignment를 MEDIA_TEXT_ALIGNMENT 손실로 보고한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
          textAlignment: "center",
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "MEDIA_TEXT_ALIGNMENT",
            blockId: "image-1",
            message: "Block image-1 has text alignment",
          },
        ],
      },
    });
  });

  it("Image의 caption을 MEDIA_CAPTION 손실로 보고한다(빈 문자열도 손실 — export-html과 동일 관례)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
          caption: "",
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "MEDIA_CAPTION",
            blockId: "image-1",
            message: "Block image-1 has a caption",
          },
        ],
      },
    });
  });

  it("Image의 backgroundColor를 BLOCK_COLOR 손실로 보고한다(신규 kind 신설 없이 재사용)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "그림",
          backgroundColor: "#FFFF00",
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "BLOCK_COLOR",
            blockId: "image-1",
            message: "Block image-1 has a background color",
          },
        ],
      },
    });
  });

  it("Image에 다섯 손실이 모두 있으면 BLOCK_COLOR·MEDIA_CAPTION·MEDIA_PREVIEW_WIDTH·MEDIA_SHOW_PREVIEW·MEDIA_TEXT_ALIGNMENT 순서로 보고한다", () => {
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
          showPreview: false,
          textAlignment: "center",
          caption: "설명",
          backgroundColor: "#FFFF00",
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "BLOCK_COLOR",
            blockId: "image-1",
            message: "Block image-1 has a background color",
          },
          {
            kind: "MEDIA_CAPTION",
            blockId: "image-1",
            message: "Block image-1 has a caption",
          },
          {
            kind: "MEDIA_PREVIEW_WIDTH",
            blockId: "image-1",
            message: "Block image-1 has a preview width",
          },
          {
            kind: "MEDIA_SHOW_PREVIEW",
            blockId: "image-1",
            message: "Block image-1 has showPreview overridden to false",
          },
          {
            kind: "MEDIA_TEXT_ALIGNMENT",
            blockId: "image-1",
            message: "Block image-1 has text alignment",
          },
        ],
      },
    });
  });

  it.each(["video", "audio", "file"] as const)(
    "%s는 다른 prop이 전혀 없어도(url·name만) MEDIA_TYPE_LOST가 보고되고 strict가 거절된다",
    (type) => {
      const document: Document = {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "media-1",
            type,
            url: "https://example.com/a",
            name: "미디어",
          },
        ],
      };

      expect(exportMarkdown(document, { mode: "strict" })).toEqual({
        ok: false,
        error: {
          code: "MARKDOWN_LOSS_NOT_ALLOWED",
          losses: [
            {
              kind: "MEDIA_TYPE_LOST",
              blockId: "media-1",
              message: `Block media-1 has type "${type}"; GFM has no native syntax for it`,
            },
          ],
        },
      });
    },
  );

  it("video의 previewWidth/showPreview:false/textAlignment/caption/backgroundColor가 MEDIA_TYPE_LOST와 함께 개별 보고된다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "video-1",
          type: "video",
          url: "https://example.com/a.mp4",
          name: "영상",
          previewWidth: 480,
          showPreview: false,
          textAlignment: "right",
          caption: "설명",
          backgroundColor: "#FFFF00",
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "BLOCK_COLOR",
            blockId: "video-1",
            message: "Block video-1 has a background color",
          },
          {
            kind: "MEDIA_CAPTION",
            blockId: "video-1",
            message: "Block video-1 has a caption",
          },
          {
            kind: "MEDIA_PREVIEW_WIDTH",
            blockId: "video-1",
            message: "Block video-1 has a preview width",
          },
          {
            kind: "MEDIA_SHOW_PREVIEW",
            blockId: "video-1",
            message: "Block video-1 has showPreview overridden to false",
          },
          {
            kind: "MEDIA_TEXT_ALIGNMENT",
            blockId: "video-1",
            message: "Block video-1 has text alignment",
          },
          {
            kind: "MEDIA_TYPE_LOST",
            blockId: "video-1",
            message:
              'Block video-1 has type "video"; GFM has no native syntax for it',
          },
        ],
      },
    });
  });

  it("audio는 previewWidth/textAlignment 검사 대상이 아니다(타입 자체에 그 prop이 없음)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "audio-1",
          type: "audio",
          url: "https://example.com/a.mp3",
          name: "소리",
          showPreview: false,
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "MEDIA_SHOW_PREVIEW",
            blockId: "audio-1",
            message: "Block audio-1 has showPreview overridden to false",
          },
          {
            kind: "MEDIA_TYPE_LOST",
            blockId: "audio-1",
            message:
              'Block audio-1 has type "audio"; GFM has no native syntax for it',
          },
        ],
      },
    });
  });

  it("file은 caption·backgroundColor만 검사 대상이다(showPreview/previewWidth/textAlignment 없음)", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "file-1",
          type: "file",
          url: "https://example.com/a.pdf",
          name: "문서",
          caption: "첨부",
          backgroundColor: "#FFFF00",
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "BLOCK_COLOR",
            blockId: "file-1",
            message: "Block file-1 has a background color",
          },
          {
            kind: "MEDIA_CAPTION",
            blockId: "file-1",
            message: "Block file-1 has a caption",
          },
          {
            kind: "MEDIA_TYPE_LOST",
            blockId: "file-1",
            message:
              'Block file-1 has type "file"; GFM has no native syntax for it',
          },
        ],
      },
    });
  });
});
