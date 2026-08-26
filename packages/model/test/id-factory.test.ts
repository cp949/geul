/**
 * Chrome75 호환 RFC4122 v4 id 생성 함수(createRandomDocumentId)의 계약과
 * createEmptyDocument 기본값 경로를 검증한다.
 */
import { describe, expect, it } from "vitest";

import {
  createEmptyDocument,
  createRandomDocumentId,
  isValidDocumentId,
} from "../src/index.js";

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createRandomDocumentId", () => {
  it("호출마다 isValidDocumentId를 통과하는 비어있지 않은 문자열을 반환한다", () => {
    const id = createRandomDocumentId();

    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(isValidDocumentId(id)).toBe(true);
  });

  it("1,000회 호출한 결과에 중복이 없다", () => {
    const ids = Array.from({ length: 1000 }, () => createRandomDocumentId());

    expect(new Set(ids).size).toBe(1000);
  });

  it("RFC4122 v4 UUID 형식을 만족한다", () => {
    const id = createRandomDocumentId();

    expect(id).toMatch(uuidV4Pattern);
  });
});

describe("createEmptyDocument 기본값 경로", () => {
  it("인자 없이 호출하면 반환된 블록의 id가 isValidDocumentId를 통과하고 UUID v4 형식이다", () => {
    const document = createEmptyDocument();
    const block = document.blocks[0];
    if (block === undefined) throw new Error("Expected a block");

    expect(isValidDocumentId(block.id)).toBe(true);
    expect(block.id).toMatch(uuidV4Pattern);
  });
});
