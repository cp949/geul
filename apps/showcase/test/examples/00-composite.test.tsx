// @vitest-environment jsdom

/**
 * Composite(Kitchen sink) 예제가 표면 컴포넌트 전부를 함께 마운트하고도
 * 크래시하지 않는지, 그리고 미리보기/HTML 결과 탭이 `exportHtml()` 출력을
 * 올바르게 보여주는지 확인하는 테스트.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import CompositePage from "../../src/examples/00-composite/page.js";

// 샘플 문서의 표 셀은 불러올 때마다 새 문단 id를 만들어 exportHtml() 결과가
// 매번 달라진다. "html이 같은 재렌더"를 결정적으로 만들려고 일부 테스트에서만
// exportHtml() 출력을 고정한다. 평소에는 실제 구현을 그대로 호출한다.
// `calls`는 호출 횟수다 — 결과 패널이 revision마다 재계산하는지 디바운스로
// 묶는지를 시간이 아니라 작업량으로 단언한다(G-TST-004, PIT-0034).
const exportHtmlStub = vi.hoisted(() => ({
  html: null as string | null,
  calls: 0,
}));

vi.mock("@cp949/geul-io", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cp949/geul-io")>();
  return {
    ...actual,
    exportHtml: (...args: Parameters<typeof actual.exportHtml>) => {
      exportHtmlStub.calls += 1;
      return exportHtmlStub.html === null
        ? actual.exportHtml(...args)
        : { ok: true as const, value: exportHtmlStub.html };
    },
  };
});

// 결과 패널 디바운스 지연(ms). example.tsx의 RESULT_PANEL_DEBOUNCE_MS와 같은 값이다.
const RESULT_PANEL_DEBOUNCE_MS = 200;

/**
 * 디바운스 타이머만 fake로 바꾼다. user-event는 RTL asyncWrapper가 jest 전역을
 * 기대해 vitest fake timers에서 멈추므로 fireEvent로 클릭한다.
 */
const fakeDebounceTimers = () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
};

/**
 * fake timers를 쓴 테스트가 남긴 타이머를 비우고 실시간 타이머로 되돌린다.
 * 다음 테스트로 fake 타이머가 새지 않게 한다(G-TST-003).
 */
const restoreRealTimers = () => {
  vi.clearAllTimers();
  vi.useRealTimers();
};

