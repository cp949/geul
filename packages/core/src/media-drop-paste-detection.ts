import type { MediaBlockKind } from "./media-block-kind.js";

// 확장자 fallback 목록(그릴링 D3, 2026-09-05, `_works/roadmap/roadmap.md`
// "그릴링 결정" 표). MIME이 image/video/audio 접두사로 신뢰 가능하면 이
// 목록을 보지 않는다 — 이 목록은 MIME이 비어 있거나(브라우저가 인식하지
// 못한 경우) octet-stream류로 신뢰 불가할 때만 쓰는 2차 판정이다.
const EXTENSION_KIND: Readonly<Record<string, MediaBlockKind>> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  bmp: "image",
  ico: "image",
  avif: "image",
  heic: "image",
  heif: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  avi: "video",
  mkv: "video",
  m4v: "video",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  oga: "audio",
  m4a: "audio",
  flac: "audio",
  aac: "audio",
  opus: "audio",
};

// 파일명의 마지막 확장자를 소문자로 반환한다. 확장자가 없거나(점 없음)
// 이름이 점으로 끝나는 경우(빈 확장자)는 undefined다.
const extensionOf = (name: string): string | undefined => {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === name.length - 1) return undefined;
  return name.slice(dotIndex + 1).toLowerCase();
};

// File.type이 image/video/audio 중 하나를 신뢰할 수 있게 보고하는지
// 판정한다. 그 외(빈 문자열, application/octet-stream, 인식 불가 값
// 전부)는 신뢰하지 않고 확장자 fallback으로 넘어간다.
const kindFromMime = (mime: string): MediaBlockKind | undefined => {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return undefined;
};

/**
 * File 객체로부터 MediaBlockKind를 판별한다(그릴링 D3). MIME
 * 접두사(image/video/audio)를 우선 신뢰하고, MIME이 비어 있거나
 * 신뢰할 수 없으면 파일 확장자로 재시도하며, 둘 다 실패하면
 * "file"을 반환한다. 삽입 위치 판정(빈 paragraph 교체, 표 셀·CodeBlock
 * 경계 등)은 이 함수의 책임이 아니다 — RD-001 DELTA-02가 소유한다.
 */
export const detectMediaBlockKind = (file: File): MediaBlockKind => {
  const fromMime = kindFromMime(file.type);
  if (fromMime !== undefined) return fromMime;

  const extension = extensionOf(file.name);
  if (extension !== undefined) {
    const fromExtension = EXTENSION_KIND[extension];
    if (fromExtension !== undefined) return fromExtension;
  }

  return "file";
};

export type DroppedFileEntry = {
  file: File;
  isDirectory: boolean;
};

/**
 * drop 항목 목록에서 디렉터리를 제외한 실제 파일만 입력 순서 그대로
 * 반환한다(그릴링 D8). `isDirectory` 판정 자체(`DataTransferItem
 * .webkitGetAsEntry().isDirectory` 등 브라우저 API 조회)는 이 함수의
 * 호출부(RD-002, 실제 drop 이벤트 배선)가 담당한다 — 이 함수는 이미
 * 판정된 불리언만 입력으로 받는 순수 필터다.
 */
export const filterUploadableFiles = (
  entries: readonly DroppedFileEntry[],
): File[] =>
  entries.filter((entry) => !entry.isDirectory).map((entry) => entry.file);
