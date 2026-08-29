/**
 * GFM export/import의 heading depth 1-6·thematicBreak 매핑(DELTA-07, spec
 * §7.2)을 검증한다. heading level 1-6은 `#`~`######`로, divider는 `---`로
 * (rule 옵션으로 `***` 대신 하이픈 사용) 왕복하고, 예전에 depth 4-6을
 * 문단으로 강등하던 `HEADING_DEPTH_DOWNGRADED` 경고는 더 이상 나지 않는다.
 * thematicBreak의 다른 표기(`***`, `___`)도 import에서 divider가 된다.
 * quote 매핑은 범위 밖이다(DELTA-07a).
 */
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";
import {
  buildDocument,
  dividerBlock,
  headingBlock,
} from "./fixtures/quote-divider-document.js";
import { expectRoundTrip, importOk } from "./markdown-round-trip-support.js";

describe("heading depth 1-6 GFM 왕복", () => {
  it("level 1-6 heading 문서가 exportMarkdown→importMarkdown 왕복에서 level·id를 보존한다", () => {
    const markdown = expectRoundTrip(
      buildDocument([
        headingBlock("markdown-1", 1, "하나"),
        headingBlock("markdown-2", 2, "둘"),
        headingBlock("markdown-3", 3, "셋"),
        headingBlock("markdown-4", 4, "넷"),
        headingBlock("markdown-5", 5, "다섯"),
        headingBlock("markdown-6", 6, "여섯"),
      ]),
    );

    expect(markdown).toContain("# 하나");
    expect(markdown).toContain("## 둘");
    expect(markdown).toContain("### 셋");
    expect(markdown).toContain("#### 넷");
    expect(markdown).toContain("##### 다섯");
    expect(markdown).toContain("###### 여섯");
  });

  it("`#### 제목` import가 경고 없이 level 4 heading을 만든다", () => {
    const { document, warnings } = importOk("#### 제목");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "heading",
        level: 4,
        content: [{ text: "제목" }],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("`#####`·`######` import도 경고 없이 level 5·6 heading을 만든다", () => {
    const { document, warnings } = importOk("##### 다섯\n\n###### 여섯");

    expect(document.blocks).toEqual([
      {
        id: "markdown-1",
        type: "heading",
        level: 5,
        content: [{ text: "다섯" }],
      },
      {
        id: "markdown-2",
        type: "heading",
        level: 6,
        content: [{ text: "여섯" }],
      },
    ]);
    expect(warnings).toEqual([]);
  });
});

describe("thematicBreak ↔ divider", () => {
  it("divider가 `---`로 export되고 `***`를 쓰지 않는다", () => {
    const exported = exportMarkdown(
      buildDocument([dividerBlock("divider-1")]),
      {
        mode: "strict",
      },
    );
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.code);

    expect(exported.value).toContain("---");
    expect(exported.value).not.toContain("***");
  });

  it("divider가 exportMarkdown→importMarkdown 왕복에서 id·위치를 보존한다", () => {
    expectRoundTrip(
      buildDocument([
        headingBlock("markdown-1", 2, "앞"),
        dividerBlock("markdown-2"),
        headingBlock("markdown-3", 2, "뒤"),
      ]),
    );
  });

  it.each(["***", "___", "---"])(
    "thematicBreak 표기 %s의 import가 경고 없이 divider를 만든다",
    (marker) => {
      const { document, warnings } = importOk(`앞\n\n${marker}\n\n뒤`);

      expect(document.blocks).toEqual([
        { id: "markdown-1", type: "paragraph", content: [{ text: "앞" }] },
        { id: "markdown-2", type: "divider" },
        { id: "markdown-3", type: "paragraph", content: [{ text: "뒤" }] },
      ]);
      expect(warnings).toEqual([]);
    },
  );
});
