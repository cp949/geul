import type { CustomTextMark } from "@cp949/geul-model";
import { Mark, mergeAttributes } from "@tiptap/core";

import type { CustomStyleDefinition } from "./editor-controller.js";

// 등록된 커스텀 스타일(spec §4.4, EXT-003)마다 PM Mark를 하나 만든다
// (RD-002-DELTA-19). text-color-mark-extension.ts와 같은 "addAttributes +
// renderHTML" 구조이지만, `CustomStyleDefinition.render`가 raw HTMLElement나
// {className, style} 객체를 반환해(spec §4.4) PM Mark의 배열 기반
// DOMOutputSpec(콘텐츠 hole `0` 필수)으로 변환하는 단계가 하나 더 있다
// (RD-002-DELTA-19.md "결정" 1).
//
// CustomBlockDefinition/CustomInlineContentDefinition과 달리 render()가
// `editor: EditorController`를 받지 않는다(spec §4.4 — 스타일은 값만으로
// 렌더가 결정된다) — customBlocks/customInlineContent의 지연 바인딩 Proxy
// 배선이 이 파일에는 필요 없다.

// CSSStyleDeclaration의 camelCase 프로퍼티 이름(backgroundColor 등)을
// CSS 텍스트가 요구하는 kebab-case(background-color)로 바꾼다. 이미
// kebab-case인 커스텀 프로퍼티(--foo)는 변경하지 않는다.
const cssPropertyName = (property: string): string =>
  property.startsWith("--")
    ? property
    : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const styleObjectToCssText = (
  style: Partial<CSSStyleDeclaration> | undefined,
): string | undefined => {
  if (style === undefined) return undefined;
  const declarations = Object.entries(style)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([property, value]) => `${cssPropertyName(property)}: ${value}`);
  return declarations.length === 0 ? undefined : declarations.join("; ");
};

// render()가 HTMLElement를 반환하면 태그 이름·속성만 추출해 배열 기반
// DOMOutputSpec으로 재구성한다 — 자식 노드는 버린다(Mark는 PM이 감싼
// 콘텐츠를 관리해야 해 NodeView처럼 완성된 DOM 서브트리를 그대로 못 쓴다,
// "결정" 1). 소비자가 element에 자식을 채워 넘기는 오용은 조용히
// 무시한다(에러 아님) — CustomStyleDefinition 계약 문서에 명시한다.
const elementToOutputSpec = (
  element: HTMLElement,
): [string, Record<string, string>, 0] => {
  const attrs: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    attrs[attribute.name] = attribute.value;
  }
  return [element.tagName.toLowerCase(), attrs, 0];
};

export const createCustomStyleMark = (
  type: string,
  definition: CustomStyleDefinition,
) =>
  Mark.create({
    name: type,

    addAttributes() {
      return {
        props: { default: null, rendered: false },
      };
    },

    renderHTML({ mark, HTMLAttributes }) {
      const value: CustomTextMark = {
        type,
        ...(mark.attrs.props === null || mark.attrs.props === undefined
          ? {}
          : {
              props: mark.attrs.props as NonNullable<CustomTextMark["props"]>,
            }),
      };
      const rendered = definition.render(value);
      if (rendered instanceof HTMLElement) {
        const [tag, attrs, hole] = elementToOutputSpec(rendered);
        return [tag, mergeAttributes(HTMLAttributes, attrs), hole];
      }
      const style = styleObjectToCssText(rendered.style);
      return [
        "span",
        mergeAttributes(
          HTMLAttributes,
          rendered.className === undefined ? {} : { class: rendered.className },
          style === undefined ? {} : { style },
        ),
        0,
      ];
    },
  });
