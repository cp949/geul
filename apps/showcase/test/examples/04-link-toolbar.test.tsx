// @vitest-environment jsdom

/**
 * Link toolbar 예제가 마운트되고, "선택한 텍스트에 링크 추가" 버튼이
 * 렌더링되는지 확인하는 스모크 테스트. 실제 선택 상태 없이 버튼을
 * 누르면 setLink가 Result 실패를 돌려주므로 상태 텍스트가 갱신되는지도
 * 함께 확인한다 — 텍스트 선택을 거친 성공 경로는 packages/react가 이미
 * 검증한 로직(setLink)에 위임한다.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import LinkToolbarPage from "../../src/examples/04-link-toolbar/page.js";

afterEach(cleanup);

describe("Link toolbar 예제", () => {
  it("링크 추가 버튼을 누르면 상태 텍스트가 갱신된다", async () => {
    const user = userEvent.setup();
    render(<LinkToolbarPage />);

    await user.click(
      screen.getByRole("button", { name: "선택한 텍스트에 링크 추가" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).not.toBe("");
    });
  });
});
