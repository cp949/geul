import type { HtmlElementNode } from "./inline-content.js";

export const childElements = (
  element: HtmlElementNode,
  tagName?: string,
): HtmlElementNode[] =>
  element.children.filter(
    (child): child is HtmlElementNode =>
      child.type === "element" &&
      (tagName === undefined || child.tagName === tagName),
  );

export const propertyString = (
  element: HtmlElementNode,
  name: string,
): string | undefined => {
  const value = element.properties[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const propertyInteger = (
  element: HtmlElementNode,
  name: string,
  fallback: number,
): number => {
  const value = element.properties[name];
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
};
