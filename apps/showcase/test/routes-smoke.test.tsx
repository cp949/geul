// @vitest-environment jsdom

/**
 * exampleRoutes에 등록된 10개 예제 페이지 전부가 MemoryRouter 안에서
 * 크래시 없이 렌더링되는지 한 번에 확인하는 종합 스모크 테스트. 개별
 * 예제의 세부 동작은 각 examples/*.test.tsx가 이미 검증한다 — 여기서는
 * "라우트 등록 자체가 깨지지 않았는가"만 본다.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { defaultExamplePath, exampleRoutes } from "../src/routes.js";

afterEach(cleanup);

describe("exampleRoutes 전체 스모크", () => {
  it("정확히 10개 예제가 등록돼 있다", () => {
    expect(exampleRoutes).toHaveLength(10);
  });

  it("기본 화면 경로가 Kitchen sink(composite)를 가리킨다", () => {
    expect(defaultExamplePath).toBe("composite");
    expect(
      exampleRoutes.find((route) => route.path === defaultExamplePath)?.label,
    ).toBe("Kitchen sink");
  });

  it("Kitchen sink를 Example 0으로 첫 번째에 등록한다", () => {
    expect(exampleRoutes[0]?.path).toBe("composite");
    expect(exampleRoutes[0]?.label).toBe("Kitchen sink");
  });

  it("모든 예제 경로가 서로 다르다", () => {
    expect(new Set(exampleRoutes.map((route) => route.path)).size).toBe(10);
  });

  it.each(exampleRoutes.map((route) => [route.path, route.Page] as const))(
    "%s 라우트가 크래시 없이 렌더링된다",
    async (path, Page) => {
      render(
        <MemoryRouter initialEntries={[`/examples/${path}`]}>
          <Routes>
            <Route element={<Page />} path={`examples/${path}`} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: "Editor" })).toBeTruthy();
      });
    },
  );
});
