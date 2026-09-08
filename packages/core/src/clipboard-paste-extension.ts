import { detectMarkdownPaste, importHtml } from "@cp949/geul-io";
import {
  type Block,
  type DocumentBlock,
  type IdFactory,
  MAX_NESTING_DEPTH,
  sanitizeInlineText,
} from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { isInTable } from "@tiptap/pm/tables";

import type { EditorController } from "./editor-controller-types.js";
import { modelDepthAtPasteTarget } from "./indent-commands.js";
import { modelToTiptap, type TiptapJsonNode } from "./model-to-tiptap.js";

// spec §7.3은 HTML 붙여넣기가 문서 HTML import와 같은 sanitizer·매핑을
// 재사용해야 한다고 못 박는다 — 개별 Tiptap 확장의 parseHTML을 하나씩
// 여는 대신, 클립보드에서 파싱한 Document를 modelToTiptap으로 인코드해
// editor.commands.insertContent로 삽입하면 슬라이스 2~9가 쌓은 전체
// 블록 타입을 한 경로로 커버한다. TablePasteExtension이 이미 같은
// handlePaste 가로채기 패턴으로 표를 처리하므로 이 확장은 그 패턴을
// 그대로 따르되 표가 아닌 콘텐츠만 다룬다.
//
// 목록·체크 목록·토글 목록(own-format `ul`/`li`와 RD-003이 편입한
// production 마커 둘 다)도 이 확장이 그대로 처리한다 — 목록을 배제하는
// 코드를 두지 않는다. 예전엔 등록 순서상 목록 전용 별도 확장(RD-004
// "## 결정" 당시 상태)이 목록 있는 HTML을 먼저 가로챘지만, 그 확장이
// 다루던 시나리오(중첩·ol[start]·깊이 상한)를 io.importHtml이 이미
// 동등하게 처리해 RD-005가 그 확장을 제거하고 이 확장 하나로 흡수했다.
//
// own export document HTML의 data-geul-children wrapper와 생산 편집기
// in-editor copy의 data-geul-block-group wrapper(RD-002가 io.importHtml
// 에서 이미 동등하게 인식) 둘 다 이 확장을 거치지 않고 io.importHtml에
// 원본 그대로 전달된다 — 이 확장은 두 형식을 구분하는 사전 정규화
// 코드를 갖지 않는다(G-CNV-002, 의미는 sanitize 이후 HAST에서만 만든다).

// enabledBlockTypes(spec §4.4 EXT-004, RD-002-DELTA-12)를 이 확장의 두
// modelToTiptap 호출부(아래)에 threading하지 않는다 — 착수 중
// "비활성 타입 붙여넣기가 insertContent에서 크래시할 것"이라는 가설을
// 세웠다가 실측(node_modules/@tiptap/core/src/commands/insertContentAt.ts)
// 으로 반증했다: `content = createNodeFromContent(...)`가 항상(editor
// 옵션과 무관) try/catch로 감싸여 있어 알 수 없는 노드 타입이면
// `emitContentError` 이벤트만 내고 `return false`로 조용히 끝난다 —
// uncaught exception이 없다. modelToTiptap이 미리 거절하든 안 하든
// 관찰 가능한 결과(붙여넣기가 아무것도 넣지 않는다)가 같아 이 스레딩은
// 검출 변이를 만들 수 없는 죽은 코드였다.
export type ClipboardPasteOptions = {
  createId: IdFactory;
  // spec §10(IO-008), RD-001-DELTA-01 — 등록된 pasteHandler가 아래
  // handlePaste의 기본 처리 직전에 호출된다. controllerFacade는
  // pasteHandler가 있을 때만 함께 온다(production-editor-assembly.ts
  // 배선 근거).
  pasteHandler?: (context: {
    event: ClipboardEvent;
    editor: EditorController;
    defaultPasteHandler: () => boolean;
  }) => boolean | undefined;
  controllerFacade?: EditorController;
};

