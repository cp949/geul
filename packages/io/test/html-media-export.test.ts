/**
 * 4종 미디어 블록(file/image/video/audio)의 HTML outbound 의미를 검증한다
 * (spec §7.1). `<figure>`/`<figcaption>`(caption 있을 때만),
 * `<img>`/`<video>`/`<audio>`/`<a>` 매핑과 `data-geul-*`(block-id/media-type/
 * name/background-color/show-preview/preview-width/text-alignment) 속성을
 * 다룬다. import·round-trip은 RD-001-DELTA-02·03가 다룬다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml } from "../src/index.js";

const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

describe("미디어 블록 HTML 내보내기", () => {
  describe("caption 없음 — bare 시각 태그가 data-geul-*를 직접 갖는다", () => {
    it("file은 <a href>name</a> + data-geul-block-id/media-type/name을 낸다", () => {
      const result = exportHtml(
        documentOf({
          id: "f-1",
          type: "file",
          url: "https://example.com/doc.pdf",
          name: "문서.pdf",
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<a href="https://example.com/doc.pdf" data-geul-block-id="f-1" data-geul-media-type="file" data-geul-name="문서.pdf">문서.pdf</a>',
      });
    });

    it("image는 <img src alt>를 낸다(alt는 name)", () => {
      const result = exportHtml(
        documentOf({
          id: "i-1",
          type: "image",
          url: "https://example.com/a.png",
          name: "사진",
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<img src="https://example.com/a.png" alt="사진" data-geul-block-id="i-1" data-geul-media-type="image" data-geul-name="사진">',
      });
    });

    it("video는 <video src controls>를 낸다", () => {
      const result = exportHtml(
        documentOf({
          id: "v-1",
          type: "video",
          url: "https://example.com/a.mp4",
          name: "영상",
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<video src="https://example.com/a.mp4" controls data-geul-block-id="v-1" data-geul-media-type="video" data-geul-name="영상"></video>',
      });
    });

    it("audio는 <audio src controls>를 낸다", () => {
      const result = exportHtml(
        documentOf({
          id: "au-1",
          type: "audio",
          url: "https://example.com/a.mp3",
          name: "소리",
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<audio src="https://example.com/a.mp3" controls data-geul-block-id="au-1" data-geul-media-type="audio" data-geul-name="소리"></audio>',
      });
    });

    it("name·caption이 둘 다 없으면 image의 alt는 빈 문자열, file 텍스트는 url이다", () => {
      const result = exportHtml(
        documentOf({
          id: "f-2",
          type: "file",
          url: "https://example.com/x",
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<a href="https://example.com/x" data-geul-block-id="f-2" data-geul-media-type="file">https://example.com/x</a>',
      });

      const imageResult = exportHtml(
        documentOf({ id: "i-2", type: "image", url: "https://example.com/y" }),
      );
      expect(imageResult).toEqual({
        ok: true,
        value:
          '<img src="https://example.com/y" alt="" data-geul-block-id="i-2" data-geul-media-type="image">',
      });
    });
  });

  describe("caption 있음 — <figure>로 감싸고 data-geul-*는 figure가 갖는다", () => {
    it("image + caption + name: alt는 caption을 쓰고 data-geul-name은 name을 유지한다(둘 다 보존)", () => {
      const result = exportHtml(
        documentOf({
          id: "i-3",
          type: "image",
          url: "https://example.com/a.png",
          name: "원본이름.png",
          caption: "설명 캡션",
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<figure data-geul-block-id="i-3" data-geul-media-type="image" data-geul-name="원본이름.png">' +
          '<img src="https://example.com/a.png" alt="설명 캡션">' +
          "<figcaption>설명 캡션</figcaption></figure>",
      });
    });

    it("file + caption: <a>는 data-geul-*를 갖지 않고 figure가 갖는다", () => {
      const result = exportHtml(
        documentOf({
          id: "f-3",
          type: "file",
          url: "https://example.com/doc.pdf",
          name: "문서.pdf",
          caption: "첨부 파일",
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<figure data-geul-block-id="f-3" data-geul-media-type="file" data-geul-name="문서.pdf">' +
          '<a href="https://example.com/doc.pdf">문서.pdf</a>' +
          "<figcaption>첨부 파일</figcaption></figure>",
      });
    });
  });

  describe("showPreview:false — 시각 태그 대신 <a>를 낸다", () => {
    it("image의 showPreview:false는 <a href>name</a>로 강등된다(caption 없음)", () => {
      const result = exportHtml(
        documentOf({
          id: "i-4",
          type: "image",
          url: "https://example.com/a.png",
          name: "사진",
          showPreview: false,
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<a href="https://example.com/a.png" data-geul-block-id="i-4" data-geul-media-type="image" data-geul-name="사진" data-geul-show-preview="false">사진</a>',
      });
    });

    it("video의 showPreview:false + caption은 figure 안에서도 <a>로 강등된다", () => {
      const result = exportHtml(
        documentOf({
          id: "v-2",
          type: "video",
          url: "https://example.com/a.mp4",
          caption: "영상 설명",
          showPreview: false,
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<figure data-geul-block-id="v-2" data-geul-media-type="video" data-geul-show-preview="false">' +
          '<a href="https://example.com/a.mp4">https://example.com/a.mp4</a>' +
          "<figcaption>영상 설명</figcaption></figure>",
      });
    });

    it("audio의 showPreview:false도 <a>로 강등된다", () => {
      const result = exportHtml(
        documentOf({
          id: "au-2",
          type: "audio",
          url: "https://example.com/a.mp3",
          showPreview: false,
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<a href="https://example.com/a.mp3" data-geul-block-id="au-2" data-geul-media-type="audio" data-geul-show-preview="false">https://example.com/a.mp3</a>',
      });
    });

    it("showPreview:true(명시)는 정상 시각 태그를 유지한다", () => {
      const result = exportHtml(
        documentOf({
          id: "i-5",
          type: "image",
          url: "https://example.com/a.png",
          showPreview: true,
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<img src="https://example.com/a.png" alt="" data-geul-block-id="i-5" data-geul-media-type="image" data-geul-show-preview="true">',
      });
    });
  });

  describe("타입별 속성 제약 — previewWidth/textAlignment는 image/video만, showPreview는 file 제외", () => {
    it("image의 previewWidth·textAlignment가 data-geul-*로 나온다", () => {
      const result = exportHtml(
        documentOf({
          id: "i-6",
          type: "image",
          url: "https://example.com/a.png",
          previewWidth: 320,
          textAlignment: "center",
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<img src="https://example.com/a.png" alt="" data-geul-block-id="i-6" data-geul-media-type="image" data-geul-preview-width="320" data-geul-text-alignment="center">',
      });
    });

    it("video의 previewWidth·textAlignment가 data-geul-*로 나온다", () => {
      const result = exportHtml(
        documentOf({
          id: "v-3",
          type: "video",
          url: "https://example.com/a.mp4",
          previewWidth: 480,
          textAlignment: "right",
        }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<video src="https://example.com/a.mp4" controls data-geul-block-id="v-3" data-geul-media-type="video" data-geul-preview-width="480" data-geul-text-alignment="right"></video>',
      });
    });

    it("audio·file은 previewWidth/textAlignment 필드 자체가 없어 data-geul-*가 나오지 않는다(audio는 showPreview만)", () => {
      const audioResult = exportHtml(
        documentOf({
          id: "au-3",
          type: "audio",
          url: "https://example.com/a.mp3",
          showPreview: true,
        }),
      );
      expect(audioResult).toEqual({
        ok: true,
        value:
          '<audio src="https://example.com/a.mp3" controls data-geul-block-id="au-3" data-geul-media-type="audio" data-geul-show-preview="true"></audio>',
      });
    });
  });

  describe("backgroundColor — 4종 공통", () => {
    it.each([
      [
        "file",
        { id: "f-4", type: "file" as const, url: "https://example.com/x" },
      ],
      [
        "image",
        { id: "i-7", type: "image" as const, url: "https://example.com/x" },
      ],
      [
        "video",
        { id: "v-4", type: "video" as const, url: "https://example.com/x" },
      ],
      [
        "audio",
        { id: "au-4", type: "audio" as const, url: "https://example.com/x" },
      ],
    ])("%s에 data-geul-background-color가 붙는다", (_label, block) => {
      const result = exportHtml(
        documentOf({ ...block, backgroundColor: "#FF0000" }),
      );
      expect(result.ok).toBe(true);
      expect((result as { ok: true; value: string }).value).toContain(
        'data-geul-background-color="#FF0000"',
      );
    });
  });

  describe("url 없는 빈 미디어 블록 — 크래시 없이 최소 형태로 보존한다", () => {
    it("caption 없는 빈 image는 <div data-geul-block-id data-geul-media-type>만 낸다", () => {
      const result = exportHtml(documentOf({ id: "i-8", type: "image" }));
      expect(result).toEqual({
        ok: true,
        value:
          '<div data-geul-block-id="i-8" data-geul-media-type="image"></div>',
      });
    });

    it("caption 있는 빈 file은 <div>...<figcaption>만 낸다(시각 태그 없음)", () => {
      const result = exportHtml(
        documentOf({ id: "f-5", type: "file", caption: "예정된 첨부" }),
      );
      expect(result).toEqual({
        ok: true,
        value:
          '<div data-geul-block-id="f-5" data-geul-media-type="file"><figcaption>예정된 첨부</figcaption></div>',
      });
    });
  });
});
