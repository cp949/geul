/**
 * 이미지 `alt`의 HTML import/export를 검증한다(Issue #424, RD-002-DELTA-02).
 *
 * - export: `alt`가 있으면(빈 문자열 포함) 출력 alt로 우선 쓰고 `data-geul-alt`를 싣는다.
 *   없으면 이전처럼 `caption ?? name ?? ""`이고 `data-geul-alt`를 내지 않는다.
 * - import 판독 규칙: (1) `data-geul-alt`가 있으면 그 값, (2) 없고 own-format 마커
 *   `data-geul-media-type`가 있으면 alt 없음, (3) 마커 없는 legacy `img`는 `img[alt]`가
 *   있을 때 그 값(`alt=""` 포함).
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";
import { clipboardBlocks } from "./clipboard-table-support.js";

type ImageBlock = Extract<Document["blocks"][number], { type: "image" }>;

const imageDocument = (block: Omit<ImageBlock, "id" | "type">): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [{ id: "i1", type: "image", url: "https://e.com/a.png", ...block }],
});

const exported = (document: Document): string => {
  const result = exportHtml(document);
  if (!result.ok) throw new Error(`export 실패: ${result.error.message}`);
  return result.value;
};

const imported = (html: string) => {
  const result = importHtml(html);
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
};

describe("이미지 alt export", () => {
  it('alt가 없으면 이전과 같은 출력이다(caption ?? name ?? "", data-geul-alt 없음)', () => {
    expect(exported(imageDocument({ name: "이름" }))).not.toContain(
      "data-geul-alt",
    );
    expect(exported(imageDocument({ name: "이름" }))).toContain('alt="이름"');
    expect(
      exported(imageDocument({ name: "이름", caption: "캡션" })),
    ).toContain('alt="캡션"');
    expect(exported(imageDocument({}))).toContain('alt=""');
    expect(exported(imageDocument({}))).not.toContain("data-geul-alt");
  });

  it("alt가 있으면 출력 alt로 우선 쓰고 data-geul-alt를 싣는다", () => {
    const html = exported(
      imageDocument({ alt: "대체", name: "이름", caption: "캡션" }),
    );
    expect(html).toContain('alt="대체"');
    expect(html).toContain('data-geul-alt="대체"');
    expect(html).toContain('data-geul-name="이름"');
    expect(html).toContain("<figcaption>캡션</figcaption>");
  });

  it('alt가 빈 문자열이어도 alt=""와 data-geul-alt=""를 낸다', () => {
    const html = exported(imageDocument({ alt: "", name: "이름" }));
    expect(html).toContain('alt=""');
    expect(html).toContain('data-geul-alt=""');
    expect(html).not.toContain('alt="이름"');
  });

  it("showPreview:false로 링크가 된 이미지도 data-geul-alt를 싣는다", () => {
    const html = exported(
      imageDocument({ alt: "대체", name: "이름", showPreview: false }),
    );
    expect(html).toContain("<a ");
    expect(html).toContain('data-geul-alt="대체"');
  });

  it("alt 값의 따옴표·앰퍼샌드를 속성값에서 escape한다", () => {
    const html = exported(imageDocument({ alt: 'a "b" & c' }));
    expect(html).toContain('data-geul-alt="a &#x22;b&#x22; &#x26; c"');
    expect(html).not.toContain('data-geul-alt="a "b"');
  });
});

describe("이미지 alt import — legacy HTML(마커 없음)", () => {
  it("img[alt]와 data-geul-name을 각각 alt와 name으로 읽는다", () => {
    const { document, warnings } = imported(
      '<img src="https://e.com/a.png" alt="약정 설명 이미지" data-geul-name="파일명.png">',
    );
    expect(document.blocks).toMatchObject([
      { type: "image", alt: "약정 설명 이미지", name: "파일명.png" },
    ]);
    expect(warnings).toEqual([]);
  });

  it('alt=""는 alt: ""로 읽고 export가 alt=""와 data-geul-alt=""를 낸다', () => {
    const { document } = imported('<img src="https://e.com/a.png" alt="">');
    expect(document.blocks).toMatchObject([{ type: "image", alt: "" }]);
    const html = exported(document);
    expect(html).toContain('alt=""');
    expect(html).toContain('data-geul-alt=""');
  });

  it("alt 속성이 없으면 alt 필드가 없다", () => {
    const { document } = imported('<img src="https://e.com/a.png">');
    expect(document.blocks[0]).not.toHaveProperty("alt");
  });

  it("p 안의 img와 마커 없는 figure 안의 img도 alt를 읽는다", () => {
    const { document } = imported(
      '<p><img src="https://e.com/a.png" alt="가"></p><figure><img src="https://e.com/b.png" alt="나"><figcaption>c</figcaption></figure>',
    );
    expect(document.blocks).toMatchObject([
      { type: "image", alt: "가" },
      { type: "image", alt: "나" },
      { type: "paragraph" },
    ]);
  });

  it("클립보드 표 옆 img의 alt도 읽는다", () => {
    const blocks = clipboardBlocks(
      '<img src="https://e.com/a.png" alt="설명"><table><tr><td>a</td></tr></table>',
    );
    expect(blocks).toMatchObject([
      { type: "image", alt: "설명" },
      { type: "table" },
    ]);
  });
});

describe("이미지 alt import — geul 마커가 있는 HTML", () => {
  it("data-geul-alt가 있으면 그 값을 쓴다(img[alt]와 달라도)", () => {
    const { document } = imported(
      '<img src="https://e.com/a.png" alt="출력" data-geul-block-id="i1" data-geul-media-type="image" data-geul-alt="저장">',
    );
    expect(document.blocks[0]).toMatchObject({ alt: "저장" });
  });

  it('data-geul-alt=""는 alt: ""다', () => {
    const { document } = imported(
      '<img src="https://e.com/a.png" alt="" data-geul-block-id="i1" data-geul-media-type="image" data-geul-alt="">',
    );
    expect(document.blocks[0]).toMatchObject({ alt: "" });
  });

  it("마커가 있고 data-geul-alt가 없으면 img[alt]가 있어도 alt 필드가 없다", () => {
    const { document } = imported(
      '<img src="https://e.com/a.png" alt="사진" data-geul-block-id="i1" data-geul-media-type="image" data-geul-name="사진">',
    );
    expect(document.blocks[0]).not.toHaveProperty("alt");
  });

  it("video·audio의 data-geul-alt는 읽지 않는다", () => {
    const { document } = imported(
      '<video src="https://e.com/a.mp4" controls data-geul-block-id="v1" data-geul-media-type="video" data-geul-alt="x"></video>',
    );
    expect(document.blocks[0]).not.toHaveProperty("alt");
  });
});

describe("이미지 alt 왕복", () => {
  const cases: Array<[string, Omit<ImageBlock, "id" | "type">]> = [
    ["alt만", { alt: "대체" }],
    ["alt와 다른 name", { alt: "대체", name: "이름" }],
    ["alt와 다른 name·caption", { alt: "대체", name: "이름", caption: "캡션" }],
    ["빈 alt와 name·caption", { alt: "", name: "이름", caption: "캡션" }],
    [
      "alt와 showPreview:false",
      { alt: "대체", name: "이름", showPreview: false },
    ],
    [
      "alt와 previewWidth·textAlignment",
      { alt: "대체", previewWidth: 320.5, textAlignment: "center" },
    ],
    ["특수문자 alt", { alt: "a \"b\" & <c> 'd'" }],
    ["alt 없음, name·caption만", { name: "이름", caption: "캡션" }],
    ["alt 없음, 아무것도 없음", {}],
  ];

  it.each(cases)(
    "%s: export → import → export가 같은 문서·같은 출력이다",
    (_name, block) => {
      const original = imageDocument(block);
      const html = exported(original);
      const { document, warnings } = imported(html);
      expect(document).toEqual(original);
      expect(warnings).toEqual([]);
      expect(exported(document)).toBe(html);
    },
  );

  it("alt 필드가 없는 자체 export를 다시 읽어도 alt가 생기지 않는다(출력 alt가 caption·name과 같아도)", () => {
    for (const block of [{ name: "이름" }, { caption: "캡션" }, {}]) {
      const { document } = imported(exported(imageDocument(block)));
      expect(document.blocks[0]).not.toHaveProperty("alt");
    }
  });
});