// 이미 조립된 blockContainer JSON 배열의 절대 깊이가 MAX_NESTING_DEPTH를
// 넘지 않도록 평탄화한다(초과 지점의 blockGroup을 지우지 않고 그
// children을 부모의 형제로 승격). 옛 list-paste-fallback-extension.ts가
// 같은 정책의 clampDepth를 독립 복제해 썼지만 RD-005가 그 파일을 삭제해
// 이제 이 함수가 유일한 구현이다.
const clampDepth = (
  nodes: TiptapJsonNode[],
  startDepth: number,
): TiptapJsonNode[] => {
  const result: TiptapJsonNode[] = [];
  for (const node of nodes) {
    if (node.type !== "blockContainer" || node.content === undefined) {
      result.push(node);
      continue;
    }
    const groupIndex = node.content.findIndex(
      (child) => child.type === "blockGroup",
    );
    const group = groupIndex === -1 ? undefined : node.content[groupIndex];
    if (group === undefined || group.content === undefined) {
      result.push(node);
      continue;
    }
    if (startDepth >= MAX_NESTING_DEPTH) {
      result.push({
        ...node,
        content: node.content.filter((child) => child.type !== "blockGroup"),
      });
      result.push(...clampDepth(group.content, startDepth));
      continue;
    }
    const clampedChildren = clampDepth(group.content, startDepth + 1);
    result.push({
      ...node,
      content: node.content.map((child, index) =>
        index === groupIndex ? { ...child, content: clampedChildren } : child,
      ),
    });
  }
  return result;
};

// 비표 블록의 id를 하위 트리 전체에서 전부 새로 발급한다(재귀). own HTML이
// 대상 문서와 같은 data-geul-block-id를 담고 있어도(RD-002가 원본 값을
// 보존한다) 그 값을 대상 문서에 재사용하지 않는다 — 표 열·행·셀 id는 R1
// 표 경로가 소유해 손대지 않는다. 코드베이스의 일반 블록 생성 명령
// (divider-commands.ts 등)과 같은 관례로 createId()를 무조건 새로
// 호출한다 — duplicateBlock류의 세션-Document 충돌 검사 allocator는
// 이 확장이 접근할 수 없는 세션 내부 상태가 필요해 재사용하지 않는다
// (readiness probe 근거, `_works/roadmap/result/RD-004-DELTA-01.md`).
const reassignNonTableBlockIds = (
  blocks: readonly DocumentBlock[],
  createId: IdFactory,
): DocumentBlock[] =>
  blocks.map((block): DocumentBlock => {
    if (block.type === "table") return block;
    if (!("children" in block) || block.children === undefined) {
      return { ...block, id: createId() };
    }
    // block.children은 항상 Block[](CustomBlock은 leaf라 children 필드
    // 자체가 없다) — 재귀는 그 children에서만 도니 반환값도 실제로는 항상
    // Block[]이다(block-tree-edit.ts의 동일 근거).
    return {
      ...block,
      id: createId(),
      children: reassignNonTableBlockIds(block.children, createId) as Block[],
    };
  });

