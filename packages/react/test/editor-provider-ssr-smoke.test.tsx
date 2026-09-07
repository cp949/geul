/**
 * `EditorProvider`가 `document` 전역 없는 순수 Node 환경(SSR)에서
 * 크래시하지 않고, 서버 렌더 결과에 editor DOM을 포함하지 않음을
 * 고정한다(`EXT-013`, spec §11.3, R4 슬라이스8 RD-002).
 * `packages/react/test`는 기본 node 환경이라(`vitest.config.ts`) 이
 * 파일은 별도 환경 오버라이드가 필요 없다 — 실제 `document`가 없는
 * 상태 그대로 실행된다.
 *
 * `EditorProvider`는 `createEditor()`(내부 상태 초기화)를 render가 아닌
 * `useEffect` 안에서만 호출한다(`editor-provider.tsx`) — `useEffect`는
 * `react-dom/server`의 `renderToString`에서 절대 실행되지 않으므로,
 * 소비자가 별도 client-only guard를 직접 작성하지 않아도 서버 렌더
 * 단계에서 `EditorProvider`는 항상 `null`을 반환한다(내부 자체 guard).
 * 이 사실이 `packages/react/README.md`의 Next.js 통합 가이드 근거다.
 */
import type { CreateEditorOptions } from "@cp949/geul-core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorContent, EditorProvider } from "../src/index.js";

const initialDocument: CreateEditorOptions["initialDocument"] = {
  formatVersion: 1,
  revision: 0,
  blocks: [{ id: "ssr-fixture-block-1", type: "paragraph", content: [] }],
};

describe("EditorProvider — document 없는 Node 환경(SSR)", () => {
  it("이 테스트 파일 환경에는 실제로 document 전역이 없다", () => {
    expect(typeof document).toBe("undefined");
  });

  it("renderToString이 크래시하지 않는다", () => {
    expect(() =>
      renderToString(
        <EditorProvider initialDocument={initialDocument}>
          <EditorContent />
        </EditorProvider>,
      ),
    ).not.toThrow();
  });

  it("서버 렌더 결과는 editor DOM을 전혀 포함하지 않는다(내부 useEffect 게이트로 인해 EditorProvider가 항상 null을 반환)", () => {
    const html = renderToString(
      <EditorProvider initialDocument={initialDocument}>
        <EditorContent />
      </EditorProvider>,
    );
    expect(html).toBe("");
  });
});
