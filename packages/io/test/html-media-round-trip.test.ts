/**
 * 4종 미디어 블록(file/image/video/audio)의 HTML export→import 연결
 * round-trip을 검증한다(spec §7.1). export-html.ts(RD-001-DELTA-01)와
 * import-html.ts(RD-001-DELTA-02)를 각각 리터럴 HTML로 개별 대조하는
 * 대신, `Document → exportHtml → importHtml → Document`가 항등인지
 * 직접 연결해 두 계약의 드리프트를 잡는다. 개별 계약 fixture(bare 태그
 * 형태·중복 생성 방지 가드·own-format 경계)는 html-media-export.test.ts·
 * html-media-import.test.ts가 이미 소유한다 — 여기서 재작성하지 않는다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

// exportHtml → importHtml을 이어 붙여 원본 Document를 되돌려준다. 두 단계
// 중 하나라도 실패하면 테스트 실패 메시지에 원인이 드러나도록 즉시 throw한다
// (개별 assertion으로 흩어두면 어느 단계가 깨졌는지 알기 어렵다).
const roundTrip = (
  document: Document,
): { document: Document; warnings: string[] } => {
  const exported = exportHtml(document);
  if (!exported.ok) {
    throw new Error(`export 실패: ${exported.error.message}`);
  }
  const imported = importHtml(exported.value);
  if (!imported.ok) {
    throw new Error(`import 실패: ${imported.error.message}`);
  }
  return {
    document: imported.value.document,
    warnings: imported.value.warnings.map((warning) => warning.kind),
  };
};

describe("미디어 블록 HTML round-trip(export→import 연결)", () => {
  describe("file", () => {
    it("빈 블록이 그대로 round-trip한다", () => {
      const original = documentOf({ id: "f-empty", type: "file" });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("caption 없이 전체 공통 prop(url/name/backgroundColor)이 round-trip한다", () => {
      const original = documentOf({
        id: "f-full",
        type: "file",
        url: "https://example.com/doc.pdf",
        name: "문서.pdf",
        backgroundColor: "#FF0000",
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("caption 있는 전체 공통 prop(figure)이 round-trip한다", () => {
      const original = documentOf({
        id: "f-caption",
        type: "file",
        url: "https://example.com/doc.pdf",
        name: "문서.pdf",
        caption: "첨부 파일",
        backgroundColor: "#00FF00",
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("image", () => {
    it("빈 블록이 그대로 round-trip한다", () => {
      const original = documentOf({ id: "i-empty", type: "image" });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("caption 없이 showPreview/previewWidth/textAlignment/backgroundColor가 함께 round-trip한다", () => {
      const original = documentOf({
        id: "i-full",
        type: "image",
        url: "https://example.com/a.png",
        name: "사진",
        backgroundColor: "#FF0000",
        showPreview: true,
        previewWidth: 320,
        textAlignment: "center",
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("caption 있는 전체 prop 조합(figure)이 round-trip한다 — alt는 caption을 쓰지만 name도 함께 보존된다", () => {
      const original = documentOf({
        id: "i-caption",
        type: "image",
        url: "https://example.com/a.png",
        name: "원본이름.png",
        caption: "설명 캡션",
        backgroundColor: "#00FF00",
        showPreview: true,
        previewWidth: 480,
        textAlignment: "right",
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("showPreview:false 강등(caption 없음)이 previewWidth/textAlignment와 함께 round-trip한다", () => {
      const original = documentOf({
        id: "i-suppressed",
        type: "image",
        url: "https://example.com/a.png",
        name: "사진",
        showPreview: false,
        previewWidth: 200,
        textAlignment: "left",
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("showPreview:false 강등(caption 있음, figure)이 round-trip한다", () => {
      const original = documentOf({
        id: "i-suppressed-caption",
        type: "image",
        url: "https://example.com/a.png",
        caption: "강등된 설명",
        showPreview: false,
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("video", () => {
    it("빈 블록이 그대로 round-trip한다", () => {
      const original = documentOf({ id: "v-empty", type: "video" });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("caption 없이 전체 prop 조합이 round-trip한다", () => {
      const original = documentOf({
        id: "v-full",
        type: "video",
        url: "https://example.com/a.mp4",
        name: "영상",
        backgroundColor: "#FF0000",
        showPreview: true,
        previewWidth: 480,
        textAlignment: "center",
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("caption 있는 전체 prop 조합(figure)이 round-trip한다", () => {
      const original = documentOf({
        id: "v-caption",
        type: "video",
        url: "https://example.com/a.mp4",
        name: "영상.mp4",
        caption: "영상 설명",
        backgroundColor: "#00FF00",
        showPreview: true,
        previewWidth: 640,
        textAlignment: "right",
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("showPreview:false 강등(caption 있음, figure)이 previewWidth/textAlignment와 함께 round-trip한다", () => {
      const original = documentOf({
        id: "v-suppressed",
        type: "video",
        url: "https://example.com/a.mp4",
        caption: "강등된 영상",
        showPreview: false,
        previewWidth: 300,
        textAlignment: "left",
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("audio", () => {
    it("빈 블록이 그대로 round-trip한다", () => {
      const original = documentOf({ id: "au-empty", type: "audio" });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("caption 없이 name/backgroundColor/showPreview가 round-trip한다(previewWidth/textAlignment 필드 없음)", () => {
      const original = documentOf({
        id: "au-full",
        type: "audio",
        url: "https://example.com/a.mp3",
        name: "소리",
        backgroundColor: "#FF0000",
        showPreview: true,
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("caption 있는 조합(figure)이 round-trip한다", () => {
      const original = documentOf({
        id: "au-caption",
        type: "audio",
        url: "https://example.com/a.mp3",
        name: "소리.mp3",
        caption: "오디오 설명",
        backgroundColor: "#00FF00",
        showPreview: true,
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("showPreview:false 강등(caption 없음)이 round-trip한다", () => {
      const original = documentOf({
        id: "au-suppressed",
        type: "audio",
        url: "https://example.com/a.mp3",
        name: "소리",
        showPreview: false,
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });

    it("showPreview:false 강등(caption 있음, figure)이 round-trip한다", () => {
      const original = documentOf({
        id: "au-suppressed-caption",
        type: "audio",
        url: "https://example.com/a.mp3",
        caption: "강등된 오디오",
        showPreview: false,
      });
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("여러 미디어 블록이 한 문서에 섞여도 문서 순서대로 round-trip한다", () => {
    it("4종을 한 문서에 순서대로 담아도 순서·id·prop이 그대로 유지된다", () => {
      const original: Document = {
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "mix-file",
            type: "file",
            url: "https://example.com/doc.pdf",
            name: "문서.pdf",
          },
          {
            id: "mix-image",
            type: "image",
            url: "https://example.com/a.png",
            caption: "사진 설명",
          },
          {
            id: "mix-video",
            type: "video",
            url: "https://example.com/a.mp4",
            showPreview: false,
          },
          {
            id: "mix-audio",
            type: "audio",
            url: "https://example.com/a.mp3",
          },
        ],
      };
      const result = roundTrip(original);
      expect(result.document).toEqual(original);
      expect(result.warnings).toEqual([]);
    });
  });
});
