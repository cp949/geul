/**
 * `parseClipboardTable`이 model 검증을 통과하는 표 옆 블록만 내는지 검증한다(Issue #356 RD-005 결정 Q1).
 *
 * - importHtml은 끝의 `parseDocument`가 무효 값을 문서 전체 거절로 막는다. 클립보드는 이 거절을 따르지 않는다.
 * - 선택 필드(색·정렬·미디어 표시 속성 등)가 무효면 그 필드만 뺀다.
 * - 미디어 url처럼 뺄 수 없는 필드가 무효면 그 블록만 뺀다. 표와 나머지 블록은 그대로다.
 * - 이 거름이 없으면 core가 시퀀스 전체를 `CLIPBOARD_CONTENT_INVALID`로 거절해 아무것도 붙지 않는다.
 *   Word 복사(`file:///…/clip_image002.png`)와 Outlook 복사(`cid:`)가 대표 입력이다.
 */
import { parseDocument } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { clipboardBlocks } from "./clipboard-table-support.js";

const TABLE =
  "<table><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>";

/** 표 variant 자리를 비교하는 matcher다. 표 내용은 표 처리기 테스트가 고정한다. */
const TABLE_SLOT = {
  type: "table",
  data: expect.objectContaining({ columnCount: 2 }),
};

/** model이 거절하는 미디어 url이다. */
const INVALID_URLS = [
  [
    "Word 임시 파일",
    "file:///C:/Users/u/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png",
  ],
  ["Outlook cid", "cid:image001.png@01DA0000.00000000"],
  ["공백 든 url", "https://e.com/a b.png"],
  ["javascript url", "javascript:alert(1)"],
] as const;

/** 미디어 태그 모양이다. */
const MEDIA_FORMS = [
  ["단독 img", (url: string) => `<img src="${url}">`],
  ["p 안 img", (url: string) => `<p><img src="${url}"></p>`],
  ["video", (url: string) => `<video src="${url}"></video>`],
  ["audio", (url: string) => `<audio src="${url}"></audio>`],
] as const;

const MEDIA_CASES = MEDIA_FORMS.flatMap(([form, build]) =>
  INVALID_URLS.map(
    ([label, url]) => [`${form}, ${label}`, build(url)] as const,
  ),
);

describe("무효 미디어 url 블록만 빠진다 (Issue #356 Q1)", () => {
  it.each(MEDIA_CASES)(
    "%s: 표는 그대로 나오고 미디어 블록만 빠진다",
    (_name, media) => {
      expect(clipboardBlocks(`<p>a</p>${media}${TABLE}`)).toEqual([
        { type: "paragraph", content: [{ text: "a" }] },
        TABLE_SLOT,
      ]);
    },
  );

  it("Word 복사 모양에서 표와 문단이 남고 임시 파일 이미지만 빠진다", () => {
    const html =
      '<p class=MsoNormal><![if !vml]><img src="file:///C:/Users/u/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png"><![endif]></p>' +
      `${TABLE}<p class=MsoNormal>after</p>`;

    expect(clipboardBlocks(html)).toEqual([
      TABLE_SLOT,
      { type: "paragraph", content: [{ text: "after" }] },
    ]);
  });

  it("figure 안 무효 img는 빠지고 figcaption 글자는 남는다", () => {
    expect(
      clipboardBlocks(
        `<figure><img src="cid:a"><figcaption>cap</figcaption></figure>${TABLE}`,
      ),
    ).toEqual([{ type: "paragraph", content: [{ text: "cap" }] }, TABLE_SLOT]);
  });

  it("표 옆 블록이 모두 빠져도 표만 나온다", () => {
    expect(
      clipboardBlocks(
        `<img src="cid:a">${TABLE}<video src="file:///x.mp4"></video>`,
      ),
    ).toEqual([TABLE_SLOT]);
  });

  it("목록 항목 자식 미디어가 빠져도 항목은 남는다", () => {
    expect(
      clipboardBlocks(`<ul><li>t<img src="cid:a"></li></ul>${TABLE}`),
    ).toEqual([
      { type: "bulletListItem", content: [{ text: "t" }] },
      TABLE_SLOT,
    ]);
  });
});

