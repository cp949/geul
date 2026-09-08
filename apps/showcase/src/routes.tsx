import type { ComponentType } from "react";

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
export const exampleRoutes: readonly ExampleRoute[] = [];
