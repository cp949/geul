// @vitest-environment jsdom

/**
 * Media 예제가 크래시 없이 마운트되는지 확인하는 스모크 테스트. 업로드
 * mock의 성공/실패 분기 자체는 이 파일이 재검증하지 않는다 —
 * apps/demo의 e2e(media-upload.spec.ts)가 이미 같은 기법으로 검증한다.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import MediaPage from "../../src/examples/07-media/page.js";

afterEach(cleanup);

describe("Media 예제", () => {
  it("에디터가 마운트되고 contenteditable 영역이 생긴다", async () => {
    render(<MediaPage />);

    const host = screen.getByRole("textbox", { name: "Editor" });
    await waitFor(() => {
      expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
    });
  });
});
