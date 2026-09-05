/**
 * GFM import의 이미지 승격(spec §7.3)을 검증한다. paragraph가
 * image/imageReference 노드 하나만 담을 때만 ImageBlock으로 승격되고,
 * 다른 인라인과 섞이거나 참조가 끊어지면 기존 다운그레이드(plain text +
 * IMAGE_DOWNGRADED)를 유지한다. Video/Audio/File GFM import 경로는
 * 신설하지 않는다 — 확장자 기반 승격이 없음을 회귀로 고정한다.
 */
import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";

/**
 * 성공한 Markdown import 결과를 반환한다. 실패 메시지를 그대로 노출해
 * fixture 파싱 실패와 구조 단언 실패를 구분한다.
 */
const importDocument = (source: string) => {
  const result = importMarkdown(source);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe("GFM import 이미지 승격", () => {
  it("![name](url) 단일 문단은 ImageBlock으로 승격된다", () => {
    const { document, warnings } = importDocument(
      "![그림](https://example.com/a.png)\n",
    );

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "image",
        url: "https://example.com/a.png",
        name: "그림",
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("alt가 빈 문자열(![](url))이면 name 필드 자체가 없다", () => {
    const { document } = importDocument("![](https://example.com/a.png)\n");

    expect(document.blocks).toEqual([
      { id: "markdown-1", type: "image", url: "https://example.com/a.png" },
    ]);
  });

  it("![alt]()(url 명시적으로 빈 문자열)도 크래시 없이 url 없는 ImageBlock으로 승격된다", () => {
    const { document } = importDocument("![그림]()\n");

    expect(document.blocks).toEqual([
      { id: "markdown-1", type: "image", name: "그림" },
    ]);
  });

  it("참조 스타일(![alt][ref])도 정의가 있으면 동일하게 승격된다", () => {
    const { document, warnings } = importDocument(
      "![그림][pic]\n\n[pic]: https://example.com/a.png\n",
    );

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "image",
        url: "https://example.com/a.png",
        name: "그림",
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("끊어진 참조(정의 없음)는 ImageBlock으로 승격되지 않고 기존 다운그레이드를 유지한다", () => {
    const { document, warnings } = importDocument("![그림][missing]\n");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "paragraph",
        content: [{ text: "그림 [missing]" }],
      },
    ]);
    expect(warnings).toEqual([
      {
        kind: "IMAGE_DOWNGRADED",
        blockId: "markdown-1",
        message: "Image was imported as plain text",
      },
    ]);
  });

  it("다른 텍스트와 섞인 문단은 승격되지 않고 기존 다운그레이드를 유지한다", () => {
    const { document } = importDocument(
      "before ![그림](https://example.com/a.png) after\n",
    );

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "paragraph",
        content: [{ text: "before 그림 (https://example.com/a.png) after" }],
      },
    ]);
  });

  it("bold로 감싼 이미지(**![그림](url)**)도 승격되지 않는다(단일 자식이 emphasis/strong이지 image가 아니다)", () => {
    const { document } = importDocument(
      "**![그림](https://example.com/a.png)**\n",
    );

    const block = document.blocks[0];
    expect(block?.type).toBe("paragraph");
    expect(block?.type === "paragraph" ? block.content : undefined).toEqual([
      { text: "그림 (https://example.com/a.png)", marks: [{ type: "bold" }] },
    ]);
  });

  it.each(["mp4", "mp3", "pdf"])(
    "일반 링크(url.%s)는 확장자와 무관하게 plain paragraph + link mark로 남는다(Video/Audio/File로 승격되지 않는다)",
    (extension) => {
      const { document } = importDocument(
        `[파일](https://example.com/a.${extension})\n`,
      );

      expect(document.blocks).toEqual([
        {
          id: "markdown-1",
          type: "paragraph",
          content: [
            {
              text: "파일",
              marks: [
                { type: "link", href: `https://example.com/a.${extension}` },
              ],
            },
          ],
        },
      ]);
    },
  );

  it("DELTA-01의 export 출력을 그대로 재import하면 원래 url·name으로 복원된다(export→import 연결)", () => {
    const { document, warnings } = importDocument(
      "![그림](https://example.com/a.png)\n",
    );

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "image",
        url: "https://example.com/a.png",
        name: "그림",
      },
    ]);
    expect(warnings).toEqual([]);
  });
});
