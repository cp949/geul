/// <reference types="vite/client" />

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import "@cp949/geul-react/styles.css";
import "./app.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Demo root element was not found.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
