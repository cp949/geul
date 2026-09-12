// Chrome 75 사용처 재현: 디펜던시가 쓰는 런타임 API(예: refractor/lowlight의
// Object.hasOwn)는 사용처 core-js가 채운다(ADR-0009, apps/demo/src/main.tsx와
// 동일 패턴). 반드시 첫 import여야 이후 모듈 평가 전에 polyfill이 설치된다.
import "core-js/stable";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import "@cp949/geul-react/styles.css";
import "./global.css";
import { RootLayout } from "./root-layout.js";
import { defaultExamplePath, exampleRoutes } from "./routes.js";

const root = document.getElementById("root");
if (root === null) throw new Error("Showcase root element was not found.");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout routes={exampleRoutes} />} path="/">
          <Route
            element={
              <Navigate replace to={`/examples/${defaultExamplePath}`} />
            }
            index
          />
          {exampleRoutes.map(({ path, Page }) => (
            <Route element={<Page />} key={path} path={`examples/${path}`} />
          ))}
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
