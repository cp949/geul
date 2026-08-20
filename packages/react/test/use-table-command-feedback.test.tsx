// @vitest-environment jsdom

/**
 * useTableCommandFeedback 훅: 표 명령의 Result를 확인해 성공하면 actionError를
 * 지우고 onSuccess를 호출하며, 실패하면 actionError에 EditorError를 남기고
 * onSuccess를 호출하지 않는다. clearActionError로 명시적으로 지울 수 있다.
 * TableHandleMenu/TableCellFormatMenu/TableSelectionToolbar가 공유한다(Issue #66).
 */

import type { EditorError } from "@cp949/geul-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTableCommandFeedback } from "../src/use-table-command-feedback.js";

afterEach(cleanup);

type ProbeProps = {
  result: { ok: true; value: undefined } | { ok: false; error: EditorError };
  onSuccess?: () => void;
};

const Probe = ({ result, onSuccess }: ProbeProps) => {
  const { actionError, runCommand, clearActionError } =
    useTableCommandFeedback();
  return (
    <div>
      <span data-testid="error-code">{actionError?.code ?? "none"}</span>
      <button onClick={() => runCommand(() => result, onSuccess)} type="button">
        run
      </button>
      <button onClick={clearActionError} type="button">
        clear
      </button>
    </div>
  );
};

describe("useTableCommandFeedback", () => {
  it("성공하면 actionError를 지우고 onSuccess를 호출한다", () => {
    const onSuccess = vi.fn();
    render(
      <Probe onSuccess={onSuccess} result={{ ok: true, value: undefined }} />,
    );

    fireEvent.click(screen.getByText("run"));

    expect(screen.getByTestId("error-code").textContent).toBe("none");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("실패하면 actionError에 에러를 남기고 onSuccess를 호출하지 않는다", () => {
    const onSuccess = vi.fn();
    render(
      <Probe
        onSuccess={onSuccess}
        result={{
          ok: false,
          error: { code: "CELL_NOT_FOUND", cellId: "cell-1" },
        }}
      />,
    );

    fireEvent.click(screen.getByText("run"));

    expect(screen.getByTestId("error-code").textContent).toBe(
      "CELL_NOT_FOUND",
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("clearActionError를 호출하면 actionError가 지워진다", () => {
    render(
      <Probe
        result={{
          ok: false,
          error: { code: "CELL_NOT_FOUND", cellId: "cell-1" },
        }}
      />,
    );
    fireEvent.click(screen.getByText("run"));
    expect(screen.getByTestId("error-code").textContent).toBe(
      "CELL_NOT_FOUND",
    );

    fireEvent.click(screen.getByText("clear"));

    expect(screen.getByTestId("error-code").textContent).toBe("none");
  });

  it("onSuccess 없이 성공해도 에러가 없다", () => {
    render(<Probe result={{ ok: true, value: undefined }} />);

    fireEvent.click(screen.getByText("run"));

    expect(screen.getByTestId("error-code").textContent).toBe("none");
  });
});
