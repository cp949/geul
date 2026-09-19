import type { DOMOutputSpec } from "@tiptap/pm/model";
import { mergeAttributes, Node } from "@tiptap/core";

import type { IframeBlockExtensionOptions } from "./iframe-embed-config.js";
import {
  mediaBlockCommonAttributes,
  nonEmptyString,
  previewAttributes,
} from "./media-block-extension.js";

// CUS-001~004(roadmap Issue #212, spec
// docs/specs/2026-09-19-iframe-block-design.md §3) — iframe은 media
// 5번째 kind다(media-block-kind.ts). media-block-extension.ts의
// ImageBlockExtension과 동일한 "group: block 직접 멤버, atom, addNodeView
// 없는 declarative renderHTML" 패턴을 그대로 따른다(그 파일 상단 주석,
// G-EDT-003) — 별도 NodeView 인프라를 새로 만들지 않는다. parseHTML도
// 선언하지 않는다(media 4종과 동일 근거 — 붙여넣은 원시 HTML은 무시되고
// 실제 HTML round-trip은 io 계층이 담당한다).
//
// sandbox/allow/referrerPolicy는 per-block 저장 필드가 아니라 extension
// options다(spec §1 "그릴링 원안에서 코드 조사로 정정된 지점", §3) — model의
// `IframeEmbedConfig`(iframe-embed-policy.ts)는 URL 허용 여부만 알고 이
// 렌더링 옵션은 모른다. `IframeBlockExtensionOptions` 타입 선언 자체는
// iframe-embed-config.ts로 옮겼다(그 파일 상단 주석 — index.ts가 재노출하는
// `IframeEmbedConfig`가 Tiptap import 없는 파일에 있어야 ADR-0002 공개
// 타입 비노출 계약을 지킨다, public-types.test.ts 실측). host override
// 배선(`iframeEmbed` `EditorController` 옵션 → `.configure()`)은
// production-editor-assembly.ts가 담당한다(RD-002 DELTA-02).

export const DEFAULT_IFRAME_SANDBOX =
  "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms";
export const DEFAULT_IFRAME_ALLOW = "";
export const DEFAULT_IFRAME_REFERRER_POLICY = "strict-origin-when-cross-origin";

// previewWidth 미설정 시 iframe에 적용할 기본 너비(px). image/video는
// previewWidth가 없으면 width 스타일 자체를 내지 않는다(media-block-
// extension.ts previewWidthStyleAttrs) — <img>/<video>는 intrinsic 크기가
// 있어 그래도 된다. iframe은 명시적 width 없이는 브라우저 기본값
// (300x150)으로 찌그러져 항상 값이 필요하다. 640은 16:9에서 360px 높이가
// 나오는 흔한 embed 기본값이다(구현 시점 확정, spec §4 io export 예시와
// 동일 값 — RD-002-DELTA-01.md "결정").
const DEFAULT_IFRAME_WIDTH_PX = 640;

const previewWidthOrDefault = (attrs: Record<string, unknown>): number => {
  const width = attrs.previewWidth;
  return typeof width === "number" && Number.isFinite(width) && width > 0
    ? width
    : DEFAULT_IFRAME_WIDTH_PX;
};

export const IframeBlockExtension = Node.create<IframeBlockExtensionOptions>({
  name: "iframe",
  group: "block",
  atom: true,
  priority: 100,

  addOptions() {
    return {
      sandbox: DEFAULT_IFRAME_SANDBOX,
      allow: DEFAULT_IFRAME_ALLOW,
      referrerPolicy: DEFAULT_IFRAME_REFERRER_POLICY,
    };
  },

  // media 4종 공통 attrs(blockId/url/name/caption/backgroundColor/
  // localPreview 2종) + previewAttributes(showPreview/previewWidth/
  // textAlignment) 전체를 재사용한다(spec §3) — IframeBlock model 타입에는
  // showPreview가 없어 이 attr은 항상 null인 채 쓰이지 않지만, 4종과 동일한
  // attrs 헬퍼를 그대로 재사용하는 쪽이 kind별로 헬퍼를 쪼개는 것보다
  // ADR-0002 "동일 불변식을 여러 패키지가 다시 구현하지 않는다" 원칙에
  // 맞는다. aspectRatio는 iframe 전용(v1 "16:9" 리터럴 고정).
  addAttributes() {
    return {
      ...mediaBlockCommonAttributes(),
      ...previewAttributes(),
      aspectRatio: { default: "16:9", renderHTML: () => ({}) },
    };
  },

  renderHTML({ HTMLAttributes, node }) {
    const src = nonEmptyString(node.attrs.url);
    const name = nonEmptyString(node.attrs.name);
    const iframeChild: DOMOutputSpec[] =
      src === null
        ? []
        : [
            [
              "iframe",
              {
                src,
                sandbox: this.options.sandbox,
                allow: this.options.allow,
                referrerpolicy: this.options.referrerPolicy,
                loading: "lazy",
                title: name ?? "",
                style: `width:${previewWidthOrDefault(node.attrs)}px;max-width:100%;aspect-ratio:16/9`,
              },
            ],
          ];
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        { "data-geul-media-kind": "iframe" },
        src === null ? { "data-geul-media-empty": "iframe" } : {},
      ),
      ...iframeChild,
    ];
  },
});
