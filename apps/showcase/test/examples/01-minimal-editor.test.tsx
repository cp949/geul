// @vitest-environment jsdom

/**
 * Minimal editor 예제 페이지가 크래시 없이 마운트되고, EditorContent가
 * 실제 contenteditable 영역을 만드는지 확인하는 스모크 테스트.
 * FormattingToolbar 등 볼드 토글 같은 기능 동작 자체는
 * packages/react가 이미 검증하므로 여기서 다시 확인하지 않는다.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import MinimalEditorPage from "../../src/examples/01-minimal-editor/page.js";

afterEach(cleanup);

describe("Minimal editor 예제", () => {
  it("에디터가 마운트되고 contenteditable 영역이 생긴다", async () => {
    render(<MinimalEditorPage />);

    const host = screen.getByRole("textbox", { name: "Editor" });
    await waitFor(() => {
      expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
    });
  });
});
