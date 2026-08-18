import type { Schema } from "hast-util-sanitize";

export const htmlAllowedAttributes: Record<string, string[]> = {
  "*": [],
  a: ["href"],
  col: ["width", "dataBeColumnId", "dataBeWidth"],
  h1: ["dataBeBlockId"],
  h2: ["dataBeBlockId"],
  h3: ["dataBeBlockId"],
  p: ["dataBeBlockId"],
  table: ["dataBeBlockId", "dataBeHeaderRows", "dataBeHeaderColumns"],
  td: [
    "rowSpan",
    "colSpan",
    "scope",
    "dataBeCellId",
    "dataBeColumnId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeAlign",
  ],
  th: [
    "rowSpan",
    "colSpan",
    "scope",
    "dataBeCellId",
    "dataBeColumnId",
    "dataBeTextColor",
    "dataBeBackgroundColor",
    "dataBeAlign",
  ],
  tr: ["dataBeRowId"],
};

export const htmlStrippedTagNames = [
  "script",
  "style",
  "svg",
  "math",
  "iframe",
  "object",
  "embed",
  "template",
];

export const htmlAllowedTagNames = [
  "p",
  "h1",
  "h2",
  "h3",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "a",
  "br",
  "table",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

export const htmlSanitizeSchema: Schema = {
  allowComments: false,
  allowDoctypes: false,
  ancestors: {
    col: ["table"],
    colgroup: ["table"],
    tbody: ["table"],
    td: ["table"],
    th: ["table"],
    thead: ["table"],
    tr: ["table"],
  },
  attributes: htmlAllowedAttributes,
  clobber: [],
  protocols: {
    href: ["http", "https", "mailto", "tel"],
  },
  required: {},
  strip: htmlStrippedTagNames,
  tagNames: htmlAllowedTagNames,
};
