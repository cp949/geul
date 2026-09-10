/**
 * MediaDropPasteExtension(RD-002 DELTA-01, roadmap
 * `_works/roadmap/RD-002.md`)의 위치 판정(D1 표 바이패스, D5 CodeBlock
 * 일반 규칙, F2 drop 앞/뒤, paste 빈 paragraph 교체), 다중 파일 체이닝(D2),
 * range selection 삭제(D7), 우선순위 배선(D4)을 검증한다. drop 좌표 판정은
 * jsdom이 실제 레이아웃(`posAtCoords`·`getBoundingClientRect`)을 계산하지
 * 못해 두 값을 테스트 안에서 직접 주입한다 — 실제 브라우저 hit-testing
 * 통합은 DELTA-03 Playwright e2e가 검증한다(계획 문서 "범위 밖" 참고).
 *
 * 업로드 콜백 미등록 시 파일 1개의 로컬 프리뷰 처리(Issue #168 roadmap
 * RD-001 DELTA-02, ADR 0015)는 파일 하단 "업로드 콜백 미등록" describe가
 * 별도로 소유한다 — 위 RD-002 DELTA-01 시점에는 콜백 미등록이면 파일
 * 페이로드를 완전히 무시했으나(R3 spec §4.1, IO-007 own 경계) 그 결정은
 * DELTA-02가 뒤집었다.
 */
