import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@cp949/geul-react/styles.css";
import "./global.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Showcase root element was not found.");

createRoot(root).render(
  <StrictMode>
    <p>Geul Showcase</p>
  </StrictMode>,
);
