// @vitest-environment jsdom

/**
 * File panel 예제가 크래시 없이 마운트되는지 확인하는 스모크 테스트.
 * FilePanel은 미디어 placeholder 블록 선택 시에만 열리므로(사용자가
 * "/"로 이미지를 삽입한 뒤 선택) 여기서는 에디터 마운트만 확인한다.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FilePanelPage from "../../src/examples/06-file-panel/page.js";

afterEach(cleanup);

describe("File panel 예제", () => {
  it("에디터가 마운트되고 contenteditable 영역이 생긴다", async () => {
    render(<FilePanelPage />);

    const host = screen.getByRole("textbox", { name: "Editor" });
    await waitFor(() => {
      expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
    });
  });
});
