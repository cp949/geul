/**
 * media-block-extension.ts의 kind별 renderHTML을 검증한다(슬라이스4 RD-002
 * DELTA-01). model 문서를 직접 구성해 production `createEditor()`에
 * 로드하고 `editor.view.dom` 렌더 결과를 단언한다 — media-commands 명령을
 * 거치지 않고도 검증 가능하다(RD-002.md 포함 범위). 명령 자체는
 * editor-controller-media-commands.test.ts가 소유한다. previewWidth 인라인
 * width 스타일 투영(슬라이스5 RD-001 DELTA-01, MED-007)과 showPreview:false의
 * <a> 대체 투영(슬라이스5 RD-002 DELTA-01, MED-008)도 이 파일이 소유한다 —
 * 같은 renderHTML 검증 관심사다. 이 파일명의 "RD-002"는 이미 완료된
 * 슬라이스4 roadmap의 ID이고, 주석 속 "슬라이스5 RD-002"는 별도 roadmap
 * (`_works/roadmap/`)의 동명 ID다 — RD 번호는 roadmap마다 독립 발급된다.
 */
import { describe, expect, it } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { createEditor, DEFAULT_DICTIONARY } from "../src/index.js";
import { createLocalPreviewAttrs } from "../src/media-local-preview.js";
import {
  documentOf,
  mediaBlock,
  mountTiptapEditor,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";

const MEDIA_KINDS = ["file", "image", "video", "audio"] as const;

/**
 * 미디어 블록 1개 + tailParagraphBlock으로 닫은 문서를 마운트해 편집기
 * DOM을 반환한다. tailParagraphBlock으로 닫는 이유는
 * TrailingBlockExtension이 atom 블록으로 끝난 문서에 로드 시점 빈
 * paragraph를 자동 동반하기 때문이다(RD-001 DELTA-01에서 실제로 걸린
 * 함정, editor-controller-support.ts의 tailParagraphBlock 주석 참고).
 */
const mountedDom = (
  kind: (typeof MEDIA_KINDS)[number],
  props?: Parameters<typeof mediaBlock>[2],
) => {
  const editor = createEditor({
    initialDocument: documentOf(
      mediaBlock(kind, `${kind}-1`, props),
      tailParagraphBlock,
    ),
    createId: sequentialIds("id"),
  });
  return mountTiptapEditor(editor).tiptap.view.dom;
};

describe("4종 미디어 블록 렌더링 — 채워진 상태", () => {
  it("file은 <a href>로 url을 반영하고 name을 링크 텍스트로 쓴다", () => {
    const dom = mountedDom("file", {
      url: "https://example.com/doc.pdf",
      name: "doc.pdf",
    });
    const link = dom.querySelector('[data-geul-block-id="file-1"] a');
    expect(link?.getAttribute("href")).toBe("https://example.com/doc.pdf");
    expect(link?.textContent).toBe("doc.pdf");
  });

  it("file은 name이 없으면 url을 링크 텍스트로 쓴다", () => {
    const dom = mountedDom("file", { url: "https://example.com/doc.pdf" });
    const link = dom.querySelector('[data-geul-block-id="file-1"] a');
    expect(link?.textContent).toBe("https://example.com/doc.pdf");
  });

  it("image는 <img src alt>로 url을 반영하고 caption을 alt로 쓴다", () => {
    const dom = mountedDom("image", {
      url: "https://example.com/pic.png",
      name: "pic.png",
      caption: "a cat",
    });
    const img = dom.querySelector('[data-geul-block-id="image-1"] img');
    expect(img?.getAttribute("src")).toBe("https://example.com/pic.png");
    expect(img?.getAttribute("alt")).toBe("a cat");
  });

  it("image는 caption이 없으면 name을 alt로 쓴다", () => {
    const dom = mountedDom("image", {
      url: "https://example.com/pic.png",
      name: "pic.png",
    });
    const img = dom.querySelector('[data-geul-block-id="image-1"] img');
    expect(img?.getAttribute("alt")).toBe("pic.png");
  });

  it("image는 caption·name 둘 다 없으면 alt를 빈 문자열로 낸다", () => {
    const dom = mountedDom("image", { url: "https://example.com/pic.png" });
    const img = dom.querySelector('[data-geul-block-id="image-1"] img');
    expect(img?.getAttribute("alt")).toBe("");
  });

  it("video는 <video controls src>로 url을 반영한다", () => {
    const dom = mountedDom("video", { url: "https://example.com/v.mp4" });
    const video = dom.querySelector('[data-geul-block-id="video-1"] video');
    expect(video?.getAttribute("src")).toBe("https://example.com/v.mp4");
    expect(video?.hasAttribute("controls")).toBe(true);
  });

  it("audio는 <audio controls src>로 url을 반영한다", () => {
    const dom = mountedDom("audio", { url: "https://example.com/a.mp3" });
    const audio = dom.querySelector('[data-geul-block-id="audio-1"] audio');
    expect(audio?.getAttribute("src")).toBe("https://example.com/a.mp3");
    expect(audio?.hasAttribute("controls")).toBe(true);
  });
});

describe("caption 렌더 — 4종 공통", () => {
  it.each(MEDIA_KINDS)(
    "%s는 caption이 있으면 캡션 텍스트를 렌더한다",
    (kind) => {
      const dom = mountedDom(kind, {
        url: "https://example.com/x",
        caption: "설명 텍스트",
      });
      const caption = dom.querySelector(
        `[data-geul-block-id="${kind}-1"] [data-geul-media-caption]`,
      );
      expect(caption?.textContent).toBe("설명 텍스트");
    },
  );

  it.each(MEDIA_KINDS)(
    "%s는 caption이 없으면 캡션 요소를 렌더하지 않는다",
    (kind) => {
      const dom = mountedDom(kind, { url: "https://example.com/x" });
      const caption = dom.querySelector(
        `[data-geul-block-id="${kind}-1"] [data-geul-media-caption]`,
      );
      expect(caption).toBeNull();
    },
  );
});

describe("url 없는 빈 상태 — 4종 공통", () => {
  it.each(MEDIA_KINDS)(
    "%s는 url이 없어도 예외 없이 렌더되고 kind 표식을 가진다",
    (kind) => {
      const dom = mountedDom(kind);
      const wrapper = dom.querySelector(`[data-geul-block-id="${kind}-1"]`);
      expect(wrapper).not.toBeNull();
      expect(wrapper?.getAttribute("data-geul-media-empty")).toBe(kind);
      // 채워진 상태의 미디어 태그(a/img/video/audio)를 만들지 않는다.
      expect(wrapper?.children).toHaveLength(0);
      // url도 로컬 프리뷰도 없으면 배지 마커도 없다(Issue #168 roadmap
      // RD-002 DELTA-01, 완료 조건 4의 "업로드 대기 상태에서는 안 보임" 절반).
      expect(wrapper?.hasAttribute("data-geul-media-local-preview")).toBe(
        false,
      );
    },
  );
});

/**
 * 빈 media 블록의 placeholder 문구(2026-09-12, Notion UI parity —
 * MediaEmptyLabelExtension). renderHTML의 `data-geul-media-empty`(kind
 * 표식)와 별개로, 데코레이션이 얹는 `data-geul-media-empty-label`(실제
 * 문구)을 검증한다. placeholder-extension.test.ts와 같은 관심사 분리 —
 * "표식이 붙는다"는 위 describe, "문구 내용·override·소거 조건"은 여기.
 */
describe("빈 상태 placeholder 문구 — MediaEmptyLabelExtension(2026-09-12, Notion parity)", () => {
  it.each(MEDIA_KINDS)(
    "%s는 url이 없으면 kind별 기본(en) placeholder 문구를 받는다",
    (kind) => {
      const dom = mountedDom(kind);
      const wrapper = dom.querySelector(`[data-geul-block-id="${kind}-1"]`);
      const expected = DEFAULT_DICTIONARY.placeholder.media.replace(
        "{kind}",
        DEFAULT_DICTIONARY.toolbar.kindNames[kind],
      );
      expect(wrapper?.getAttribute("data-geul-media-empty-label")).toBe(
        expected,
      );
    },
  );

  it("dictionary override 시 {kind} 토큰이 치환된 override 문구를 쓴다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        mediaBlock("image", "image-1"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
      dictionary: {
        ...DEFAULT_DICTIONARY,
        placeholder: {
          ...DEFAULT_DICTIONARY.placeholder,
          media: "{kind} 없음",
        },
      },
    });
    const dom = mountTiptapEditor(editor).tiptap.view.dom;
    const wrapper = dom.querySelector('[data-geul-block-id="image-1"]');
    expect(wrapper?.getAttribute("data-geul-media-empty-label")).toBe(
      "Image 없음",
    );
  });

  it("url이 있으면 placeholder 문구를 붙이지 않는다", () => {
    const dom = mountedDom("image", { url: "https://example.com/pic.png" });
    const wrapper = dom.querySelector('[data-geul-block-id="image-1"]');
    expect(wrapper?.hasAttribute("data-geul-media-empty-label")).toBe(false);
  });

  it("로컬 프리뷰만 있는 상태에도 placeholder 문구를 붙이지 않는다", async () => {
    const editor = createEditor({
      initialDocument: documentOf(
        mediaBlock("image", "image-1"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const result = await editor.commands.uploadMediaFile(
      "image-1",
      new File(["x"], "x.png"),
    );
    expect(result.ok).toBe(true);
    const wrapper = tiptap.view.dom.querySelector(
      '[data-geul-block-id="image-1"]',
    );
    expect(wrapper?.hasAttribute("data-geul-media-empty-label")).toBe(false);
  });

  it("데코레이션 전용이라 저장 문서에 흔적을 남기지 않는다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        mediaBlock("image", "image-1"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
    });
    const before = editor.getDocument();
    mountTiptapEditor(editor);
    expect(editor.getDocument()).toEqual(before);
  });
});