export const ClipboardPasteExtension = Extension.create<ClipboardPasteOptions>({
  name: "clipboardPaste",

  addOptions() {
    return {
      createId: () => {
        throw new Error("ClipboardPasteExtension requires a createId option");
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const createId = this.options.createId;
    const pasteHandler = this.options.pasteHandler;
    const controllerFacade = this.options.controllerFacade;
    // view.pasteText(sanitized, event) 재진입 가드(아래 sanitize 분기
    // 전용) — prosemirror-view의 doPaste가 자체적으로
    // view.someProp("handlePaste", f => f(view, event, slice))를 한 번 더
    // 호출한다(EditorView.pasteText → doPaste 내부, 이 플러그인 등록
    // 시그니처와 별개 3-인자 호출). 그 재호출도 이 handlePaste로 들어와
    // 같은 event.clipboardData를 다시 읽으면 sanitize 결과가 매번
    // 원본과 달라 view.pasteText를 무한 재귀 호출한다(jsdom 테스트로
    // 실측: RangeError: Maximum call stack size exceeded). 이 플래그가
    // true인 동안은 즉시 false를 반환해 doPaste 내부 재호출을
    // 사실상 무시한다 — doPaste 자신은 이미 계산해 둔 slice로 계속
    // 진행하므로 삽입 자체는 그대로 된다.
    let sanitizedPasteInFlight = false;

    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            if (sanitizedPasteInFlight) return false;
            // 표 셀 안에서는 손대지 않는다(R1 계약 그대로) — pasteHandler도
            // 호출하지 않는다(roadmap.md "제외 범위", IO-008은 표·미디어
            // 붙여넣기를 대상으로 하지 않는다).
            if (isInTable(view.state)) return false;

            // spec §10(IO-008) — 기존 handlePaste 로직 전체를 그대로
            // defaultPasteHandler로 노출한다. pasteHandler가 undefined를
            // 반환(기본 동작 위임)하면 이 함수를 그대로 호출한다.
            const defaultHandlePaste = (): boolean => {
              const clipboardData = event.clipboardData;
              if (clipboardData === null) return false;

              const html = clipboardData.getData("text/html");
              const text = clipboardData.getData("text/plain");

              const insert = (nodes: TiptapJsonNode[]): void => {
                if (nodes.length === 0) return;
                const targetDepth = modelDepthAtPasteTarget(
                  view.state.selection.$from,
                );
                editor.commands.insertContent(clampDepth(nodes, targetDepth));
              };

              if (html.length > 0) {
                // TablePasteExtension이 이 확장보다 먼저 등록돼 있어(
                // production-editor-assembly.ts) 표 형태 HTML은 여기
                // 도달하지 않는다 — 이 확장 안에서 표 여부를 다시
                // 판정하지 않는다.
                // createId를 넘기지 않는다 — 이 결과의 모든 비표 블록 id는
                // 어차피 아래에서 전부 재발급되므로, importHtml 내부가 임시로
                // 발급하는 기본 id(own 마커가 없는 블록에만 해당)까지 editor의
                // createId로 낭비하지 않는다.
                const imported = importHtml(html);
                if (!imported.ok) return true;
                const document = {
                  ...imported.value.document,
                  blocks: reassignNonTableBlockIds(
                    imported.value.document.blocks,
                    createId,
                  ),
                };
                const encoded = modelToTiptap(document);
                if (!encoded.ok) return true;
                insert(encoded.value.content ?? []);
                return true;
              }

              if (text.length === 0) return false;

              const detection = detectMarkdownPaste(text, { createId });
              if (detection.detected) {
                const encoded = modelToTiptap(detection.document);
                if (!encoded.ok) return true;
                insert(encoded.value.content ?? []);
                return true;
              }

              // 감지되지 않은 단순 plain text는 PM 기본 처리(paragraph
              // 분리 등)에 그대로 위임해왔다. 하지만 model은 inline text에서
              // LF를 제외한 C0 제어문자·DEL·짝 없는 surrogate를 금지하는데
              // (document-structure-validation.ts), PM 기본 처리는 그
              // 불변식을 모르고 원본 그대로 문서에 넣는다 — 다음
              // onTiptapUpdate에서 model 검증이 뒤늦게 실패해 던지는
              // TypeError가 어디서도 안 잡혀 uncaught exception이 된다(QA-078
              // 회귀 발견). 원본이 이미 유효하면(가장 흔한 경우) 위임을
              // 그대로 유지해 기존 단락 분리 동작을 안 건드리고, 무효
              // 문자가 있을 때만 sanitize한 텍스트로 PM 자신의
              // view.pasteText를 호출한다 — doPaste를 그대로 재사용해
              // 네이티브와 같은 단락 분리를 유지하면서 무효 문자만 뺀다.
              const sanitized = sanitizeInlineText(text);
              if (sanitized === text) return false;
              if (sanitized.length === 0) return true;
              sanitizedPasteInFlight = true;
              try {
                view.pasteText(sanitized, event);
              } finally {
                sanitizedPasteInFlight = false;
              }
              return true;
            };

            if (pasteHandler === undefined || controllerFacade === undefined) {
              return defaultHandlePaste();
            }

            const result = pasteHandler({
              event,
              editor: controllerFacade,
              defaultPasteHandler: defaultHandlePaste,
            });
            if (result === undefined) return defaultHandlePaste();
            // true(처리됨)·false(취소) 둘 다 PM handlePaste 레벨에선 true를
            // 반환해야 한다 — false(취소)는 PM 기본 plain-text 붙여넣기까지
            // 억제해야 하므로 PM의 "위임" 신호(false)를 쓸 수 없다.
            return true;
          },
        },
      }),
    ];
  },
});
