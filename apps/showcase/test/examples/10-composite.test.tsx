// @vitest-environment jsdom

/**
 * Composite(Kitchen sink) 예제가 표면 컴포넌트 전부를 함께 마운트하고도
 * 크래시하지 않는지 확인하는 스모크 테스트.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import CompositePage from "../../src/examples/10-composite/page.js";

afterEach(cleanup);

describe("Composite(Kitchen sink) 예제", () => {
  it("모든 표면을 함께 마운트해도 에디터가 정상 마운트된다", async () => {
    render(<CompositePage />);

    const host = screen.getByRole("textbox", { name: "Editor" });
    await waitFor(() => {
      expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
    });
  });
});
