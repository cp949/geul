import { mergeAttributes, Node } from "@tiptap/core";

// codeBlock은 blockContainer가 identity와 자식 구조를 소유하는 내용 노드다.
// source에는 text만 허용하고 모든 mark를 금지한다. language는 PM attrs에만
// 보존하며 편집기 내부 DOM에는 노출하지 않는다. 외부 HTML 변환은 io가
// 소유하므로 parseHTML 규칙을 선언하지 않는다.
export const CodeBlockExtension = Node.create({
  name: "codeBlock",
  group: "leafBlockContent",
  content: "text*",
  marks: "",
  code: true,
  defining: true,

  addAttributes() {
    return {
      language: {
        default: null,
        renderHTML: () => ({}),
      },
      // wrap은 language와 달리 내부 DOM에 직접 투영한다(spec — 줄바꿈 여부는
      // 순수 CSS 관심사, react가 `white-space: pre-wrap`을 이 attribute로
      // 스코프한다). null(미설정)과 명시적 false는 attribute 자체를
      // 생략한다(media textAlignment/showPreview와 동일 관례,
      // media-block-extension.ts — "null은 attribute 자체를 생략한다") —
      // `default: false`를 쓰면 미설정 문서도 항상 PM attrs에서 `false`가
      // 돼 model의 optional `wrap?: boolean`과 "미설정"/"명시적 off"를
      // 구분할 수 없어진다.
      wrap: {
        default: null,
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.wrap === true ? { "data-geul-code-wrap": "" } : {},
      },
      // caption은 media 4종과 같은 plain string 공통 필드다(model
      // CodeBlock.caption, RD-002 DELTA-01). media caption attr
      // (media-block-extension.ts:72)과 동일하게 attr-level renderHTML은
      // 아무것도 emit하지 않는다 — 실제 DOM 투영은 아래 node-level
      // renderHTML의 조건부 자식으로 한다.
      caption: {
        default: null,
        renderHTML: () => ({}),
      },
    };
  },

  renderHTML({ HTMLAttributes, node }) {
    // media captionChildren(media-block-extension.ts)과 동일 판정 — 빈
    // 문자열도 "caption 없음"으로 취급해 DOM에 아무 것도 남기지 않는다. 그
    // 파일은 leaf 전용 모듈이라 import하지 않는 기존 관례를 따라(예:
    // production-editor-media-upload.ts의 hasStoredUrl) 로컬로 다시
    // 판정한다. always-visible caption UI(placeholder 포함)는 이 DELTA
    // 범위 밖이다 — react DELTA-02가 담당한다(RD-002.md "포함 범위").
    const caption =
      typeof node.attrs.caption === "string" && node.attrs.caption.length > 0
        ? node.attrs.caption
        : null;
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-geul-code-block": "" }),
      ["code", 0],
      // 시각 톤을 media caption과 공유하려고 같은 마커를 재사용한다
      // (roadmap.md 그릴링 #2 "시각 톤만 media caption
      // ([data-geul-media-caption])을 따른다" — 새 data-geul-code-caption
      // 마커를 쓰면 _editor.scss에 codeBlock 전용 규칙을 중복 추가해야
      // 한다).
      ...(caption === null
        ? []
        : [["div", { "data-geul-media-caption": "" }, caption]]),
    ];
  },
});
