import type { ComponentType } from "react";

import CompositePage from "./examples/10-composite/page.js";
import DocumentIoPage from "./examples/02-document-io/page.js";
import DictionaryOverridePage from "./examples/09-dictionary-override/page.js";
import EmojiPickerPage from "./examples/08-emoji-picker/page.js";
import FilePanelPage from "./examples/06-file-panel/page.js";
import FormattingToolbarPage from "./examples/03-formatting-toolbar/page.js";
import LinkToolbarPage from "./examples/04-link-toolbar/page.js";
import MediaPage from "./examples/07-media/page.js";
import MinimalEditorPage from "./examples/01-minimal-editor/page.js";
import SlashMenuPage from "./examples/05-slash-menu/page.js";

export type ExampleRouteGroup =
  "Basics" | "Toolbars & Menus" | "Media & Extras" | "Composite";

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
    path: "composite",
    label: "Kitchen sink",
    group: "Composite",
    Page: CompositePage,
  },
];
