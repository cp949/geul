import type { IdFactory } from "./types.js";

declare const crypto: { getRandomValues: (array: Uint8Array) => Uint8Array };

const toHex = (byte: number): string => byte.toString(16).padStart(2, "0");

// crypto.randomUUID는 Chrome92+에서만 지원된다. Chrome75 호환을 위해
// crypto.getRandomValues(모든 대상 브라우저가 지원)만으로 RFC4122 v4
// UUID를 직접 조립한다.
export const createRandomDocumentId: IdFactory = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  // version nibble(4)을 7번째 바이트 상위 4비트에 세팅한다.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  // variant nibble(8~b)을 9번째 바이트 상위 2비트에 세팅한다.
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, toHex).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};
