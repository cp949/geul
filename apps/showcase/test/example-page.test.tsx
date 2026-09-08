// @vitest-environment jsdom

/**
 * `ExamplePage`가 제목·설명·라이브 데모·소스코드를 모두 렌더링하는지
 * 검증한다. 소스코드는 prism-react-renderer가 토큰 단위 span으로 쪼개
 * 렌더링하므로 `getByText`(단일 노드 텍스트 매칭)가 아니라 소스 패널의
 * `textContent` 포함 여부로 확인한다.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExamplePage } from "../src/example-shell/example-page.js";

afterEach(cleanup);

describe("ExamplePage", () => {
  it("제목·설명·라이브 데모·소스코드를 함께 렌더링한다", () => {
    render(
      <ExamplePage description="설명 텍스트" source="const x = 1;" title="예제 제목">
        <p>라이브 데모 내용</p>
      </ExamplePage>,
    );

    expect(
      screen.getByRole("heading", { name: "예제 제목" }),
    ).toBeTruthy();
    expect(screen.getByText("설명 텍스트")).toBeTruthy();
    expect(screen.getByText("라이브 데모 내용")).toBeTruthy();
    expect(screen.getByLabelText("소스코드").textContent).toContain(
      "const x = 1;",
    );
  });
});
