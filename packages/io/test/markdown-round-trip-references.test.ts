import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";

describe("Markdown 참조 해석", () => {
  it("이미지 참조를 변환 전에 해석하고 정의는 문서에 남기지 않는다", () => {
    expect(
      importMarkdown(
        "Before ![Diagram][Diagram Ref] after\n\n[diagram ref]: https://example.com/image.png",
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [
                {
                  text: "Before Diagram (https://example.com/image.png) after",
                },
              ],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("정의가 없는 이미지 참조는 alt와 정규화된 식별자로 보존한다", () => {
    expect(importMarkdown("Before ![Diagram][Missing Ref] after")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "Before Diagram [missing ref] after" }],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("정의가 없는 collapsed 이미지 참조를 원본 텍스트에서 복원한다", () => {
    expect(importMarkdown("Before ![Diagram][] after")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "Before Diagram [diagram] after" }],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("정의가 없는 shortcut 이미지 참조를 원본 텍스트에서 복원한다", () => {
    expect(importMarkdown("Before ![Diagram] after")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "Before Diagram [diagram] after" }],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("collapsed와 shortcut 이미지 참조를 각자의 인라인 위치에서 해석한다", () => {
    expect(
      importMarkdown(
        "Collapsed ![Diagram][]\n\nShortcut ![Diagram]\n\n[diagram]: https://example.com/image.png",
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [
                {
                  text: "Collapsed Diagram (https://example.com/image.png)",
                },
              ],
            },
            {
              id: "markdown-2",
              type: "paragraph",
              content: [
                {
                  text: "Shortcut Diagram (https://example.com/image.png)",
                },
              ],
            },
          ],
        },
        warnings: [
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-1",
            message: "Image was imported as plain text",
          },
          {
            kind: "IMAGE_DOWNGRADED",
            blockId: "markdown-2",
            message: "Image was imported as plain text",
          },
        ],
      },
    });
  });

  it("이스케이프된 이미지 참조 문법은 복원하지 않는다", () => {
    expect(
      importMarkdown("Before \\![Diagram][] and \\![Diagram] after"),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "Before ![Diagram][] and ![Diagram] after" }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it.each(["![Diagram][", "![Diagram][missing"])(
    "깨진 이미지 참조 문자열은 경고 없이 그대로 보존한다 — %s",
    (source) => {
      expect(importMarkdown(source)).toEqual({
        ok: true,
        value: {
          document: {
            formatVersion: 1,
            revision: 0,
            blocks: [
              {
                id: "markdown-1",
                type: "paragraph",
                content: [{ text: source }],
              },
            ],
          },
          warnings: [],
        },
      });
    },
  );

  it("구두점이 뒤따르는 깨진 이미지 참조를 그대로 보존한다", () => {
    expect(importMarkdown("Before ![Diagram][missing.")).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [{ text: "Before ![Diagram][missing." }],
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("링크 참조도 같은 정의 조회 경로로 해석한다", () => {
    expect(
      importMarkdown(
        "Before [Guide][Project Docs] after\n\n[project docs]: https://example.com/docs",
      ),
    ).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "markdown-1",
              type: "paragraph",
              content: [
                { text: "Before " },
                {
                  text: "Guide",
                  marks: [{ type: "link", href: "https://example.com/docs" }],
                },
                { text: " after" },
              ],
            },
          ],
        },
        warnings: [],
      },
    });
  });
});
