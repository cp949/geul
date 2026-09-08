// @vitest-environment jsdom

/**
 * Document 읽기/쓰기 예제가 마운트되고, "Export JSON" 클릭 시 textarea에
 * 문서 JSON이 채워지는지 확인하는 스모크 테스트.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "@testing-library/user-event";

import DocumentIoPage from "../../src/examples/02-document-io/page.js";

afterEach(cleanup);

describe("Document 읽기/쓰기 예제", () => {
  it("Export JSON을 누르면 textarea에 문서 JSON이 채워진다", async () => {
    const user = userEvent.setup();
    render(<DocumentIoPage />);

    await user.click(screen.getByRole("button", { name: "Export JSON" }));

    await waitFor(() => {
      const textarea = screen.getByLabelText<HTMLTextAreaElement>(
        "Document JSON",
      );
      expect(textarea.value).toContain("\"revision\"");
    });
  });
});
