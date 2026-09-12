// @vitest-environment jsdom

/**
 * Composite(Kitchen sink) 예제가 표면 컴포넌트 전부를 함께 마운트하고도
 * 크래시하지 않는지, 그리고 미리보기/HTML 결과 탭이 `exportHtml()` 출력을
 * 올바르게 보여주는지 확인하는 테스트.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

  it("미리보기 컨테이너가 @cp949/geul-io/preview.css의 geul-preview 클래스를 쓴다", () => {
    // RD-001에서 승격된 패키지 CSS(.geul-preview)를 그대로 쓰는지 확인한다
    // — 로컬 사본(.composite-result__preview)으로 되돌아가면 실패해야
    // 한다(Issue #178 RD-002).
    render(<CompositePage />);

    expect(screen.getByLabelText("미리보기").className).toBe("geul-preview");
  });

  it("로컬 CSS는 셸 UI만 남고 미리보기 타이포그래피는 패키지로 넘어갔다", () => {
    // .composite-result__preview 하위 규칙은 RD-001에서
    // @cp949/geul-io/preview.css로 승격됐다 — 로컬에 남아 있으면 두 곳에서
    // 같은 스타일을 유지해야 하는 중복이 생긴다. 탭/에러 배너/HTML 소스
    // 패널 같은 Kitchen sink 셸 UI만 로컬에 남아야 한다.
    // jsdom 테스트 환경은 전역 URL을 jsdom 구현으로 바꿔치기해 `new
    // URL(상대경로, import.meta.url)`이 file: 대신 http:로 풀린다 — 문자열
    // 그대로 fileURLToPath에 넘기고 path.join으로 상대 경로를 붙인다.
    const testDir = dirname(fileURLToPath(import.meta.url));
    const cssPath = join(
      testDir,
      "../../src/examples/00-composite/composite-result.css",
    );
    const css = readFileSync(cssPath, "utf8");

    expect(css).not.toContain("composite-result__preview");
    expect(css).toContain(".composite-result__tablist");
    expect(css).toContain(".composite-result__html");
  });
});