import type { InlineContentItem, ParagraphBlock } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { createEditor, type UploadFile } from "../src/index.js";
import {
  dropEntries,
  dropFiles,
  pasteFiles,
  pasteFilesAndHtml,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  mediaBlock,
  mountTiptapEditor,
  oneCellTableBlock,
  paragraphBlock,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";
import { findCellBoundaryPosition } from "./table-test-support.js";

/** 이름·MIME만 지정한 File을 만든다(media-drop-paste-detection.test.ts와 동일 패턴). */
const fileOf = (name: string, type: string): File =>
  new File([], name, { type });

/** DELTA-01 범위에서 실제로 호출되지 않는 stub — isUploadEnabled 게이트만 켠다. */
const noopUploadFile: UploadFile = () => new Promise(() => {});

/**
 * uploadFile을 등록한 채(= isUploadEnabled: true) 문서를 마운트한다. 이
 * 파일의 모든 "정상 동작" 테스트가 공유하는 준비 단계다 — no-op 회귀
 * 테스트만 uploadFile을 일부러 빼고 createEditor를 직접 호출한다.
 */
const mountedWithUploadEnabled = (
  initialDocument: ReturnType<typeof documentOf>,
) => {
  const editor = createEditor({
    initialDocument,
    createId: sequentialIds("id"),
    uploadFile: noopUploadFile,
  });
  return { editor, ...mountTiptapEditor(editor) };
};

/**
 * 캐럿을 blockId 블록의 콘텐츠 안(첫 글자 앞)에 둔다. blockContainer
 * 내부(+1)의 첫 자식 콘텐츠 시작(+1) — 컨테이너 위치 + 2가 그 지점이다.
 * paragraph·codeBlock처럼 blockContainer로 감싸인 leaf textblock 전부에
 * 통용된다(내용이 있어도 위치만 그 시작점일 뿐 캐럿은 여전히 그 블록 안).
 */
const placeCaretInBlock = (
  tiptap: ReturnType<typeof mountTiptapEditor>["tiptap"],
  blockId: string,
) => {
  const containerPos = findBlockPosition(tiptap.state.doc, blockId);
  if (containerPos === null) throw new Error(`블록을 찾지 못했다: ${blockId}`);
  tiptap.commands.setTextSelection(containerPos + 2);
  return containerPos;
};

/**
 * blockId 블록 DOM 요소의 getBoundingClientRect를 고정값으로 덮어쓰고,
 * view.posAtCoords가 그 블록 콘텐츠 안의 위치를 가리키도록 만든다. jsdom은
 * 실제 레이아웃을 계산하지 못해(항상 0-rect, posAtCoords도 hit-test 불가)
 * F2 좌표 판정 자체를 테스트하려면 이 두 값을 직접 주입해야 한다.
 */
const stubDropGeometry = (
  tiptap: ReturnType<typeof mountTiptapEditor>["tiptap"],
  blockId: string,
  rect: { top: number; height: number },
) => {
  const containerPos = findBlockPosition(tiptap.state.doc, blockId);
  if (containerPos === null) throw new Error(`블록을 찾지 못했다: ${blockId}`);
  const dom = tiptap.view.nodeDOM(containerPos);
  if (!(dom instanceof HTMLElement)) throw new Error("블록 DOM을 찾지 못했다");
  dom.getBoundingClientRect = () =>
    ({
      top: rect.top,
      bottom: rect.top + rect.height,
      height: rect.height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  tiptap.view.posAtCoords = () => ({
    pos: containerPos + 2,
    inside: containerPos,
  });
  return containerPos;
};

describe("표 셀 바이패스(D1) — paste·drop 공통", () => {
  it("표 셀 안에서 paste한 파일은 셀 내용을 건드리지 않고 표 뒤에 삽입된다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(oneCellTableBlock("tbl-1"), tailParagraphBlock),
    );
    editable.focus();
    tiptap.commands.setTextSelection(
      (findCellBoundaryPosition(tiptap, "cell-1") ?? 0) + 1,
    );

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        oneCellTableBlock("tbl-1"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("표 셀 안에서 drop한 파일은 좌표와 무관하게 표 뒤에 삽입된다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(oneCellTableBlock("tbl-1"), tailParagraphBlock),
    );
    editable.focus();
    const cellPos = (findCellBoundaryPosition(tiptap, "cell-1") ?? 0) + 1;
    tiptap.view.posAtCoords = () => ({ pos: cellPos, inside: cellPos - 1 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 99999,
      });

      expect(editor.getDocument().blocks).toEqual([
        oneCellTableBlock("tbl-1"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("CodeBlock 일반 규칙(D5)", () => {
  it("CodeBlock 안 paste는 표처럼 바이패스하지 않고 일반 규칙(뒤에 삽입)을 따른다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(
        codeBlockBlock("cb-1", "code text", "typescript"),
        tailParagraphBlock,
      ),
    );
    editable.focus();
    placeCaretInBlock(tiptap, "cb-1");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        codeBlockBlock("cb-1", "code text", "typescript"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("paste — 빈 paragraph 교체 여부", () => {
  it("캐럿이 빈 paragraph 안이면 그 블록을 media 블록으로 교체한다(빈 paragraph가 남지 않는다)", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("empty-1", ""), tailParagraphBlock),
    );
    editable.focus();
    placeCaretInBlock(tiptap, "empty-1");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("캐럿이 내용 있는 블록 안이면 원본을 보존하고 그 뒤에 삽입한다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("drop — F2 좌표 판정(교체 없음)", () => {
  it("drop 좌표가 대상 블록 rect 위쪽 절반이면 그 블록 앞에 삽입한다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    stubDropGeometry(tiptap, "p-1", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 110,
      });

      expect(editor.getDocument().blocks).toEqual([
        mediaBlock("image", "id-1"),
        paragraphBlock("p-1", "hello"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("drop 좌표가 대상 블록 rect 아래쪽 절반이면 그 블록 뒤에 삽입한다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    stubDropGeometry(tiptap, "p-1", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 130,
      });

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("빈 paragraph 위에 drop해도 교체하지 않고 앞/뒤에 삽입한다(paste와 다른 규칙)", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("empty-1", ""), tailParagraphBlock),
    );
    editable.focus();
    stubDropGeometry(tiptap, "empty-1", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 130,
      });

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("empty-1", ""),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("D7 — range selection 삭제", () => {
  it("문단 전체가 선택된 상태에서 paste하면 선택을 먼저 지우고(빈 문단이 되어) 교체한다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    const containerPos = findBlockPosition(tiptap.state.doc, "p-1");
    if (containerPos === null) throw new Error("fixture 준비 실패");
    tiptap.commands.setTextSelection({
      from: containerPos + 2,
      to: containerPos + 2 + "hello".length,
    });

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("drop은 D7을 적용하지 않는다 — 드롭 지점과 무관한 곳의 range selection을 지우지 않는다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(
        paragraphBlock("p-1", "hello"),
        paragraphBlock("p-2", "world"),
        tailParagraphBlock,
      ),
    );
    editable.focus();
    // p-1 전체를 선택해 두고, drop은 p-2를 겨냥한다 — p-1 selection과
    // drop 좌표는 서로 무관하다.
    const p1Pos = findBlockPosition(tiptap.state.doc, "p-1");
    if (p1Pos === null) throw new Error("fixture 준비 실패");
    tiptap.commands.setTextSelection({
      from: p1Pos + 2,
      to: p1Pos + 2 + "hello".length,
    });
    stubDropGeometry(tiptap, "p-2", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 130,
      });

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        paragraphBlock("p-2", "world"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("D2 — 다중 파일 체이닝", () => {
  it("파일 3개를 한 번에 paste하면 입력 순서대로 블록 3개가 생성된다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [
        fileOf("a.png", "image/png"),
        fileOf("b.mp4", "video/mp4"),
        fileOf("c.mp3", "audio/mpeg"),
      ]);

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        mediaBlock("video", "id-2"),
        mediaBlock("audio", "id-3"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("D8 — drop 디렉터리 필터", () => {
  it("디렉터리 항목이 섞인 drop은 디렉터리를 건너뛰고 파일만 입력 순서대로 삽입한다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    stubDropGeometry(tiptap, "p-1", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropEntries(
        editable,
        [
          { file: fileOf("a.png", "image/png"), isDirectory: false },
          { file: fileOf("folder", ""), isDirectory: true },
          { file: fileOf("b.png", "image/png"), isDirectory: false },
        ],
        { clientX: 0, clientY: 130 },
      );

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        mediaBlock("image", "id-2"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("D4 — 우선순위(파일이 표·HTML보다 먼저)", () => {
  it("파일과 표 형태 HTML이 동시에 있으면 파일이 처리되고 표 파싱은 시도되지 않는다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");

    withUnhandledErrorTracking((errors) => {
      pasteFilesAndHtml(
        editable,
        [fileOf("photo.png", "image/png")],
        "<table><tbody><tr><td>x</td></tr></tbody></table>",
      );

      const blocks = editor.getDocument().blocks;
      expect(blocks.some((block) => block.type === "table")).toBe(false);
      expect(blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

// Issue #168 roadmap RD-001 DELTA-02 전까지는 uploadFile 미등록 시
// drag/drop·paste의 파일 페이로드를 완전히 무시했다(R3 spec §4.1, IO-007 own
// 경계 — 이 문서 갱신은 RD-001 완료 동기화로 미룸, `_works/roadmap/RD-001.md`
// "결정" 참고). DELTA-02부터 파일 1개는 더 이상 무시하지 않고 로컬
// 프리뷰(ADR 0015) 미디어 블록을 삽입한다 — 콜백이 있을 때와 똑같이 파일이
// text/html보다 우선하고(D4 우선순위는 콜백 등록 여부와 무관하게 동일), 다만
// triggerMediaUpload 대신 localPreviewUrl·localPreviewFile attrs를 채운다.
// 파일 2개 이상도 DELTA-03부터 각자 독립적으로 로컬 프리뷰가 채워진다(항목별
// 독립 처리, roadmap.md 전체 포함 범위) — 더 이상 "완전히 무시"하지 않는다.
describe("업로드 콜백 미등록 — 로컬 프리뷰(Issue #168 roadmap RD-001 DELTA-02·03)", () => {
  it("파일 1개 paste는 로컬 프리뷰 미디어 블록을 삽입한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p-1", "hello"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("paste로 삽입한 노드의 PM attrs에 localPreviewUrl·localPreviewFile이 채워진다(모델에는 나타나지 않음)", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p-1", "hello"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");
    const file = fileOf("photo.png", "image/png");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [file]);
      expect(errors).toEqual([]);
    });

    const pos = findBlockPosition(tiptap.state.doc, "id-1");
    const node = pos === null ? null : tiptap.state.doc.nodeAt(pos);
    expect(typeof node?.attrs.localPreviewUrl).toBe("string");
    expect((node?.attrs.localPreviewUrl as string).startsWith("blob:")).toBe(
      true,
    );
    expect(node?.attrs.localPreviewFile).toBe(file);
    // RD-001 DELTA-01의 모델 왕복 제외 보증(media-block-codec.test.ts)이
    // 실제 삽입 경로에서도 성립함을 여기서 다시 확인한다 — model에는
    // url만 없는 평범한 image 블록만 남는다.
    expect(editor.getDocument().blocks).toContainEqual(
      mediaBlock("image", "id-1"),
    );
  });

  it("파일 1개 drop도 로컬 프리뷰 미디어 블록을 삽입한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p-1", "hello"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    stubDropGeometry(tiptap, "p-1", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 130,
      });

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("파일과 text/html이 함께 있으면 콜백 미등록이어도 파일이 우선한다(html은 처리되지 않음, D4)", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p-1", "hello"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");

    withUnhandledErrorTracking((errors) => {
      pasteFilesAndHtml(
        editable,
        [fileOf("photo.png", "image/png")],
        "<p>world</p>",
      );

      const blocks = editor.getDocument().blocks;
      expect(
        blocks.some((block) => block.type === "file" || block.type === "image"),
      ).toBe(true);
      expect(
        blocks.some(
          (block) =>
            block.type === "paragraph" &&
            (
              (block as ParagraphBlock).content[0] as
                Extract<InlineContentItem, { text: string }> | undefined
            )?.text === "world",
        ),
      ).toBe(false);
      expect(errors).toEqual([]);
    });
  });

  it("파일 2개 paste는 콜백 미등록이어도 각각 독립적으로 로컬 프리뷰 미디어 블록으로 삽입된다(Issue #168 roadmap RD-001 DELTA-03)", () => {
    const editor = createEditor({
      initialDocument: documentOf(
        paragraphBlock("p-1", "hello"),
        tailParagraphBlock,
      ),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [
        fileOf("a.png", "image/png"),
        fileOf("b.png", "image/png"),
      ]);

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        mediaBlock("image", "id-2"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });

    const attrsOf = (blockId: string) => {
      const pos = findBlockPosition(tiptap.state.doc, blockId);
      return pos === null ? null : tiptap.state.doc.nodeAt(pos)?.attrs;
    };
    const firstUrl = attrsOf("id-1")?.localPreviewUrl;
    const secondUrl = attrsOf("id-2")?.localPreviewUrl;
    expect(typeof firstUrl).toBe("string");
    expect(typeof secondUrl).toBe("string");
    // 항목별 독립 처리(roadmap.md 전체 포함 범위) — 각자 다른 File에서
    // 만든 서로 다른 Blob URL이라 값이 같으면 안 된다.
    expect(firstUrl).not.toBe(secondUrl);
  });
});
