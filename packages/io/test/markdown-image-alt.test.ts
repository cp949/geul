// 이미지 alt의 GFM 매핑과 손실 보고(Issue #424, RD-002-DELTA-02). md 이미지 `![alt](url)`는
// alt 하나만 가진다. export는 `alt ?? name ?? url`을 쓰고 import는 기존대로 name으로 읽는다.
// alt가 있고 name과 다르면 재가져오기에서 alt와 name의 구분이 사라지므로 IMAGE_ALT로 보고한다.
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

const imageDocument = (fields: {
  alt?: string;
  name?: string;
  url?: string;
  showPreview?: boolean;
}): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "i1",
      type: "image",
      url: "https://e.com/a.png",
      ...fields,
    },
  ],
});

describe("이미지 alt GFM export", () => {
  it("alt가 있으면 alt를 md 이미지 텍스트로 쓴다", () => {
    expect(
      exportMarkdown(imageDocument({ alt: "대체" }), { mode: "lossy" }),
    ).toMatchObject({
      ok: true,
      value: { markdown: "![대체](https://e.com/a.png)\n" },
    });
  });

  it("alt가 없으면 name, 둘 다 없으면 이전처럼 url을 쓴다", () => {
    expect(
      exportMarkdown(imageDocument({ name: "이름" }), { mode: "strict" }),
    ).toEqual({ ok: true, value: "![이름](https://e.com/a.png)\n" });
    expect(exportMarkdown(imageDocument({}), { mode: "strict" })).toEqual({
      ok: true,
      value: "![https://e.com/a.png](https://e.com/a.png)\n",
    });
  });

  it("alt가 name과 다르면 strict는 IMAGE_ALT로 거절한다", () => {
    expect(
      exportMarkdown(imageDocument({ alt: "대체", name: "이름" }), {
        mode: "strict",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "IMAGE_ALT",
            blockId: "i1",
            message:
              "Block i1 has an alt text different from its name; GFM images carry a single alt text",
          },
        ],
      },
    });
  });

  it("alt가 name과 다르면 lossy는 alt를 쓰고 IMAGE_ALT를 보고한다", () => {
    expect(
      exportMarkdown(imageDocument({ alt: "대체", name: "이름" }), {
        mode: "lossy",
      }),
    ).toEqual({
      ok: true,
      value: {
        markdown: "![대체](https://e.com/a.png)\n",
        warnings: [
          {
            kind: "IMAGE_ALT",
            blockId: "i1",
            message:
              "Block i1 has an alt text different from its name; GFM images carry a single alt text",
          },
        ],
      },
    });
  });

  it("alt가 name과 같으면 손실이 아니고 name으로 왕복한다", () => {
    const result = exportMarkdown(
      imageDocument({ alt: "같음", name: "같음" }),
      {
        mode: "strict",
      },
    );
    expect(result).toEqual({
      ok: true,
      value: "![같음](https://e.com/a.png)\n",
    });
  });

  it("alt가 빈 문자열이고 name이 없으면 손실이 아니다", () => {
    const result = exportMarkdown(imageDocument({ alt: "" }), {
      mode: "strict",
    });
    expect(result.ok).toBe(true);
  });

  it("alt가 빈 문자열이고 name이 있으면 IMAGE_ALT다", () => {
    const result = exportMarkdown(imageDocument({ alt: "", name: "이름" }), {
      mode: "strict",
    });
    expect(result.ok).toBe(false);
  });

  it("showPreview:false 링크 강등에서도 alt≠name이면 IMAGE_ALT를 보고한다", () => {
    const document = imageDocument({
      alt: "대체",
      name: "이름",
      showPreview: false,
    });
    const result = exportMarkdown(document, { mode: "lossy" });
    expect(result.ok).toBe(true);
    if (!result.ok || typeof result.value === "string") return;
    expect(result.value.warnings.map((warning) => warning.kind)).toContain(
      "IMAGE_ALT",
    );
  });
});

describe("이미지 alt GFM import", () => {
  it("md 이미지 텍스트는 이전처럼 name으로 읽고 alt 필드를 만들지 않는다", () => {
    const result = importMarkdown("![텍스트](https://e.com/a.png)");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toMatchObject([
      { type: "image", name: "텍스트" },
    ]);
    expect(result.value.document.blocks[0]).not.toHaveProperty("alt");
  });
});