/**
 * url이 없고 `localPreviewUrl`만 있는 상태(Issue #168 roadmap ADR 0015, RD-001이
 * 채우고 RD-002 DELTA-01이 소비)의 렌더링 우선순위를 고정한다. model에는 이
 * attrs가 없어(ADR 0015) `mountedDom`(모델 경유)으로는 재현할 수 없다 —
 * `uploadMediaFile`(콜백 미등록, RD-001 DELTA-04 폴백 경로)로 실제 프로덕션
 * 경로를 거쳐 채운다.
 */
describe("로컬 프리뷰 렌더 — 4종 공통(RD-002 DELTA-01)", () => {
  const mountedLocalPreviewDom = async (kind: (typeof MEDIA_KINDS)[number]) => {
    const editor = createEditor({
      initialDocument: documentOf(
        mediaBlock(kind, `${kind}-1`),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const result = await editor.commands.uploadMediaFile(
      `${kind}-1`,
      new File(["x"], "x.bin"),
    );
    expect(result.ok).toBe(true);
    return tiptap.view.dom;
  };

  it.each(MEDIA_KINDS)(
    "%s는 url 없고 localPreviewUrl 있으면 그것을 소스로 렌더하고 배지 마커를 낸다",
    async (kind) => {
      const dom = await mountedLocalPreviewDom(kind);
      const wrapper = dom.querySelector(`[data-geul-block-id="${kind}-1"]`);
      expect(wrapper?.getAttribute("data-geul-media-local-preview")).toBe("");
      expect(wrapper?.hasAttribute("data-geul-media-empty")).toBe(false);
      const tag = kind === "file" ? "a" : kind === "image" ? "img" : kind;
      const srcAttr = kind === "file" ? "href" : "src";
      const src = wrapper?.querySelector(tag)?.getAttribute(srcAttr);
      expect(src).toMatch(/^blob:/);
    },
  );

  it("url이 이미 있으면 localPreviewUrl이 같이 있어도 url이 이긴다(방어적 우선순위, previewWidthStyleAttrs와 동일 태도로 production이 이 상태를 만들지 않아도 renderHTML 자체가 보장한다)", () => {
    // RD-001 DELTA-05가 url 확정과 같은 트랜잭션에서 localPreviewUrl을 항상
    // null로 정리해 production 경로로는 이 상태(둘 다 non-null)에 도달할 수
    // 없다 — mediaSourceUrl은 그 보장에 기대지 않고 직접 PM 트랜잭션으로
    // 재현한다.
    const editor = createEditor({
      initialDocument: documentOf(
        mediaBlock("image", "image-1"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
    });
    const { tiptap } = mountTiptapEditor(editor);
    const position = findBlockPosition(tiptap.state.doc, "image-1");
    const node = position === null ? null : tiptap.state.doc.nodeAt(position);
    if (position === null || node === null) {
      throw new Error("image-1 블록을 찾지 못했다");
    }
    tiptap.view.dispatch(
      tiptap.state.tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        url: "https://example.com/pic.png",
        ...createLocalPreviewAttrs(new File(["x"], "x.bin")),
      }),
    );
    const wrapper = tiptap.view.dom.querySelector(
      '[data-geul-block-id="image-1"]',
    );
    expect(wrapper?.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/pic.png",
    );
    expect(wrapper?.hasAttribute("data-geul-media-local-preview")).toBe(false);
  });
});

describe("previewWidth 렌더 — image/video(슬라이스5 RD-001 DELTA-01)", () => {
  it.each(["image", "video"] as const)(
    "%s는 previewWidth가 있으면 인라인 width 스타일을 낸다",
    (kind) => {
      const dom = mountedDom(kind, {
        url: "https://example.com/x",
        previewWidth: 320,
      });
      const el = dom.querySelector<HTMLElement>(
        `[data-geul-block-id="${kind}-1"] ${kind === "image" ? "img" : "video"}`,
      );
      expect(el?.style.width).toBe("320px");
    },
  );

  it.each(["image", "video"] as const)(
    "%s는 previewWidth가 없으면 width 스타일을 내지 않는다",
    (kind) => {
      const dom = mountedDom(kind, { url: "https://example.com/x" });
      const el = dom.querySelector<HTMLElement>(
        `[data-geul-block-id="${kind}-1"] ${kind === "image" ? "img" : "video"}`,
      );
      expect(el?.style.width).toBe("");
    },
  );

  it("file/audio는 previewWidth attrs 자체가 없어 width 스타일이 없다(회귀)", () => {
    const fileDom = mountedDom("file", { url: "https://example.com/x" });
    const audioDom = mountedDom("audio", { url: "https://example.com/x" });
    expect(
      fileDom.querySelector<HTMLElement>('[data-geul-block-id="file-1"] a')
        ?.style.width,
    ).toBe("");
    expect(
      audioDom.querySelector<HTMLElement>(
        '[data-geul-block-id="audio-1"] audio',
      )?.style.width,
    ).toBe("");
  });
});

describe("showPreview 렌더 — image/video/audio(슬라이스5 RD-002 DELTA-01)", () => {
  it.each(["image", "video", "audio"] as const)(
    "%s는 showPreview:false면 미디어 태그 대신 <a>를 렌더한다",
    (kind) => {
      const dom = mountedDom(kind, {
        url: "https://example.com/x",
        name: "x.dat",
        showPreview: false,
      });
      const wrapper = dom.querySelector(`[data-geul-block-id="${kind}-1"]`);
      const tag = kind === "image" ? "img" : kind;
      expect(wrapper?.querySelector(tag)).toBeNull();
      const link = wrapper?.querySelector("a");
      expect(link?.getAttribute("href")).toBe("https://example.com/x");
      expect(link?.textContent).toBe("x.dat");
    },
  );

  it.each(["image", "video", "audio"] as const)(
    "%s는 showPreview가 없거나 true면 기존 미디어 태그를 렌더한다(회귀)",
    (kind) => {
      const dom = mountedDom(kind, { url: "https://example.com/x" });
      const wrapper = dom.querySelector(`[data-geul-block-id="${kind}-1"]`);
      const tag = kind === "image" ? "img" : kind;
      expect(wrapper?.querySelector(tag)).not.toBeNull();
      expect(wrapper?.querySelector("a")).toBeNull();
    },
  );

  it.each(["image", "video", "audio"] as const)(
    "%s는 showPreview:false여도 caption을 그대로 렌더한다",
    (kind) => {
      const dom = mountedDom(kind, {
        url: "https://example.com/x",
        caption: "설명 텍스트",
        showPreview: false,
      });
      const caption = dom.querySelector(
        `[data-geul-block-id="${kind}-1"] [data-geul-media-caption]`,
      );
      expect(caption?.textContent).toBe("설명 텍스트");
    },
  );

  it("file은 showPreview attrs 자체가 없어 렌더가 바뀌지 않는다(회귀)", () => {
    const dom = mountedDom("file", {
      url: "https://example.com/doc.pdf",
      name: "doc.pdf",
    });
    const link = dom.querySelector('[data-geul-block-id="file-1"] a');
    expect(link?.getAttribute("href")).toBe("https://example.com/doc.pdf");
    expect(link?.textContent).toBe("doc.pdf");
  });
});

describe("textAlignment 렌더 — image/video(2026-09-12, pending-issue 이월 해제)", () => {
  it.each(["image", "video"] as const)(
    "%s는 textAlignment가 left/right면 data-geul-text-alignment를 낸다",
    (kind) => {
      const leftDom = mountedDom(kind, {
        url: "https://example.com/x",
        textAlignment: "left",
      });
      const rightDom = mountedDom(kind, {
        url: "https://example.com/x",
        textAlignment: "right",
      });
      expect(
        leftDom
          .querySelector(`[data-geul-block-id="${kind}-1"]`)
          ?.getAttribute("data-geul-text-alignment"),
      ).toBe("left");
      expect(
        rightDom
          .querySelector(`[data-geul-block-id="${kind}-1"]`)
          ?.getAttribute("data-geul-text-alignment"),
      ).toBe("right");
    },
  );

  it.each(["image", "video"] as const)(
    "%s는 textAlignment가 없으면 data-geul-text-alignment를 내지 않는다(기본 중앙 정렬, 회귀)",
    (kind) => {
      const dom = mountedDom(kind, { url: "https://example.com/x" });
      expect(
        dom
          .querySelector(`[data-geul-block-id="${kind}-1"]`)
          ?.hasAttribute("data-geul-text-alignment"),
      ).toBe(false);
    },
  );

  it("file/audio는 textAlignment attrs 자체가 없어 data-geul-text-alignment가 없다(회귀)", () => {
    const fileDom = mountedDom("file", { url: "https://example.com/x" });
    const audioDom = mountedDom("audio", { url: "https://example.com/x" });
    expect(
      fileDom
        .querySelector('[data-geul-block-id="file-1"]')
        ?.hasAttribute("data-geul-text-alignment"),
    ).toBe(false);
    expect(
      audioDom
        .querySelector('[data-geul-block-id="audio-1"]')
        ?.hasAttribute("data-geul-text-alignment"),
    ).toBe(false);
  });
});

describe("selector — RD-003·RD-004가 대상 블록을 찾는 최소 계약", () => {
  it.each(MEDIA_KINDS)(
    "%s 블록을 data-geul-block-id로 querySelector할 수 있다",
    (kind) => {
      const dom = mountedDom(kind, { url: "https://example.com/x" });
      expect(
        dom.querySelector(`[data-geul-block-id="${kind}-1"]`),
      ).not.toBeNull();
    },
  );
});
