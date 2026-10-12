/**
 * MDAST_NODE_KIND 표가 export-markdown.ts의 blockNode 실제 출력과 일치하는지
 * 지킨다(Issue #391). 표는 blockNode가 모델 블록 타입마다 내는 mdast 노드
 * 종류를 따로 적은 것이라, 한쪽만 바뀌면 컨테이너 손실 판정이 조용히
 * 어긋난다. 각 타입의 최소 유효 블록을 lossy로 내보내 remark로 다시 파싱한
 * 첫 노드 종류를 표 값과 대조한다. 표에 새 타입이 오면 샘플이 없어 이
 * 테스트가 실패해 샘플 추가를 강제한다.
 */
import { parseDocument, type Block, type Document } from "@cp949/geul-model";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";
import { MDAST_NODE_KIND } from "../src/markdown/gfm-container-shape.js";

/**
 * 블록 타입별 최소 유효 샘플이다. 출력이 비면 파싱할 수 없으므로 내용을
 * 비우지 않는다. 새 블록 타입이 오면 여기에 한 줄을 더한다.
 */
const SAMPLES: Partial<Record<Block["type"], Block>> = {
  paragraph: { id: "s", type: "paragraph", content: [{ text: "본문" }] },
  heading: { id: "s", type: "heading", level: 2, content: [{ text: "제목" }] },
  quote: { id: "s", type: "quote", content: [{ text: "인용" }] },
  divider: { id: "s", type: "divider" },
  codeBlock: { id: "s", type: "codeBlock", content: [{ text: "코드" }] },
  bulletListItem: {
    id: "s",
    type: "bulletListItem",
    content: [{ text: "항목" }],
  },
  numberedListItem: {
    id: "s",
    type: "numberedListItem",
    content: [{ text: "항목" }],
  },
  checkListItem: {
    id: "s",
    type: "checkListItem",
    checked: false,
    content: [{ text: "할 일" }],
  },
  toggleListItem: {
    id: "s",
    type: "toggleListItem",
    content: [{ text: "토글" }],
  },
  callout: { id: "s", type: "callout", content: [{ text: "알림" }] },
  table: {
    id: "s",
    type: "table",
    columns: [{ id: "c1", width: 160 }],
    rows: [
      {
        id: "r1",
        cells: [
          {
            id: "k1",
            columnId: "c1",
            rowSpan: 1,
            columnSpan: 1,
            content: [{ text: "칸" }],
          },
        ],
      },
    ],
    headerRows: 1,
    headerColumns: 0,
  },
  file: { id: "s", type: "file", url: "https://e.com/a.pdf", name: "문서" },
  image: { id: "s", type: "image", url: "https://e.com/a.png", name: "img" },
  video: { id: "s", type: "video", url: "https://e.com/a.mp4", name: "영상" },
  audio: { id: "s", type: "audio", url: "https://e.com/a.mp3", name: "음원" },
  iframe: {
    id: "s",
    type: "iframe",
    url: "https://e.com/embed",
    name: "임베드",
  },
};

const markdownProcessor = unified().use(remarkParse).use(remarkGfm);

/**
 * 블록 하나짜리 문서를 lossy로 내보낸 markdown의 root 첫 자식 mdast 종류를
 * 돌려준다. 내보내기가 실패하면 원인을 드러내며 즉시 실패시킨다.
 */
const exportedFirstNodeType = (block: Block): string | undefined => {
  const document: Document = { formatVersion: 1, revision: 0, blocks: [block] };
  const exported = exportMarkdown(document, { mode: "lossy" });
  if (!exported.ok) throw new Error(exported.error.code);
  return markdownProcessor.parse(exported.value.markdown).children[0]?.type;
};

describe("MDAST_NODE_KIND와 blockNode 일치", () => {
  it.each(Object.keys(MDAST_NODE_KIND))(
    "%s의 표 값이 실제 내보내기 결과의 첫 mdast 노드 종류와 같다",
    (type) => {
      const sample = SAMPLES[type as Block["type"]];
      expect(sample, `${type}: 샘플 없음`).toBeDefined();
      if (sample === undefined) return;

      expect(sample.type).toBe(type);
      expect(
        parseDocument({ formatVersion: 1, revision: 0, blocks: [sample] }).ok,
        `${type}: 샘플이 parseDocument를 통과하지 못한다`,
      ).toBe(true);
      expect(exportedFirstNodeType(sample)).toBe(
        MDAST_NODE_KIND[type as Block["type"]],
      );
    },
  );

  // blockNode는 값 조건 분기(image의 showPreview, 이름 없는 미디어)를 갖는다.
  // 그 분기를 지나도 표 값이 유지되는지 변형 샘플로 확인한다.
  it.each([
    [
      "showPreview가 false인 image",
      {
        id: "s",
        type: "image",
        url: "https://e.com/a.png",
        showPreview: false,
      },
    ],
    [
      "name이 없는 image",
      { id: "s", type: "image", url: "https://e.com/a.png" },
    ],
    ["name이 없는 file", { id: "s", type: "file", url: "https://e.com/a.pdf" }],
    ["url이 없는 video", { id: "s", type: "video" }],
  ] as Array<[string, Block]>)("%s도 표 값과 같다", (_label, block) => {
    expect(exportedFirstNodeType(block)).toBe(MDAST_NODE_KIND[block.type]);
  });

  it("샘플 표에 MDAST_NODE_KIND에 없는 타입이 남아 있지 않다", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(
      Object.keys(MDAST_NODE_KIND).sort(),
    );
  });
});
