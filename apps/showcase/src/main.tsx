import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import "@cp949/geul-react/styles.css";
import "./global.css";
import { RootLayout } from "./root-layout.js";
import { exampleRoutes } from "./routes.js";

const root = document.getElementById("root");
if (root === null) throw new Error("Showcase root element was not found.");

const firstExamplePath = exampleRoutes[0]?.path ?? "";

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout routes={exampleRoutes} />} path="/">
          <Route
            element={<Navigate replace to={`/examples/${firstExamplePath}`} />}
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
