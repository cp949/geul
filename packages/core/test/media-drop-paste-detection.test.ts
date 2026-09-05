/**
 * media-drop-paste-detection.ts의 순수 판별 함수를 검증한다(RD-001
 * DELTA-01, roadmap `_works/roadmap/RD-001.md`). File 객체로부터
 * MediaBlockKind를 판별하는 detectMediaBlockKind와, drop 항목 중
 * 디렉터리를 걸러내는 filterUploadableFiles만 다룬다 — 실제 drop/paste
 * DOM 이벤트 배선과 삽입 위치 판정은 RD-002가 소유한다.
 */
import { describe, expect, it } from "vitest";

import {
  detectMediaBlockKind,
  filterUploadableFiles,
} from "../src/media-drop-paste-detection.js";

/**
 * 이름·MIME 타입만 지정한 File을 만든다. 내용(bytes)은 판별에 관여하지
 * 않아 항상 빈 배열로 채운다.
 */
const fileOf = (name: string, type: string): File =>
  new File([], name, { type });

describe("detectMediaBlockKind — MIME 우선, 확장자 fallback", () => {
  it("MIME이 image/*면 확장자와 무관하게 image로 판별한다", () => {
    expect(detectMediaBlockKind(fileOf("weird.txt", "image/png"))).toBe(
      "image",
    );
  });

  it("MIME이 video/*면 확장자와 무관하게 video로 판별한다", () => {
    expect(detectMediaBlockKind(fileOf("weird.txt", "video/mp4"))).toBe(
      "video",
    );
  });

  it("MIME이 audio/*면 확장자와 무관하게 audio로 판별한다", () => {
    expect(detectMediaBlockKind(fileOf("weird.txt", "audio/mpeg"))).toBe(
      "audio",
    );
  });

  const IMAGE_EXTENSIONS = [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "bmp",
    "ico",
    "avif",
    "heic",
    "heif",
  ];
  const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "avi", "mkv", "m4v"];
  const AUDIO_EXTENSIONS = [
    "mp3",
    "wav",
    "ogg",
    "oga",
    "m4a",
    "flac",
    "aac",
    "opus",
  ];

  it.each(IMAGE_EXTENSIONS)(
    "MIME이 빈 문자열이면 .%s 확장자를 image로 판별한다",
    (ext) => {
      expect(detectMediaBlockKind(fileOf(`photo.${ext}`, ""))).toBe("image");
    },
  );

  it.each(VIDEO_EXTENSIONS)(
    "MIME이 빈 문자열이면 .%s 확장자를 video로 판별한다",
    (ext) => {
      expect(detectMediaBlockKind(fileOf(`clip.${ext}`, ""))).toBe("video");
    },
  );

  it.each(AUDIO_EXTENSIONS)(
    "MIME이 빈 문자열이면 .%s 확장자를 audio로 판별한다",
    (ext) => {
      expect(detectMediaBlockKind(fileOf(`track.${ext}`, ""))).toBe("audio");
    },
  );

  it("MIME이 application/octet-stream이면 확장자로 fallback한다", () => {
    expect(
      detectMediaBlockKind(fileOf("photo.png", "application/octet-stream")),
    ).toBe("image");
  });

  it("확장자 대소문자를 구분하지 않는다", () => {
    expect(detectMediaBlockKind(fileOf("PHOTO.PNG", ""))).toBe("image");
  });

  it("MIME도 확장자도 매핑되지 않으면 file로 판별한다", () => {
    expect(detectMediaBlockKind(fileOf("archive.zip", ""))).toBe("file");
  });

  it("확장자가 없는 파일명도 file로 판별한다", () => {
    expect(detectMediaBlockKind(fileOf("README", ""))).toBe("file");
  });

  it("이름이 점으로 끝나도 file로 판별한다(빈 확장자)", () => {
    expect(detectMediaBlockKind(fileOf("noext.", ""))).toBe("file");
  });
});

describe("filterUploadableFiles — 디렉터리 항목 제외", () => {
  it("디렉터리 항목을 제외하고 파일만 남긴다", () => {
    const a = fileOf("a.png", "image/png");
    const b = fileOf("b.mp3", "audio/mpeg");
    const result = filterUploadableFiles([
      { file: a, isDirectory: false },
      { file: fileOf("folder", ""), isDirectory: true },
      { file: b, isDirectory: false },
    ]);
    expect(result).toEqual([a, b]);
  });

  it("입력 순서를 보존한다", () => {
    const first = fileOf("1.png", "image/png");
    const second = fileOf("2.png", "image/png");
    const third = fileOf("3.png", "image/png");
    const result = filterUploadableFiles([
      { file: first, isDirectory: false },
      { file: second, isDirectory: false },
      { file: third, isDirectory: false },
    ]);
    expect(result).toEqual([first, second, third]);
  });

  it("전부 디렉터리면 빈 배열을 반환한다", () => {
    const result = filterUploadableFiles([
      { file: fileOf("folder1", ""), isDirectory: true },
      { file: fileOf("folder2", ""), isDirectory: true },
    ]);
    expect(result).toEqual([]);
  });

  it("빈 입력이면 빈 배열을 반환한다", () => {
    expect(filterUploadableFiles([])).toEqual([]);
  });
});
