/**
 * iframe-block-extension.ts의 renderHTML을 검증한다(roadmap Issue #212
 * RD-002 DELTA-01, spec docs/specs/2026-09-19-iframe-block-design.md §3).
 * media-block-extension.test.ts와 같은 방식으로 model 문서를 직접 구성해
 * production `createEditor()`에 로드하고 `editor.view.dom` 렌더 결과를
 * 단언한다. `setIframeSrc` 명령을 거치지 않고도 검증 가능하다 —
 * `CreateEditorOptions.iframeEmbed`(host override, RD-002 DELTA-02) 배선은
 * 이 파일 마지막 describe가 다루고, `setIframeSrc`의 URL 허용 판정 자체는
 * editor-controller-media-commands.test.ts가 소유한다.
 */
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import {
  DEFAULT_IFRAME_ALLOW,
  DEFAULT_IFRAME_REFERRER_POLICY,
  DEFAULT_IFRAME_SANDBOX,
} from "../src/iframe-block-extension.js";
import {
  documentOf,
  mediaBlock,
  mountTiptapEditor,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const mountedDom = (props?: Parameters<typeof mediaBlock>[2]) => {
  const editor = createEditor({
    initialDocument: documentOf(
      mediaBlock("iframe", "iframe-1", props),
      tailParagraphBlock,
    ),
    createId: sequentialIds("id"),
  });
  return mountTiptapEditor(editor).tiptap.view.dom;
};

describe("iframe 렌더링 — 빈 상태(src 없음)", () => {
  it("data-geul-media-kind·data-geul-media-empty를 iframe으로 내고 iframe 태그를 렌더하지 않는다", () => {
    const dom = mountedDom();
    const wrapper = dom.querySelector('[data-geul-block-id="iframe-1"]');
    expect(wrapper?.getAttribute("data-geul-media-kind")).toBe("iframe");
    expect(wrapper?.getAttribute("data-geul-media-empty")).toBe("iframe");
    expect(wrapper?.querySelector("iframe")).toBeNull();
  });
});

describe("iframe 렌더링 — 채워진 상태(src 있음)", () => {
  it("src를 그대로 반영하고 data-geul-media-empty를 내지 않는다", () => {
    const dom = mountedDom({ url: "https://www.youtube.com/embed/x" });
    const wrapper = dom.querySelector('[data-geul-block-id="iframe-1"]');
    const iframe = wrapper?.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("https://www.youtube.com/embed/x");
    expect(wrapper?.hasAttribute("data-geul-media-empty")).toBe(false);
  });

  it("sandbox/allow/referrerpolicy/loading을 extension 기본값으로 낸다", () => {
    const dom = mountedDom({ url: "https://www.youtube.com/embed/x" });
    const iframe = dom.querySelector('[data-geul-block-id="iframe-1"] iframe');
    expect(iframe?.getAttribute("sandbox")).toBe(DEFAULT_IFRAME_SANDBOX);
    expect(iframe?.getAttribute("allow")).toBe(DEFAULT_IFRAME_ALLOW);
    expect(iframe?.getAttribute("referrerpolicy")).toBe(
      DEFAULT_IFRAME_REFERRER_POLICY,
    );
    expect(iframe?.getAttribute("loading")).toBe("lazy");
  });

  it("name을 title로 쓰고 없으면 빈 문자열을 낸다", () => {
    const named = mountedDom({
      url: "https://www.youtube.com/embed/x",
      name: "설명 영상",
    });
    expect(
      named
        .querySelector('[data-geul-block-id="iframe-1"] iframe')
        ?.getAttribute("title"),
    ).toBe("설명 영상");

    const unnamed = mountedDom({ url: "https://www.youtube.com/embed/x" });
    expect(
      unnamed
        .querySelector('[data-geul-block-id="iframe-1"] iframe')
        ?.getAttribute("title"),
    ).toBe("");
  });

  it("previewWidth가 없으면 기본 640px width 스타일을 낸다", () => {
    const dom = mountedDom({ url: "https://www.youtube.com/embed/x" });
    const iframe = dom.querySelector<HTMLElement>(
      '[data-geul-block-id="iframe-1"] iframe',
    );
    expect(iframe?.style.width).toBe("640px");
  });

  it("previewWidth가 있으면 그 값을 width 스타일로 낸다", () => {
    const dom = mountedDom({
      url: "https://www.youtube.com/embed/x",
      previewWidth: 320,
    });
    const iframe = dom.querySelector<HTMLElement>(
      '[data-geul-block-id="iframe-1"] iframe',
    );
    expect(iframe?.style.width).toBe("320px");
  });

  it("aspect-ratio를 항상 16/9로 낸다", () => {
    const dom = mountedDom({ url: "https://www.youtube.com/embed/x" });
    const iframe = dom.querySelector<HTMLElement>(
      '[data-geul-block-id="iframe-1"] iframe',
    );
    expect(iframe?.style.aspectRatio).toBe("16/9");
  });
});

describe("iframe 렌더링 — host override(RD-002 DELTA-02, CreateEditorOptions.iframeEmbed)", () => {
  const mountedDomWithIframeEmbed = (
    iframeEmbed: Parameters<typeof createEditor>[0]["iframeEmbed"],
  ) => {
    const editor = createEditor({
      initialDocument: documentOf(
        mediaBlock("iframe", "iframe-1", {
          url: "https://www.youtube.com/embed/x",
        }),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
      ...(iframeEmbed === undefined ? {} : { iframeEmbed }),
    });
    return mountTiptapEditor(editor).tiptap.view.dom;
  };

  it("iframeEmbed.sandbox/allow/referrerPolicy를 주입하면 렌더 DOM이 기본값 대신 그 값을 쓴다", () => {
    const dom = mountedDomWithIframeEmbed({
      sandbox: "allow-scripts",
      allow: "fullscreen",
      referrerPolicy: "no-referrer",
    });
    const iframe = dom.querySelector('[data-geul-block-id="iframe-1"] iframe');
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe?.getAttribute("allow")).toBe("fullscreen");
    expect(iframe?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("iframeEmbed에 렌더링 필드를 하나도 주지 않으면(URL 정책만) 기존 DEFAULT_IFRAME_* 상수를 그대로 쓴다", () => {
    const dom = mountedDomWithIframeEmbed({ allowCustomUrl: true });
    const iframe = dom.querySelector('[data-geul-block-id="iframe-1"] iframe');
    expect(iframe?.getAttribute("sandbox")).toBe(DEFAULT_IFRAME_SANDBOX);
    expect(iframe?.getAttribute("allow")).toBe(DEFAULT_IFRAME_ALLOW);
    expect(iframe?.getAttribute("referrerpolicy")).toBe(
      DEFAULT_IFRAME_REFERRER_POLICY,
    );
  });
});
