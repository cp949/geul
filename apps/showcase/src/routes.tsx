import type { ComponentType } from "react";

import DocumentIoPage from "./examples/02-document-io/page.js";
import FormattingToolbarPage from "./examples/03-formatting-toolbar/page.js";
import MinimalEditorPage from "./examples/01-minimal-editor/page.js";

export type ExampleRouteGroup =
  | "Basics"
  | "Toolbars & Menus"
  | "Media & Extras"
  | "Composite";

export type ExampleRoute = {
  path: string;
  label: string;
  group: ExampleRouteGroup;
  Page: ComponentType;
};

// Task 4~13이 항목을 하나씩 append한다. 순서가 곧 사이드바 표시 순서다.
export const exampleRoutes: readonly ExampleRoute[] = [
  {
    path: "minimal-editor",
    label: "Minimal editor",
    group: "Basics",
    Page: MinimalEditorPage,
  },
  {
    path: "document-io",
    label: "Document read/write",
    group: "Basics",
    Page: DocumentIoPage,
  },
  {
    path: "formatting-toolbar",
    label: "Formatting toolbar",
    group: "Toolbars & Menus",
    Page: FormattingToolbarPage,
  },
];
