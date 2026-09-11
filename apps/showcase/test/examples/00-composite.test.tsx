// @vitest-environment jsdom

/**
 * Composite(Kitchen sink) 예제가 표면 컴포넌트 전부를 함께 마운트하고도
 * 크래시하지 않는지, 그리고 미리보기/HTML 결과 탭이 `exportHtml()` 출력을
 * 올바르게 보여주는지 확인하는 테스트.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import CompositePage from "../../src/examples/00-composite/page.js";

afterEach(cleanup);

describe("Composite(Kitchen sink) 예제", () => {
  it("모든 표면을 함께 마운트해도 에디터가 정상 마운트된다", async () => {
    render(<CompositePage />);

    const host = screen.getByRole("textbox", { name: "Editor" });
    await waitFor(() => {
      expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
    });
  });

  it("결과 탭(미리보기/HTML)이 렌더링되고 기본은 미리보기가 활성 상태다", () => {
    render(<CompositePage />);

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
    render(<CompositePage />);

    await user.click(screen.getByRole("tab", { name: "HTML" }));

    expect(
      screen.getByRole("tab", { name: "HTML" }).getAttribute("aria-selected"),
    ).toBe("true");
    const htmlPanel = screen.getByLabelText("HTML");
    expect(htmlPanel.textContent).toContain("showcase-composite-block-1");
    expect(htmlPanel.textContent).toContain("<p");
  });

  it("복사 버튼을 누르면 HTML 탭 내용이 클립보드로 복사된다", async () => {
    // userEvent.setup()이 navigator.clipboard를 자체 스텁으로 교체하므로
    // (writeToClipboard 옵션), 그 뒤에 스텁의 writeText를 spy한다 — setup()
    // 전에 직접 Object.defineProperty로 넣으면 setup()이 덮어써 무시된다.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<CompositePage />);

    await user.click(screen.getByRole("tab", { name: "HTML" }));
    await user.click(screen.getByRole("button", { name: "복사" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain(
      "showcase-composite-block-1",
    );
  });

  it("미리보기 탭으로 되돌아가면 다시 활성 상태가 된다", async () => {
    const user = userEvent.setup();
    render(<CompositePage />);

    await user.click(screen.getByRole("tab", { name: "HTML" }));
    await user.click(screen.getByRole("tab", { name: "미리보기" }));

    expect(
      screen
        .getByRole("tab", { name: "미리보기" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: "HTML" }).getAttribute("aria-selected"),
    ).toBe("false");
  });
});
