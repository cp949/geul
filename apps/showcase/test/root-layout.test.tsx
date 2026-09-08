// @vitest-environment jsdom

/**
 * `RootLayout`이 그룹별로 사이드바 메뉴를 렌더링하고 `<Outlet/>` 자리에
 * 현재 라우트의 콘텐츠를 보여주는지 검증한다. 실제 예제 페이지에
 * 의존하지 않도록 픽스처 route 2개로만 확인한다.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { RootLayout } from "../src/root-layout.js";

afterEach(cleanup);

const fixtureRoutes = [
  { path: "alpha", label: "Alpha", group: "Basics" as const },
  { path: "beta", label: "Beta", group: "Toolbars & Menus" as const },
];

describe("RootLayout", () => {
  it("그룹별로 사이드바 메뉴를 렌더링하고 현재 라우트 콘텐츠를 보여준다", () => {
    render(
      <MemoryRouter initialEntries={["/examples/alpha"]}>
        <Routes>
          <Route element={<RootLayout routes={fixtureRoutes} />} path="/">
            <Route element={<p>Alpha content</p>} path="examples/alpha" />
            <Route element={<p>Beta content</p>} path="examples/beta" />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Basics" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Toolbars & Menus" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Alpha" })).toBeTruthy();
    expect(screen.getByText("Alpha content")).toBeTruthy();
  });
});
