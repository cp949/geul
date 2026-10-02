// @vitest-environment jsdom

/**
 * Static toolbar 예제의 결과 패널(샘플 불러오기, 미리보기/HTML 탭)이
 * 00-composite와 같은 동작을 하는지 확인하는 테스트.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import StaticToolbarPage from "../../src/examples/15-static-toolbar/page.js";

afterEach(cleanup);

describe("Static toolbar 예제 결과 패널", () => {
  it("샘플 불러오기·미리보기·HTML 버튼이 렌더링되고 기본은 미리보기가 활성 상태다", () => {
    render(<StaticToolbarPage />);

    expect(screen.getByRole("button", { name: "샘플 불러오기" })).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "미리보기" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: "HTML" }).getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("HTML 탭을 클릭하면 exportHtml() 결과가 pretty-print돼 보인다", async () => {
    const user = userEvent.setup();
    render(<StaticToolbarPage />);

    await user.click(screen.getByRole("tab", { name: "HTML" }));

    const htmlPanel = screen.getByLabelText("HTML");
    expect(htmlPanel.textContent).toContain("showcase-static-toolbar-block-1");
  });

  it("복사 버튼을 누르면 HTML 탭 내용이 클립보드로 복사된다", async () => {
    // userEvent.setup()이 navigator.clipboard를 스텁으로 교체하므로 그
    // 뒤에 writeText를 spy한다(00-composite.test.tsx와 동일).
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<StaticToolbarPage />);

    await user.click(screen.getByRole("tab", { name: "HTML" }));
    await user.click(screen.getByRole("button", { name: "복사" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain(
      "showcase-static-toolbar-block-1",
    );
  });

  it("샘플 불러오기를 누르면 문서가 샘플로 교체돼 미리보기에 반영된다", async () => {
    const user = userEvent.setup();
    render(<StaticToolbarPage />);

    await user.click(screen.getByRole("button", { name: "샘플 불러오기" }));

    await waitFor(() => {
      expect(screen.getByLabelText("미리보기").textContent).toContain(
        "샘플 문서 — geul 블록 둘러보기",
      );
    });
    expect(screen.getByLabelText("미리보기").textContent).not.toContain(
      "문단 1.",
    );
  });
});