afterEach(() => {
  exportHtmlStub.html = null;
  exportHtmlStub.calls = 0;
  cleanup();
  restoreRealTimers();
});

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

  it("미리보기 탭이 활성인 동안 HTML 패널은 DOM에 없다", () => {
    // 숨긴 HTML 탭의 Highlight(prism) 렌더가 키 입력마다 도는 비용을
    // 구조로 막는다(타이핑 지연 회귀 방지). 시간 상한이 아니라 마운트
    // 여부를 단언한다(G-TST-004, PIT-0034) — hidden 속성으로 되돌리면
    // 패널이 DOM에 남아 실패한다.
    render(<CompositePage />);

    expect(screen.queryByLabelText("HTML")).toBeNull();
    expect(screen.getByLabelText("미리보기")).not.toBeNull();
  });

  it("HTML 탭으로 전환하면 HTML 패널이 나타나고 미리보기는 DOM에서 빠진다", async () => {
    const user = userEvent.setup();
    render(<CompositePage />);

    await user.click(screen.getByRole("tab", { name: "HTML" }));

    expect(screen.getByLabelText("HTML")).not.toBeNull();
    expect(screen.queryByLabelText("미리보기")).toBeNull();
  });

  it("샘플을 불러온 뒤 HTML 탭으로 전환하면 현재 문서의 HTML이 보인다", async () => {
    const user = userEvent.setup();
    render(<CompositePage />);

    await user.click(screen.getByRole("button", { name: "샘플 불러오기" }));
    await user.click(screen.getByRole("tab", { name: "HTML" }));

    // 결과 패널은 디바운스된 revision을 쓰므로 입력 정지 뒤(200ms)에
    // 반영된다. waitFor 기본 타임아웃(1000ms) 안에서 기다린다.
    await waitFor(() => {
      expect(screen.getByLabelText("HTML").textContent).toContain(
        "샘플 문서 — geul 블록 둘러보기",
      );
    });
    expect(screen.getByLabelText("HTML").textContent).not.toContain(
      "showcase-composite-block-1",
    );
  });

  it("HTML 탭에서 미리보기 탭으로 돌아가면 현재 문서가 미리보기에 다시 마운트된다", async () => {
    const user = userEvent.setup();
    render(<CompositePage />);

    await user.click(screen.getByRole("button", { name: "샘플 불러오기" }));
    await user.click(screen.getByRole("tab", { name: "HTML" }));
    await user.click(screen.getByRole("tab", { name: "미리보기" }));

    await waitFor(() => {
      expect(screen.getByLabelText("미리보기").textContent).toContain(
        "샘플 문서 — geul 블록 둘러보기",
      );
    });
    expect(screen.queryByLabelText("HTML")).toBeNull();
  });

  it("html이 같은 채로 결과 패널이 재렌더돼도 미리보기 DOM을 다시 만들지 않는다", () => {
    // dangerouslySetInnerHTML의 `{ __html }` 객체를 렌더마다 새로 만들면
    // react-dom이 객체 정체성이 달라졌다고 보고 같은 문자열이어도
    // innerHTML을 다시 대입해 자식 DOM을 통째로 재생성한다(타이핑 지연
    // 회귀). 같은 문서를 다시 불러 revision만 올리고(html은 동일) 미리보기
    // 자식 노드의 정체성과 DOM 변경 0건을 단언한다(G-TST-004, PIT-0034 —
    // 시간이 아니라 구조로 막는다). 디바운스 재렌더가 실제로 도달했는지는
    // exportHtml 호출 횟수로 증명한다 — 실시간 대기에 기대면 부하 때 재렌더가
    // 오기 전에 단언해 거짓 통과할 수 있다.
    exportHtmlStub.html = "<h1>제목</h1><h2>소제목</h2><p>본문</p>";
    fakeDebounceTimers();
    render(<CompositePage />);

    fireEvent.click(screen.getByRole("button", { name: "샘플 불러오기" }));
    act(() => {
      vi.advanceTimersByTime(RESULT_PANEL_DEBOUNCE_MS);
    });
    const preview = screen.getByLabelText("미리보기");
    expect(preview.textContent).toContain("소제목");
    const heading = preview.querySelector("h2");
    expect(heading).not.toBeNull();

    // 콜백이 큐를 비우므로 records를 직접 모은다 — await 사이에 콜백이
    // 먼저 돌아 takeRecords()가 빈 배열을 돌려주는 것을 피한다.
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(preview, { childList: true, subtree: true });
    try {
      exportHtmlStub.calls = 0;
      // 같은 문서 재로드 — revision이 올라 부모가 재렌더되지만 html은 같다.
      fireEvent.click(screen.getByRole("button", { name: "샘플 불러오기" }));
      expect(exportHtmlStub.calls).toBe(0);
      act(() => {
        vi.advanceTimersByTime(RESULT_PANEL_DEBOUNCE_MS);
      });
      // 디바운스된 재렌더가 도달해 exportHtml이 다시 불렸다 — 그래도 같은
      // html이라 DOM은 그대로다.
      expect(exportHtmlStub.calls).toBe(1);

      expect(records).toHaveLength(0);
      expect(screen.getByLabelText("미리보기")).toBe(preview);
      expect(preview.querySelector("h2")).toBe(heading);
    } finally {
      observer.disconnect();
    }
  });

  it("revision이 연속으로 올라도 exportHtml은 디바운스 지연 뒤 한 번만 호출된다", () => {
    // 결과 패널이 revision을 디바운스 없이 곧바로 쓰면 샘플을 다시 불러
    // revision이 오를 때마다 exportHtml이 호출된다. 지연 전에는 0회,
    // 지연 뒤 정확히 1회임을 호출 횟수로 단언한다 — 1회는 revision이
    // 실제로 올랐음(0회 아님)과 묶였음(N회 아님)을 함께 증명한다(G-TST-004,
    // PIT-0034).
    fakeDebounceTimers();
    render(<CompositePage />);

    fireEvent.click(screen.getByRole("button", { name: "샘플 불러오기" }));
    act(() => {
      vi.advanceTimersByTime(RESULT_PANEL_DEBOUNCE_MS);
    });
    exportHtmlStub.calls = 0;

    // 클릭 사이에 지연의 절반씩 시간을 흘린다. 앞선 revision의 대기 타이머를
    // 정리하지 않으면 첫 클릭 뒤 200ms 시점에 그 타이머가 먼저 발화해 마지막
    // 변경 전에 exportHtml이 호출된다.
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: "샘플 불러오기" }));
      act(() => {
        vi.advanceTimersByTime(RESULT_PANEL_DEBOUNCE_MS / 2);
      });
    }
    expect(exportHtmlStub.calls).toBe(0);

    // 마지막 클릭부터 지연이 다 차기 직전까지는 호출이 없다.
    act(() => {
      vi.advanceTimersByTime(RESULT_PANEL_DEBOUNCE_MS / 2 - 1);
    });
    expect(exportHtmlStub.calls).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(exportHtmlStub.calls).toBe(1);

    // 더 기다려도 추가 호출은 없다 — 남은 타이머가 재계산을 다시 일으키지 않는다.
    act(() => {
      vi.advanceTimersByTime(RESULT_PANEL_DEBOUNCE_MS * 2);
    });
    expect(exportHtmlStub.calls).toBe(1);
  });

  it("탭을 왕복해 미리보기가 다시 마운트돼도 data-geul-* 스타일이 유지된다", () => {
    // 미리보기는 활성일 때만 마운트돼 탭 왕복마다 DOM이 새로 만들어진다.
    // html이 같아 useLayoutEffect 의존성이 `html`뿐이면 스타일을 다시
    // 입히지 않아 색이 사라진다 — `activeTab` 의존성이 이를 막는다.
    // 텍스트 블록 태그(p, h1~h6 등)는 CSS 속성 선택자가 처리하므로 스타일
    // 대상은 그 밖의 태그(div)다.
    exportHtmlStub.html =
      '<div data-geul-text-color="#ff0000" data-geul-align="center">색 블록</div>';
    fakeDebounceTimers();
    render(<CompositePage />);

    fireEvent.click(screen.getByRole("button", { name: "샘플 불러오기" }));
    act(() => {
      vi.advanceTimersByTime(RESULT_PANEL_DEBOUNCE_MS);
    });
    const firstBlock = screen
      .getByLabelText("미리보기")
      .querySelector<HTMLElement>("div");
    expect(firstBlock?.style.color).toBe("rgb(255, 0, 0)");
    expect(firstBlock?.style.textAlign).toBe("center");

    fireEvent.click(screen.getByRole("tab", { name: "HTML" }));
    fireEvent.click(screen.getByRole("tab", { name: "미리보기" }));

    const remounted = screen
      .getByLabelText("미리보기")
      .querySelector<HTMLElement>("div");
    // 새로 마운트된 DOM이다.
    expect(remounted).not.toBe(firstBlock);
    expect(remounted?.style.color).toBe("rgb(255, 0, 0)");
    expect(remounted?.style.textAlign).toBe("center");
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
