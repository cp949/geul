/**
 * file/image/video/audio PM 노드의 스키마 계약을 고정한다(RD-002
 * DELTA-01, spec §3.1) — content 없는 atom leaf, group "block" 직접
 * 멤버(blockContainer로 포장되지 않음), div 렌더링과 data-be-block-id
 * 출력, parseHTML 미선언(G-EDT-003), priority가 blockContainer보다
 * 엄격히 낮다는 채움 우선순위 계약, 그리고 타입별 attrs 집합(previewWidth/
 * textAlignment는 image/video만, showPreview는 file 제외 3종). divider와
 * 같은 비포장 atom 패턴이다(RD-002 "## 결정" — Divider/Table형 채택,
 * divider-schema.test.ts와 같은 구조).
 */
import { DOMSerializer } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { BlockContainerExtension } from "../src/block-container-extension.js";
import {
  AudioBlockExtension,
  FileBlockExtension,
  ImageBlockExtension,
  VideoBlockExtension,
} from "../src/media-block-extension.js";
import { liveSchema, requireNode } from "./editor-controller-support.js";

const MEDIA_EXTENSIONS = {
  file: FileBlockExtension,
  image: ImageBlockExtension,
  video: VideoBlockExtension,
  audio: AudioBlockExtension,
} as const;
const MEDIA_TYPES = Object.keys(MEDIA_EXTENSIONS) as Array<
  keyof typeof MEDIA_EXTENSIONS
>;
const PREVIEW_ATTR_TYPES = ["image", "video"] as const;

describe.each(MEDIA_TYPES)("%s 노드 스키마 계약", (type) => {
  it("atom·leaf이고 content expression이 없다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, type);

    expect(node.isAtom).toBe(true);
    expect(node.isLeaf).toBe(true);
    expect(node.spec.content).toBeUndefined();
  });

  it("doc과 blockGroup의 직접 자식으로 유효하고 blockContainer 안에는 들어갈 수 없다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, type);
    const doc = requireNode(schema, "doc");
    const blockGroup = requireNode(schema, "blockGroup");
    const blockContainer = requireNode(schema, "blockContainer");

    expect(doc.contentMatch.matchType(node)).not.toBeNull();
    expect(blockGroup.contentMatch.matchType(node)).not.toBeNull();
    expect(blockContainer.contentMatch.matchType(node)).toBeNull();
  });

  it("div로 렌더되고 data-be-block-id를 낸다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, type);

    const dom = DOMSerializer.fromSchema(schema).serializeNode(
      node.create({ blockId: `${type}-1` }),
    ) as HTMLElement;

    expect(dom.tagName).toBe("DIV");
    expect(dom.getAttribute("data-be-block-id")).toBe(`${type}-1`);
  });

  it("노드 spec에 parseDOM이 없다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, type);

    expect(node.spec.parseDOM).toBeUndefined();
  });

  it("priority는 blockContainer보다 엄격히 낮다", () => {
    // Tiptap 3.30.1 sortExtensions는 동률에서 stable sort로 확장 배열 선언
    // 순서를 유지하므로 동률(1000)은 채움 계약 테스트를 통과한다 —
    // divider-schema.test.ts와 같은 이유로 값을 직접 고정한다(G-EDT-003).
    const containerPriority = BlockContainerExtension.config.priority;
    if (containerPriority === undefined) {
      throw new Error("blockContainer priority missing");
    }

    expect(MEDIA_EXTENSIONS[type].config.priority).toBeLessThan(
      containerPriority,
    );
  });
});

describe("타입별 attrs 집합", () => {
  it("file은 previewWidth·textAlignment·showPreview attr을 갖지 않는다(공통 4개 + blockId만)", () => {
    const schema = liveSchema();
    const node = requireNode(schema, "file");
    const attrNames = Object.keys(node.create().attrs);

    expect(attrNames.sort()).toEqual(
      ["backgroundColor", "blockId", "caption", "name", "url"].sort(),
    );
  });

  it.each(PREVIEW_ATTR_TYPES)(
    "%s는 showPreview·previewWidth·textAlignment attr을 갖는다",
    (type) => {
      const schema = liveSchema();
      const node = requireNode(schema, type);
      const attrNames = Object.keys(node.create().attrs);

      expect(attrNames).toEqual(
        expect.arrayContaining([
          "showPreview",
          "previewWidth",
          "textAlignment",
        ]),
      );
    },
  );

  it("audio는 showPreview만 갖고 previewWidth·textAlignment는 갖지 않는다", () => {
    const schema = liveSchema();
    const node = requireNode(schema, "audio");
    const attrNames = Object.keys(node.create().attrs);

    expect(attrNames).toContain("showPreview");
    expect(attrNames).not.toContain("previewWidth");
    expect(attrNames).not.toContain("textAlignment");
  });
});
