// @vitest-environment jsdom

/**
 * Formatting toolbar 예제가 크래시 없이 마운트되는지 확인하는 스모크
 * 테스트. FormattingToolbar는 텍스트 선택 시에만 렌더링되므로(선택
 * 없는 초기 상태에선 아무것도 그리지 않는다) 여기서는 에디터 마운트만
 * 확인한다 — 볼드 토글 등 실제 동작은 packages/react가 이미 검증한다.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FormattingToolbarPage from "../../src/examples/03-formatting-toolbar/page.js";

afterEach(cleanup);

describe("Formatting toolbar 예제", () => {
  it("에디터가 마운트되고 contenteditable 영역이 생긴다", async () => {
    render(<FormattingToolbarPage />);

    const host = screen.getByRole("textbox", { name: "Editor" });
    await waitFor(() => {
      expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
    });
  });
});
