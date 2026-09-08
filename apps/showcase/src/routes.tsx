import type { ComponentType } from "react";

import CompositePage from "./examples/00-composite/page.js";
import DocumentIoPage from "./examples/02-document-io/page.js";
import DictionaryOverridePage from "./examples/09-dictionary-override/page.js";
import EmojiPickerPage from "./examples/08-emoji-picker/page.js";
import FilePanelPage from "./examples/06-file-panel/page.js";
import FormattingToolbarPage from "./examples/03-formatting-toolbar/page.js";
import LinkToolbarPage from "./examples/04-link-toolbar/page.js";
import MediaPage from "./examples/07-media/page.js";
import MinimalEditorPage from "./examples/01-minimal-editor/page.js";
import SlashMenuPage from "./examples/05-slash-menu/page.js";
import SyntaxHighlightingLowlightPage from "./examples/10-syntax-highlighting-lowlight/page.js";
import SyntaxHighlightingShikiPage from "./examples/11-syntax-highlighting-shiki/page.js";
import SyntaxHighlightingRefractorPage from "./examples/12-syntax-highlighting-refractor/page.js";
import SyntaxHighlightingLezerPage from "./examples/13-syntax-highlighting-lezer/page.js";

export type ExampleRouteGroup =
  | "Basics"
  | "Toolbars & Menus"
  | "Media & Extras"
  | "Syntax Highlighting"
  | "Composite";

export type ExampleRoute = {
  path: string;
  label: string;
  group: ExampleRouteGroup;
  Page: ComponentType;
};

// Kitchen sink는 Example 0 대표 예제다. 이후 개별 예제를 추가해도 첫 위치를 유지한다.
// 순서가 곧 사이드바 표시 순서다.
export const exampleRoutes: readonly ExampleRoute[] = [
  {
    path: "composite",
    label: "Kitchen sink",
    group: "Composite",
    Page: CompositePage,
  },
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
  {
    path: "link-toolbar",
    label: "Link toolbar",
    group: "Toolbars & Menus",
    Page: LinkToolbarPage,
  },
  {
    path: "slash-menu",
    label: "Slash menu",
    group: "Toolbars & Menus",
    Page: SlashMenuPage,
  },
  {
    path: "file-panel",
    label: "File panel",
    group: "Toolbars & Menus",
    Page: FilePanelPage,
  },
  {
    path: "media",
    label: "Media",
    group: "Media & Extras",
    Page: MediaPage,
  },
  {
    path: "emoji-picker",
    label: "Emoji picker",
    group: "Media & Extras",
    Page: EmojiPickerPage,
  },
  {
    path: "dictionary-override",
    label: "Dictionary override",
    group: "Media & Extras",
    Page: DictionaryOverridePage,
  },
  {
    path: "syntax-highlighting-lowlight",
    label: "Syntax highlighting (lowlight)",
    group: "Syntax Highlighting",
    Page: SyntaxHighlightingLowlightPage,
  },
  {
    path: "syntax-highlighting-shiki",
    label: "Syntax highlighting (shiki)",
    group: "Syntax Highlighting",
    Page: SyntaxHighlightingShikiPage,
  },
  {
    path: "syntax-highlighting-refractor",
    label: "Syntax highlighting (refractor)",
    group: "Syntax Highlighting",
    Page: SyntaxHighlightingRefractorPage,
  },
  {
    path: "syntax-highlighting-lezer",
    label: "Syntax highlighting (lezer)",
    group: "Syntax Highlighting",
    Page: SyntaxHighlightingLezerPage,
  },
];

// showcase 진입 시(index route) 리다이렉트할 기본 예제 경로.
// 사이드바 표시 순서(exampleRoutes 배열 순서)와는 독립적으로 관리한다.
export const defaultExamplePath = "composite";
