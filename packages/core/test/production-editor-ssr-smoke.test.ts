// @vitest-environment node
/**
 * `createEditor()`가 `document` 전역이 없는 순수 Node 환경(SSR)에서
 * 크래시하지 않음을 고정한다(`EXT-013`, spec §11.2, R4 슬라이스8 RD-001).
 * `packages/core/test`는 기본 jsdom 환경이라(`vitest.config.ts`) 이 파일만
 * 위 주석으로 node 환경을 강제해 `document`가 실제로 없는 상태를 재현한다
 * — `packages/react/test`의 반대 방향(`// @vitest-environment jsdom`) 오버라이드
 * 관례와 같은 메커니즘이다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";

const paragraphOnlyDocument: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [{ id: "p1", type: "paragraph", content: [] }],
};

// 로드 시점 trailing paragraph 정규화(UI-010) 대상 — heading으로 끝나
// document 있음 환경(jsdom)이라면 정규화가 즉시 반영된다
// (trailing-block-extension.test.ts 참고).
const headingOnlyDocument: Document = {
  formatVersion: 1,
  revision: 0,
  blocks: [
    { id: "h1", type: "heading", level: 1, content: [{ text: "title" }] },
  ],
};

describe("createEditor() — document 없는 Node 환경(SSR)", () => {
  it("이 테스트 파일 환경에는 실제로 document 전역이 없다", () => {
    expect(typeof document).toBe("undefined");
  });

  it("document 없는 환경에서 크래시하지 않는다", () => {
    expect(() =>
      createEditor({ initialDocument: paragraphOnlyDocument }),
    ).not.toThrow();
  });

  it("document 없는 환경에서는 로드 시점 trailing paragraph 정규화가 아직 적용되지 않는다(알려진 제약 — 실제 client mount 시점에 적용)", () => {
    const editor = createEditor({ initialDocument: headingOnlyDocument });
    expect(editor.getDocument().blocks).toEqual(headingOnlyDocument.blocks);
  });

  it("document 없는 환경에서 생성한 controller의 destroy()도 크래시하지 않는다", () => {
    const editor = createEditor({ initialDocument: paragraphOnlyDocument });
    expect(() => editor.destroy()).not.toThrow();
  });
});
