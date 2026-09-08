// @vitest-environment jsdom

/**
 * Emoji picker 예제가 크래시 없이 마운트되는지 확인하는 스모크 테스트.
 * EmojiPicker는 텍스트 안에서 ':' 트리거 입력 시에만 열리므로 여기서는
 * 에디터 마운트만 확인한다.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import EmojiPickerPage from "../../src/examples/08-emoji-picker/page.js";

afterEach(cleanup);

describe("Emoji picker 예제", () => {
  it("에디터가 마운트되고 contenteditable 영역이 생긴다", async () => {
    render(<EmojiPickerPage />);

    const host = screen.getByRole("textbox", { name: "Editor" });
    await waitFor(() => {
      expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
    });
  });
});
