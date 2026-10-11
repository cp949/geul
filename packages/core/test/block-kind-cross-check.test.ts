/**
 * Block["type"] 전 종류를 한 fixture로 순회하며 종류별 처리 경로가 모두
 * 같은 종류 집합을 안다는 것을 고정한다(Issue #371). 문서 검증, exportHtml,
 * exportMarkdown, model→PM→model 왕복, 순차 id 에디터 마운트를 전 종류에
 * 돌린다.
 *
 * fixture는 Record<Block["type"], Block>이라 model에 종류가 늘면 이 파일이
 * 컴파일에서 먼저 실패한다. 분류 predicate 자체의 기대값은 model의
 * block-kind.test.ts가 소유한다.
 *
 * 모든 fixture 블록의 id는 "id-1"이다. 순차 id 팩토리(id-1, id-2, ...)가
 * 마운트 때 만드는 trailing paragraph id와 겹치는 문서를 만들기 위해서다.
 */
import { parseDocument, type Block, type Document } from "@cp949/geul-model";
import { exportHtml, exportMarkdown } from "@cp949/geul-io";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { modelToTiptap } from "../src/model-to-tiptap.js";
import {
  calloutBlock,
  checkListItemBlock,
  codeBlockBlock,
  dividerBlock,
  documentOf,
  headingBlock,
  listItemBlock,
  mediaBlock,
  mountTiptapEditor,
  oneCellTableBlock,
  paragraphBlock,
  quoteBlock,
  sequentialIds,
  toggleBlock,
} from "./editor-controller-support.js";

const BLOCK_ID = "id-1";
const MEDIA_URL = "https://example.com/resource";

const BLOCK_BY_TYPE: Record<Block["type"], Block> = {
  paragraph: paragraphBlock(BLOCK_ID, "본문"),
  heading: headingBlock(BLOCK_ID, 2, "제목"),
  quote: quoteBlock(BLOCK_ID, "인용"),
  bulletListItem: listItemBlock(BLOCK_ID, "bulletListItem", "글머리"),
  numberedListItem: listItemBlock(BLOCK_ID, "numberedListItem", "번호"),
  checkListItem: checkListItemBlock(BLOCK_ID, "체크", false),
  toggleListItem: toggleBlock(BLOCK_ID, "토글"),
  callout: calloutBlock(BLOCK_ID, "콜아웃"),
  table: oneCellTableBlock(BLOCK_ID),
  divider: dividerBlock(BLOCK_ID),
  codeBlock: codeBlockBlock(BLOCK_ID, "const a = 1;"),
  file: mediaBlock("file", BLOCK_ID, { url: MEDIA_URL }),
  image: mediaBlock("image", BLOCK_ID, { url: MEDIA_URL }),
  video: mediaBlock("video", BLOCK_ID, { url: MEDIA_URL }),
  audio: mediaBlock("audio", BLOCK_ID, { url: MEDIA_URL }),
  iframe: mediaBlock("iframe", BLOCK_ID, { url: MEDIA_URL }),
};

const BLOCK_TYPES = Object.keys(BLOCK_BY_TYPE) as Block["type"][];

/** 종류 하나짜리 문서를 만든다. */
const documentFor = (type: Block["type"]): Document =>
  documentOf(BLOCK_BY_TYPE[type]);

describe("블록 종류 교차 검사 fixture", () => {
  it.each(BLOCK_TYPES)("%s fixture의 type 필드가 키와 같다", (type) => {
    expect(BLOCK_BY_TYPE[type].type).toBe(type);
  });
});

describe("블록 종류 교차 검사", () => {
  it.each(BLOCK_TYPES)("%s 문서가 model 검증을 통과한다", (type) => {
    expect(parseDocument(documentFor(type)).ok).toBe(true);
  });

  it.each(BLOCK_TYPES)(
    "%s 문서가 exportHtml에서 던지지 않고 성공한다",
    (type) => {
      expect(exportHtml(documentFor(type)).ok).toBe(true);
    },
  );

  it.each(BLOCK_TYPES)(
    "%s 문서가 exportMarkdown lossy에서 던지지 않고 성공한다",
    (type) => {
      expect(exportMarkdown(documentFor(type), { mode: "lossy" }).ok).toBe(
        true,
      );
    },
  );

  it.each(BLOCK_TYPES)("%s 문서가 modelToTiptap 인코딩에 성공한다", (type) => {
    expect(modelToTiptap(documentFor(type)).ok).toBe(true);
  });

  it.each(BLOCK_TYPES)(
    "%s 문서가 model→PM→model 왕복에서 type과 id를 보존한다",
    (type) => {
      const blocks = createEditor({
        initialDocument: documentFor(type),
        createId: sequentialIds("gen"),
      }).getDocument().blocks;

      // 리프·표로 끝나는 문서는 편집기가 trailing paragraph를 덧붙이므로
      // 첫 블록만 비교한다.
      expect(blocks[0]).toEqual(BLOCK_BY_TYPE[type]);
    },
  );

  it.each(BLOCK_TYPES)(
    "%s 문서를 순차 id로 마운트해도 던지지 않고 블록 id가 중복되지 않는다",
    (type) => {
      const editor = createEditor({
        initialDocument: documentFor(type),
        createId: sequentialIds("id"),
      });
      mountTiptapEditor(editor);

      const ids = editor.getDocument().blocks.map((block) => block.id);

      expect(ids[0]).toBe(BLOCK_ID);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );
});

describe("iframe 순차 id 회귀(Issue #371)", () => {
  it("iframe 한 블록 문서를 순차 id로 마운트하면 블록 id가 id-1, id-2다", () => {
    const editor = createEditor({
      initialDocument: documentFor("iframe"),
      createId: sequentialIds("id"),
    });
    mountTiptapEditor(editor);

    expect(editor.getDocument().blocks.map((block) => block.id)).toEqual([
      "id-1",
      "id-2",
    ]);
  });
});
