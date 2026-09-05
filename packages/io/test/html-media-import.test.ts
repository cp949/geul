/**
 * 4종 미디어 블록(file/image/video/audio)의 HTML inbound 의미를 검증한다
 * (spec §7.1). export-html.ts(RD-001-DELTA-01)가 낸 `<figure>`/`<img>`/
 * `<video>`/`<audio>`/`<a>` + `data-be-*`를 되읽어 원래 Document로 복원하는지,
 * `<figure>` 중복 생성 방지 가드, own-format `<a>` 경계(마커 없는 외부 `<a>`는
 * link mark로 남음), 경고 정확성(G-CNV-002)을 다룬다. export는 DELTA-01,
 * round-trip 전체 조합·추가 회귀는 DELTA-03이 다룬다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

describe("미디어 블록 HTML 가져오기", () => {
  describe("caption 없음 — bare 시각 태그에서 복원한다", () => {
    it("file은 <a href>name</a> + data-be-*에서 FileBlock을 복원한다", () => {
      const result = importHtml(
        '<a href="https://example.com/doc.pdf" data-be-block-id="f-1" data-be-media-type="file" data-be-name="문서.pdf">문서.pdf</a>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "f-1",
          type: "file",
          url: "https://example.com/doc.pdf",
          name: "문서.pdf",
        }),
      );
      expect(result.value.warnings).toEqual([]);
    });

    it("image는 <img src alt data-be-*>에서 ImageBlock을 복원한다(alt는 읽지 않는다)", () => {
      const result = importHtml(
        '<img src="https://example.com/a.png" alt="사진" data-be-block-id="i-1" data-be-media-type="image" data-be-name="사진">',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "i-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "사진",
        }),
      );
      expect(result.value.warnings).toEqual([]);
    });

    it("video는 <video src controls data-be-*>에서 VideoBlock을 복원한다", () => {
      const result = importHtml(
        '<video src="https://example.com/a.mp4" controls data-be-block-id="v-1" data-be-media-type="video" data-be-name="영상"></video>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "v-1",
          type: "video",
          url: "https://example.com/a.mp4",
          name: "영상",
        }),
      );
      expect(result.value.warnings).toEqual([]);
    });

    it("audio는 <audio src controls data-be-*>에서 AudioBlock을 복원한다", () => {
      const result = importHtml(
        '<audio src="https://example.com/a.mp3" controls data-be-block-id="au-1" data-be-media-type="audio" data-be-name="소리"></audio>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "au-1",
          type: "audio",
          url: "https://example.com/a.mp3",
          name: "소리",
        }),
      );
      expect(result.value.warnings).toEqual([]);
    });

    it("data-be-name이 없으면 name 없이 복원된다(file·image 둘 다)", () => {
      const fileResult = importHtml(
        '<a href="https://example.com/x" data-be-block-id="f-2" data-be-media-type="file">https://example.com/x</a>',
      );
      expect(fileResult.ok).toBe(true);
      if (!fileResult.ok) return;
      expect(fileResult.value.document).toEqual(
        documentOf({ id: "f-2", type: "file", url: "https://example.com/x" }),
      );

      const imageResult = importHtml(
        '<img src="https://example.com/y" alt="" data-be-block-id="i-2" data-be-media-type="image">',
      );
      expect(imageResult.ok).toBe(true);
      if (!imageResult.ok) return;
      expect(imageResult.value.document).toEqual(
        documentOf({ id: "i-2", type: "image", url: "https://example.com/y" }),
      );
    });
  });

  describe("caption 있음 — <figure>를 블록 1개로만 디코드한다(중복 생성 방지 가드)", () => {
    it("image + caption + name: caption은 figcaption에서, name은 data-be-name에서 각각 복원한다(alt는 읽지 않는다)", () => {
      const result = importHtml(
        '<figure data-be-block-id="i-3" data-be-media-type="image" data-be-name="원본이름.png">' +
          '<img src="https://example.com/a.png" alt="설명 캡션">' +
          "<figcaption>설명 캡션</figcaption></figure>",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document.blocks).toHaveLength(1);
      expect(result.value.document).toEqual(
        documentOf({
          id: "i-3",
          type: "image",
          url: "https://example.com/a.png",
          name: "원본이름.png",
          caption: "설명 캡션",
        }),
      );
      expect(result.value.warnings).toEqual([]);
    });

    it("file + caption: <a>는 data-be-*가 없어도 figure의 data-be-*로 복원된다", () => {
      const result = importHtml(
        '<figure data-be-block-id="f-3" data-be-media-type="file" data-be-name="문서.pdf">' +
          '<a href="https://example.com/doc.pdf">문서.pdf</a>' +
          "<figcaption>첨부 파일</figcaption></figure>",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document.blocks).toHaveLength(1);
      expect(result.value.document).toEqual(
        documentOf({
          id: "f-3",
          type: "file",
          url: "https://example.com/doc.pdf",
          name: "문서.pdf",
          caption: "첨부 파일",
        }),
      );
      expect(result.value.warnings).toEqual([]);
    });
  });

  describe("showPreview:false — <a>에서 강등 상태를 복원한다", () => {
    it("image의 <a>+data-be-show-preview=false는 showPreview:false ImageBlock으로 복원된다", () => {
      const result = importHtml(
        '<a href="https://example.com/a.png" data-be-block-id="i-4" data-be-media-type="image" data-be-name="사진" data-be-show-preview="false">사진</a>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "i-4",
          type: "image",
          url: "https://example.com/a.png",
          name: "사진",
          showPreview: false,
        }),
      );
    });

    it("video의 figure+<a>+showPreview=false는 figure 안에서도 VideoBlock으로 복원된다", () => {
      const result = importHtml(
        '<figure data-be-block-id="v-2" data-be-media-type="video" data-be-show-preview="false">' +
          '<a href="https://example.com/a.mp4">https://example.com/a.mp4</a>' +
          "<figcaption>영상 설명</figcaption></figure>",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document.blocks).toHaveLength(1);
      expect(result.value.document).toEqual(
        documentOf({
          id: "v-2",
          type: "video",
          url: "https://example.com/a.mp4",
          caption: "영상 설명",
          showPreview: false,
        }),
      );
    });

    it("audio의 <a>+showPreview=false도 AudioBlock으로 복원된다", () => {
      const result = importHtml(
        '<a href="https://example.com/a.mp3" data-be-block-id="au-2" data-be-media-type="audio" data-be-show-preview="false">https://example.com/a.mp3</a>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "au-2",
          type: "audio",
          url: "https://example.com/a.mp3",
          showPreview: false,
        }),
      );
    });

    it("showPreview:true(명시)는 정상 시각 태그에서 그대로 복원된다", () => {
      const result = importHtml(
        '<img src="https://example.com/a.png" alt="" data-be-block-id="i-5" data-be-media-type="image" data-be-show-preview="true">',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "i-5",
          type: "image",
          url: "https://example.com/a.png",
          showPreview: true,
        }),
      );
    });
  });

  describe("타입별 속성 제약 — previewWidth/textAlignment는 image/video만 복원한다", () => {
    it("image의 previewWidth·textAlignment가 복원된다", () => {
      const result = importHtml(
        '<img src="https://example.com/a.png" alt="" data-be-block-id="i-6" data-be-media-type="image" data-be-preview-width="320" data-be-text-alignment="center">',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "i-6",
          type: "image",
          url: "https://example.com/a.png",
          previewWidth: 320,
          textAlignment: "center",
        }),
      );
    });

    it("video의 previewWidth·textAlignment가 복원된다", () => {
      const result = importHtml(
        '<video src="https://example.com/a.mp4" controls data-be-block-id="v-3" data-be-media-type="video" data-be-preview-width="480" data-be-text-alignment="right"></video>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "v-3",
          type: "video",
          url: "https://example.com/a.mp4",
          previewWidth: 480,
          textAlignment: "right",
        }),
      );
    });

    it("audio는 showPreview만 복원되고 previewWidth/textAlignment 필드가 생기지 않는다", () => {
      const result = importHtml(
        '<audio src="https://example.com/a.mp3" controls data-be-block-id="au-3" data-be-media-type="audio" data-be-show-preview="true"></audio>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({
          id: "au-3",
          type: "audio",
          url: "https://example.com/a.mp3",
          showPreview: true,
        }),
      );
    });
  });

  describe("backgroundColor — 4종 공통", () => {
    it.each([
      [
        "file",
        '<a href="https://example.com/x" data-be-block-id="f-4" data-be-media-type="file" data-be-background-color="#FF0000">https://example.com/x</a>',
        { id: "f-4", type: "file" as const, url: "https://example.com/x" },
      ],
      [
        "image",
        '<img src="https://example.com/x" alt="" data-be-block-id="i-7" data-be-media-type="image" data-be-background-color="#FF0000">',
        { id: "i-7", type: "image" as const, url: "https://example.com/x" },
      ],
      [
        "video",
        '<video src="https://example.com/x" controls data-be-block-id="v-4" data-be-media-type="video" data-be-background-color="#FF0000"></video>',
        { id: "v-4", type: "video" as const, url: "https://example.com/x" },
      ],
      [
        "audio",
        '<audio src="https://example.com/x" controls data-be-block-id="au-4" data-be-media-type="audio" data-be-background-color="#FF0000"></audio>',
        { id: "au-4", type: "audio" as const, url: "https://example.com/x" },
      ],
    ])(
      "%s의 data-be-background-color가 backgroundColor로 복원된다",
      (_label, html, block) => {
        const result = importHtml(html);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.document).toEqual(
          documentOf({ ...block, backgroundColor: "#FF0000" }),
        );
      },
    );
  });

  describe("url 없는 빈 미디어 블록 — 크래시 없이 복원한다", () => {
    it("caption 없는 빈 image는 <div data-be-block-id data-be-media-type>에서 복원된다", () => {
      const result = importHtml(
        '<div data-be-block-id="i-8" data-be-media-type="image"></div>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({ id: "i-8", type: "image" }),
      );
      expect(result.value.warnings).toEqual([]);
    });

    it("caption 있는 빈 file은 <div>...<figcaption>에서 caption과 함께 복원된다", () => {
      const result = importHtml(
        '<div data-be-block-id="f-5" data-be-media-type="file"><figcaption>예정된 첨부</figcaption></div>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.document).toEqual(
        documentOf({ id: "f-5", type: "file", caption: "예정된 첨부" }),
      );
      expect(result.value.warnings).toEqual([]);
    });
  });

  describe("own-format 경계 — data-be-media-type 마커 없는 외부 <a>는 File로 승격되지 않는다", () => {
    it("문단 안 평범한 링크는 paragraph + link mark로 남는다(Issue #38 슬라이스10 원칙)", () => {
      const result = importHtml(
        '<p>See <a href="https://example.com">this</a> for details.</p>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { blocks } = result.value.document;
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.type).toBe("paragraph");
      const paragraph = blocks[0];
      if (paragraph?.type !== "paragraph") return;
      expect(paragraph.content).toContainEqual(
        expect.objectContaining({
          text: "this",
          marks: [{ type: "link", href: "https://example.com" }],
        }),
      );
    });

    it("top-level bare <a>(마커 없음, <p> 밖)도 File로 승격되지 않고 문단으로 남는다", () => {
      const result = importHtml('<a href="https://example.com">plain link</a>');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { blocks } = result.value.document;
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.type).toBe("paragraph");
    });

    it("data-be-media-type 값이 4종 중 하나가 아니면(오타·garbage) File로 승격되지 않는다", () => {
      const result = importHtml(
        '<a href="https://example.com" data-be-media-type="bogus">text</a>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { blocks } = result.value.document;
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.type).toBe("paragraph");
    });
  });

  describe("경고 정확성 — 지원되는 미디어 태그·속성은 raw 오탐을 내지 않는다(G-CNV-002)", () => {
    it.each([
      [
        "file(bare)",
        '<a href="https://example.com/doc.pdf" data-be-block-id="f-1" data-be-media-type="file" data-be-name="문서.pdf">문서.pdf</a>',
      ],
      [
        "image(bare)",
        '<img src="https://example.com/a.png" alt="사진" data-be-block-id="i-1" data-be-media-type="image" data-be-name="사진">',
      ],
      [
        "video(bare)",
        '<video src="https://example.com/a.mp4" controls data-be-block-id="v-1" data-be-media-type="video" data-be-name="영상"></video>',
      ],
      [
        "audio(bare)",
        '<audio src="https://example.com/a.mp3" controls data-be-block-id="au-1" data-be-media-type="audio" data-be-name="소리"></audio>',
      ],
      [
        "image(figure)",
        '<figure data-be-block-id="i-3" data-be-media-type="image" data-be-name="원본이름.png">' +
          '<img src="https://example.com/a.png" alt="설명 캡션">' +
          "<figcaption>설명 캡션</figcaption></figure>",
      ],
      [
        "file(figure)",
        '<figure data-be-block-id="f-3" data-be-media-type="file" data-be-name="문서.pdf">' +
          '<a href="https://example.com/doc.pdf">문서.pdf</a>' +
          "<figcaption>첨부 파일</figcaption></figure>",
      ],
      [
        "image(showPreview:false anchor)",
        '<a href="https://example.com/a.png" data-be-block-id="i-4" data-be-media-type="image" data-be-name="사진" data-be-show-preview="false">사진</a>',
      ],
      [
        "empty image placeholder",
        '<div data-be-block-id="i-8" data-be-media-type="image"></div>',
      ],
    ])("%s는 warnings가 비어 있다", (_label, html) => {
      const result = importHtml(html);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.warnings).toEqual([]);
    });
  });
});
