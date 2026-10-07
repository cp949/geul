import { detectMarkdownPaste, importHtml } from "@cp949/geul-io";
import {
  type Block,
  type DocumentBlock,
  type IdFactory,
  MAX_NESTING_DEPTH,
} from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { type EditorState, Plugin, TextSelection } from "@tiptap/pm/state";
import { isInTable } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import { selectionIntersectsAnyCodeBlock } from "./code-block-mark-guard-extension.js";
import type { EditorController } from "./editor-controller-types.js";
import type { IframeEmbedConfig } from "./iframe-embed-config.js";
import { modelDepthAtPasteTarget } from "./indent-commands.js";
import { modelToTiptap, type TiptapJsonNode } from "./model-to-tiptap.js";
import {
  isRangeEndingAtChildrenBlockEnd,
  resolvePasteBlockPlacement,
} from "./paste-block-placement.js";
import {
  buildPlainMultilinePasteTransaction,
  normalizeCodeBlockPasteText,
  normalizeForMarkdownDetection,
  normalizeLineBreaks,
  normalizePasteText,
  plainTextClipboardParser,
  splitPlainTextLines,
} from "./plain-text-paste.js";

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

// 선택이 비어 있지 않고 시작($from)의 조상에 codeBlock이 없는지 판정한다
// (Issue #286). 삽입 지점이 시작 블록 쪽이라 HTML 삽입이 안전하다.
const isRangeStartingOutsideCodeBlock = (state: EditorState): boolean => {
  const { selection } = state;
  if (selection.empty) return false;
  const { $from } = selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === "codeBlock") return false;
  }
  return true;
};

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
  // Issue #215 RD-002 — host의 iframe URL 정책(whitelist·protocol·
  // private-network)이다. production-editor-assembly.ts가 construction-time
  // `options.iframeEmbed`를 그대로 전달한다(render 옵션 3필드 추출에 쓰는
  // 것과 같은 소스). 미지정이면 io.importHtml 자체 기본값(가장 보수적)이
  // 적용된다.
  iframeEmbed?: IframeEmbedConfig;
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
    const iframeEmbed = this.options.iframeEmbed;
    // view.pasteText(sanitized, event) 재진입 가드(아래 sanitize 분기와
    // html 폴백 분기 전용) — prosemirror-view의 doPaste가 자체적으로
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

    // PM 자신의 평문 붙여넣기(doPaste)를 재진입 가드 안에서 호출한다.
    const pasteTextThroughPm = (
      view: EditorView,
      value: string,
      event: ClipboardEvent,
    ): void => {
      sanitizedPasteInFlight = true;
      try {
        view.pasteText(value, event);
      } finally {
        sanitizedPasteInFlight = false;
      }
    };

    return [
      new Plugin({
        props: {
          // handlePaste·handleDrop이 직접 삽입하지 않고 물러나는 경로의 여러
          // 줄 평문 배치(Issue #284). 한 줄이면 null이라 PM 기본이다.
          // 자식 있는 블록의 D23 배치는 이 경로로 만들 수 없다(spec 7.3).
          clipboardTextParser: plainTextClipboardParser,
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
              // 코드블록 안에서는 이 기본 처리만 손대지 않는다(Issue #198)
              // — 표·미디어와 달리 codeBlock은 pasteHandler 범위 밖이
              // 아니다(roadmap.md "제외 범위" — pasteHandler는 표·미디어만
              // 제외하고 ClipboardPasteExtension이 처리하는 own HTML/
              // Markdown/plain text 전부를 감싼다). 그래서 이 가드를
              // isInTable처럼 pasteHandler 호출 앞에 두지 않고, defaultHandlePaste
              // 자신의 첫 문장에 둔다 — pasteHandler는 항상 정상 호출되고,
              // pasteHandler가 없거나 defaultPasteHandler()로 위임할 때만
              // 이 return false가 적용된다.
              //
              // 이 return false가 없으면 아래 html-import 분기가
              // clipboardData의 text/html을 codeBlock 렌더 구조(<pre
              // data-geul-code-block><code>)로 오인해 importHtml로 새
              // codeBlock을 만들어 기존 codeBlock 한복판에 구조적으로
              // 삽입해버린다. codeBlock spec의 code: true 덕분에 PM의
              // parseFromClipboard(prosemirror-view)가 caret이 code 안에
              // 있으면 이미 text/html을 무시하고 text/plain만으로 순수
              // 텍스트 slice를 만들어두므로, 여기서 조기 반환해 그 PM 기본
              // 처리를 그대로 살린다 — 별도로 "text/plain 우선" 로직을 새로
              // 만들 필요가 없다. 접힌 toggle의 숨은 codeBlock도 범위
              // 안이면 같은 분기다. 붙여넣기는 범위 전체를 바꾼다(Issue #264).
              // 무효 문자가 섞인 평문만 예외다. 아래에서 정리본을 넣는다
              // (Issue #296).
              const clipboardData = event.clipboardData;
              if (clipboardData === null) return false;

              const html = clipboardData.getData("text/html");
              // rawText는 클립보드 값 그대로다. text는 삽입용 정규화본이다
              // (Issue #291). CR을 LF로 바꾼 뒤 무효 문자를 지운다. 감지만
              // Tab을 지우지 않는 별도 정규화본을 쓴다.
              const rawText = clipboardData.getData("text/plain");
              const text = normalizePasteText(rawText);
              // 위임 가능 여부다(Issue #295). CR→LF 변환만 다른 유효 입력이면
              // 참이다. 무효 문자가 있으면 거짓이라 PM 기본에 맡기지 않는다.
              // PM 기본이 raw 무효 문자를 넣으면 되돌림 guard가 붙여넣기를
              // 통째로 지운다.
              const delegable = text === normalizeLineBreaks(rawText);

              // 예외 1(Issue #286): text/html이 있고 선택이 비어 있지 않고
              // 시작($from)이 codeBlock 밖이면 조기 반환하지 않고 아래
              // html-import 분기로 합류한다.
              // - insertContent는 범위를 replaceWith로 대체한다(단일
              //   transaction, 별도 삭제 단계 없음).
              // - 삽입 지점은 범위 시작($from)이다. 시작이 codeBlock 밖이라
              //   새 codeBlock을 codeBlock 한복판에 넣지 않는다.
              // - PM 기본 처리는 둘째 블록 이후를 앞 블록의 자식으로 넣고
              //   서식을 잃는다.
              // 예외 2(Issue #285): 같은 조건(범위, 시작이 codeBlock 밖)에서
              // 정규화한 평문이 여러 줄이면 아래 직접 삽입으로 합류한다.
              // PM 기본 처리는 범위 끝 뒤의 자식을 마지막 줄 블록으로 넘긴다.
              // 캐럿·시작이 codeBlock 안인 범위는 아래 분기가 먼저 거른다
              // (Issue #296). 유효한 평문은 PM 기본 처리를 유지하고 무효 문자가
              // 섞이면 정리본을 평문으로 넣는다. 시작이 밖인 범위의 유효한 한
              // 줄 평문은 위 설명 그대로 PM 기본 처리를 유지한다. 무효 문자가
              // 섞인 한 줄 평문은 위임하지 않고 아래로 내려간다(Issue #295).
              // Markdown 감지는 이 예외 대상이 아니다. html이 블록을 못 만들면
              // 아래에서 평문으로 폴백한다(Issue #287). 그때도 Markdown 감지는
              // 하지 않는다.
              const intersectsCodeBlock = selectionIntersectsAnyCodeBlock(
                view.state.doc,
                view.state.selection,
              );
              if (intersectsCodeBlock) {
                if (!isRangeStartingOutsideCodeBlock(view.state)) {
                  // 캐럿·시작이 codeBlock 안이다(Issue #296). 유효한 평문은
                  // PM 기본에 맡긴다. PM이 codeBlock 안에서 html을 무시하고
                  // 평문만 넣는다. 무효 문자가 섞였으면 정리본을 평문으로
                  // 넣는다. Tab·LF는 codeBlock 내용이라 지우지 않는다. 정리본이
                  // 비면 이벤트만 소비한다. PM 기본이 raw 무효 문자를 넣으면
                  // 되돌림 guard가 붙여넣기를 통째로 지운다.
                  const codeText = normalizeCodeBlockPasteText(rawText);
                  if (codeText === normalizeLineBreaks(rawText)) return false;
                  if (codeText.length > 0) {
                    pasteTextThroughPm(view, codeText, event);
                  }
                  return true;
                }
                const multilinePlain = splitPlainTextLines(text).length >= 2;
                if (html.length === 0 && !multilinePlain && delegable) {
                  return false;
                }
              }

              const insert = (nodes: TiptapJsonNode[]): void => {
                if (nodes.length === 0) return;
                // 자식 있는 블록의 끝이면 블록 경계에 바로 넣는다(Issue #290).
                // 범위 삭제와 삽입은 한 transaction이다.
                const placement = resolvePasteBlockPlacement(
                  view.state.selection,
                );
                if (placement !== null) {
                  const deleteLength =
                    placement.deleteTo - placement.deleteFrom;
                  editor
                    .chain()
                    .command(({ tr }) => {
                      if (deleteLength > 0) {
                        tr.delete(placement.deleteFrom, placement.deleteTo);
                      }
                      return true;
                    })
                    .insertContentAt(
                      placement.insertAt - deleteLength,
                      clampDepth(nodes, placement.depth),
                    )
                    .run();
                  return;
                }
                // 다른 블록에서 시작해 자식 있는 블록의 끝에서 끝나는 범위는
                // 먼저 지운 뒤 캐럿 삽입 규칙을 적용한다(Issue #294). 삭제는
                // PM 기본 삭제라 끝 블록의 자식이 시작 블록의 자식이 된다.
                // 지운 뒤의 캐럿으로 배치를 다시 판정한다. 범위 삭제와 삽입은
                // 한 transaction이다.
                if (isRangeEndingAtChildrenBlockEnd(view.state.selection)) {
                  editor
                    .chain()
                    .command(({ tr, commands }) => {
                      tr.deleteSelection();
                      const placed = resolvePasteBlockPlacement(tr.selection);
                      if (placed !== null) {
                        return commands.insertContentAt(
                          placed.insertAt,
                          clampDepth(nodes, placed.depth),
                        );
                      }
                      return commands.insertContent(
                        clampDepth(
                          nodes,
                          modelDepthAtPasteTarget(tr.selection.$from),
                        ),
                      );
                    })
                    .run();
                  return;
                }
                const targetDepth = modelDepthAtPasteTarget(
                  view.state.selection.$from,
                );
                editor.commands.insertContent(clampDepth(nodes, targetDepth));
              };

              // html이 블록을 만들지 못했는지(Issue #287). 만들지 못하면
              // 아래 평문 분기로 낙하한다. 낙하 전에 문서를 바꾸지 않는다.
              let htmlFellBack = false;
              if (html.length > 0) {
                // TablePasteExtension이 이 확장보다 먼저 등록돼 있어(
                // production-editor-assembly.ts) 표 형태 HTML은 여기
                // 도달하지 않는다 — 이 확장 안에서 표 여부를 다시
                // 판정하지 않는다.
                // createId를 넘기지 않는다 — 이 결과의 모든 비표 블록 id는
                // 어차피 아래에서 전부 재발급되므로, importHtml 내부가 임시로
                // 발급하는 기본 id(own 마커가 없는 블록에만 해당)까지 editor의
                // createId로 낭비하지 않는다.
                const imported = importHtml(
                  html,
                  iframeEmbed === undefined ? undefined : { iframeEmbed },
                );
                if (imported.ok) {
                  const document = {
                    ...imported.value.document,
                    blocks: reassignNonTableBlockIds(
                      imported.value.document.blocks,
                      createId,
                    ),
                  };
                  // 블록이 0개면 modelToTiptap이 DOCUMENT_INVALID로 거절한다.
                  const encoded = modelToTiptap(document);
                  if (encoded.ok) {
                    insert(encoded.value.content ?? []);
                    return true;
                  }
                }
                // import 실패와 빈 결과는 같은 클립보드의 text/plain으로
                // 폴백한다. 위험 URL·제어문자 html은 여전히 import하지
                // 않는다. 사용자 눈에는 붙여넣기가 사라진 것이라 평문을 쓴다.
                htmlFellBack = true;
              }

              // 평문도 비면 html 분기에서 온 경우만 이벤트를 소비한다(문서
              // 불변). html이 없던 경우는 PM 기본 처리에 위임한다. 빈 판정은
              // rawText로 한다. 제어문자만 있는 입력은 text가 비어도 아래에서
              // 이벤트를 소비한다. 위임하면 PM 기본이 raw 제어문자를 넣는다.
              if (rawText.length === 0) return htmlFellBack;

              // codeBlock에 걸친 범위가 여기 닿는 경우는 html 폴백과 여러 줄
              // 평문(Issue #285)이다. Markdown 감지를 건너뛴다(spec 7.3
              // 한계 유지, #286). 여러 줄이면 직접 삽입한다. 직접 삽입을 못
              // 하면 유효한 평문 단독은 PM 기본에 위임한다. html 폴백과 무효
              // 문자가 섞인 평문은 정리본을 PM 평문 경로로 보낸다. 한 줄 html
              // 폴백은 PM 평문 경로 그대로다. 제어문자만 있으면 이벤트만
              // 소비한다(Issue #295).
              if (intersectsCodeBlock) {
                const inlineLines = splitPlainTextLines(text);
                if (inlineLines.length >= 2) {
                  const pasteTransaction = buildPlainMultilinePasteTransaction(
                    view.state,
                    inlineLines,
                  );
                  if (pasteTransaction !== null) {
                    view.dispatch(pasteTransaction);
                    return true;
                  }
                }
                if (!htmlFellBack && delegable) return false;
                if (text.length > 0) pasteTextThroughPm(view, text, event);
                return true;
              }

              // 감지 입력은 Tab을 지우지 않는다(Issue #291). Tab 외 무효 문자만
              // 지운다. 삽입 입력과 이 지점만 다르다.
              const detection = detectMarkdownPaste(
                normalizeForMarkdownDetection(rawText),
                { createId },
              );
              if (detection.detected) {
                const encoded = modelToTiptap(detection.document);
                if (!encoded.ok) return true;
                insert(encoded.value.content ?? []);
                return true;
              }

              // 여러 줄 plain text는 Enter 분할과 같은 규칙으로 직접 배치한다
              // (Issue #284). PM 기본 처리는 줄마다 문단 slice를 만들어 캐럿
              // 블록의 기존 자식을 마지막 줄 블록으로 넘긴다. 입력은 위에서
              // 정규화한 text다 — 무효 문자 처리는 아래 분기와 같은 결과다.
              // 직접 배치할 수 없으면(NodeSelection 등) tr을 버리고 아래
              // 기존 분기로 PM 기본 처리에 위임한다. 코드블록에 걸친 범위는
              // 위 분기가 이미 처리했다.
              const lines = splitPlainTextLines(text);
              if (lines.length >= 2) {
                const pasteTransaction = buildPlainMultilinePasteTransaction(
                  view.state,
                  lines,
                );
                if (pasteTransaction !== null) {
                  view.dispatch(pasteTransaction);
                  return true;
                }
              }

              // 감지되지 않은 단순 plain text는 PM 기본 처리(paragraph
              // 분리 등)에 그대로 위임해왔다. 하지만 model은 inline text에서
              // LF를 제외한 C0 제어문자·DEL·짝 없는 surrogate를 금지하는데
              // (document-structure-validation.ts), PM 기본 처리는 그
              // 불변식을 모르고 원본 그대로 문서에 넣는다 — 문서 검증이
              // 실패해 되돌림 guard(revision-guard-extension.ts)가 붙여넣기를
              // 통째로 지운다(Issue #295). guard가 없던 때는 model 검증이
              // 뒤늦게 던지는 TypeError가 uncaught exception이 됐다(QA-078
              // 회귀 발견). 원본이 이미 유효하면(가장 흔한 경우) 위임을
              // 그대로 유지해 기존 단락 분리 동작을 안 건드리고, 무효
              // 문자가 있을 때만 정규화한 텍스트로 PM 자신의
              // view.pasteText를 호출한다 — doPaste를 그대로 재사용해
              // 네이티브와 같은 단락 분리를 유지하면서 무효 문자만 뺀다.
              //
              // html에서 폴백한 경우는 원본이 유효해도 return false로 위임하지
              // 않는다. PM 기본 처리는 비어 있지 않은 text/html이 있으면
              // text/plain을 버려 평문이 사라진다(Issue #287). pasteText는
              // html 없이 평문만 쓴다.
              //
              // CR은 무효 문자로 세지 않는다(Issue #291). CR을 LF로 바꾼 것만
              // 다르면(delegable) raw 그대로 위임한다. PM 기본 처리와
              // clipboardTextParser가 CR을 줄 경계로 나눈다.
              if (delegable && !htmlFellBack) {
                return false;
              }
              if (text.length === 0) return true;
              pasteTextThroughPm(view, text, event);
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

          // 여러 줄 text/plain drop을 drop 위치에 직접 삽입한다(Issue #285).
          // PM 기본 drop은 줄마다 문단 slice를 만들어 drop 위치 블록의 기존
          // 자식을 마지막 줄 블록으로 넘긴다. 배치는 붙여넣기와 같은 Enter
          // 분할 규칙이다(plain-text-paste.ts).
          // 아래 입력은 PM 기본(또는 미디어 확장)에 위임한다(false).
          // - 내부 드래그(view.dragging), 파일 동반, text/html 동반
          // - 정규화 뒤 한 줄인 평문
          // - 좌표를 못 푸는 위치, 줄을 놓을 수 없는 위치(표 셀·atom·블록
          //   사이). 위치를 보정하지 않는다.
          // 판정은 live view.state로 한다(G-EDT-002). drop은 현재 selection을
          // 지우지 않는다. 삽입 범위(drop 위치~마지막 줄 끝)를 선택한다. PM
          // 기본 drop과 같다.
          handleDrop: (view, event) => {
            if (view.dragging) return false;
            const dataTransfer = event.dataTransfer;
            if (dataTransfer === null) return false;
            if (dataTransfer.files.length > 0) return false;
            if (dataTransfer.getData("text/html").length > 0) return false;

            const lines = splitPlainTextLines(
              normalizePasteText(dataTransfer.getData("text/plain")),
            );
            if (lines.length < 2) return false;

            const coords = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            if (coords === null) return false;

            const dropTransaction = buildPlainMultilinePasteTransaction(
              view.state,
              lines,
              { position: coords.pos },
            );
            if (dropTransaction === null) return false;

            // paste meta를 달지 않는다. PM 기본 drop과 같은 uiEvent만 단다.
            dropTransaction
              .setSelection(
                TextSelection.create(
                  dropTransaction.doc,
                  coords.pos,
                  dropTransaction.selection.from,
                ),
              )
              .setMeta("uiEvent", "drop");
            view.dispatch(dropTransaction);
            view.focus();
            return true;
          },
        },
      }),
    ];
  },
});
