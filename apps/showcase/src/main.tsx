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
