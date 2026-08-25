/// <reference types="vite/client" />

// Chrome 75 사용처 재현: 디펜던시가 쓰는 런타임 API(예: @tiptap/core의
// Array.prototype.findLast)는 사용처 core-js가 채운다(ADR-0009, cp949/geul#122).
// 반드시 첫 import여야 이후 모듈 평가 전에 polyfill이 설치된다.
import "core-js/stable";

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