describe("무효 선택 필드만 빠진다 (Issue #356 Q1)", () => {
  it("data-geul-text-color가 정규형이 아니면 문단은 남고 색만 없다", () => {
    expect(
      clipboardBlocks(`<p data-geul-text-color="red">a</p>${TABLE}`),
    ).toEqual([{ type: "paragraph", content: [{ text: "a" }] }, TABLE_SLOT]);
  });

  it("무효 정렬만 빠지고 유효한 색은 남는다", () => {
    expect(
      clipboardBlocks(
        `<p data-geul-text-color="#FF0000" data-geul-text-alignment="middle">a</p>${TABLE}`,
      ),
    ).toEqual([
      { type: "paragraph", content: [{ text: "a" }], textColor: "#FF0000" },
      TABLE_SLOT,
    ]);
  });

  it("미디어의 무효 배경색만 빠지고 이미지는 남는다", () => {
    expect(
      clipboardBlocks(
        `<figure data-geul-media-type="image" data-geul-background-color="blue"><img src="https://e.com/a.png"></figure>${TABLE}`,
      ),
    ).toEqual([{ type: "image", url: "https://e.com/a.png" }, TABLE_SLOT]);
  });

  it("callout의 무효 icon만 빠지고 children은 그대로다", () => {
    expect(
      clipboardBlocks(
        `<div data-geul-callout="true" data-geul-icon="&#1;"><p>c</p><div data-geul-children="1"><p>in</p></div></div>${TABLE}`,
      ),
    ).toEqual([
      {
        type: "callout",
        content: [{ text: "c" }],
        children: [{ type: "paragraph", content: [{ text: "in" }] }],
      },
      TABLE_SLOT,
    ]);
  });

  it("quote의 무효 색만 빠지고 children은 그대로다", () => {
    expect(
      clipboardBlocks(
        `<blockquote data-geul-background-color="x"><p>q</p><p>r</p></blockquote>${TABLE}`,
      ),
    ).toEqual([
      {
        type: "quote",
        content: [{ text: "q" }],
        children: [{ type: "paragraph", content: [{ text: "r" }] }],
      },
      TABLE_SLOT,
    ]);
  });
});

describe("정상 입력은 그대로다 (Issue #356 Q1)", () => {
  it("유효한 미디어·색·정렬은 바뀌지 않는다", () => {
    expect(
      clipboardBlocks(
        `<p data-geul-text-color="#FF0000" data-geul-text-alignment="center">a</p>` +
          `<img src="https://e.com/a.png">${TABLE}`,
      ),
    ).toEqual([
      {
        type: "paragraph",
        content: [{ text: "a" }],
        textColor: "#FF0000",
        textAlignment: "center",
      },
      { type: "image", url: "https://e.com/a.png" },
      TABLE_SLOT,
    ]);
  });

  it("파서가 낸 표 옆 블록은 모두 model 검증을 통과한다", () => {
    const html =
      `<p data-geul-text-color="red">a</p><img src="cid:a"><blockquote>q</blockquote>` +
      `<ul><li data-geul-text-alignment="middle">t<img src="file:///x.png"></li></ul>` +
      `<pre data-language="javascript">x</pre><hr>${TABLE}`;
    /** 표를 빼고 children까지 model 블록 트리로 모은다. 임시 id를 그대로 쓴다. */
    const nonTable = (blocks: readonly unknown[]): unknown[] =>
      blocks.flatMap((block) => {
        const record = block as Record<string, unknown>;
        if (record.type === "table") return [];
        if (!Array.isArray(record.children)) return [record];
        const children = nonTable(record.children);
        return [
          children.length > 0
            ? { ...record, children }
            : Object.fromEntries(
                Object.entries(record).filter(([key]) => key !== "children"),
              ),
        ];
      });
    let sequence = 0;
    /** 비교용으로 지운 id를 다시 단다. */
    const withIds = (blocks: unknown[]): unknown[] =>
      blocks.map((block) => {
        const record = block as Record<string, unknown>;
        sequence += 1;
        return {
          ...record,
          id: `probe-${sequence}`,
          ...(Array.isArray(record.children)
            ? { children: withIds(record.children) }
            : {}),
        };
      });

    const parsed = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: withIds(nonTable(clipboardBlocks(html))),
    });
    expect(parsed.ok).toBe(true);
  });
});
