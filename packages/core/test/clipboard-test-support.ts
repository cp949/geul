/**
 * jsdom Clipboard 폴리필 설치(side-effect) + 붙여넣기 이벤트 dispatch helper.
 */

// jsdom(27.x)은 Clipboard API(DataTransfer/ClipboardEvent)를 구현하지 않는다
// (jsdom/jsdom#1568) — 실제 ClipboardEvent를 가로채는 handlePaste 계약을
// 검증하려면 TablePasteExtension이 실제로 사용하는 표면(getData)만 최소로
// 폴리필한다. 이후 jsdom이 네이티브로 지원하게 되면 이 블록은 자동으로
// 건너뛴다.
if (typeof globalThis.DataTransfer === "undefined") {
  class JsdomDataTransfer {
    private readonly store = new Map<string, string>();

    setData(format: string, data: string): void {
      this.store.set(format, data);
    }

    getData(format: string): string {
      return this.store.get(format) ?? "";
    }
  }

  globalThis.DataTransfer = JsdomDataTransfer as unknown as typeof DataTransfer;
}

if (typeof globalThis.ClipboardEvent === "undefined") {
  class JsdomClipboardEvent extends Event {
    readonly clipboardData: DataTransfer | null;

    constructor(type: string, eventInit?: ClipboardEventInit) {
      super(type, eventInit);
      this.clipboardData = eventInit?.clipboardData ?? null;
    }
  }

  globalThis.ClipboardEvent =
    JsdomClipboardEvent as unknown as typeof ClipboardEvent;
}

/** 주어진 MIME → 문자열 항목을 클립보드 데이터로 담아 editable에 paste 이벤트를 dispatch한다(bubbles·cancelable). */
export const pasteData = (
  editable: HTMLElement,
  entries: Record<string, string>,
): void => {
  const data = new DataTransfer();
  for (const [format, value] of Object.entries(entries))
    data.setData(format, value);
  editable.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    }),
  );
};

/** text/html 하나만 담는 pasteData 축약. */
export const pasteHtml = (editable: HTMLElement, html: string): void =>
  pasteData(editable, { "text/html": html });

/**
 * jsdom dispatchEvent는 리스너 예외를 재던지지 않는다 — window의 전역
 * error 이벤트로만 실제 미처리 예외 유무를 잡는다. quote-paste-fallback.
 * test.ts가 인라인으로 처음 쓴 패턴을 옛 list-paste-fallback.test.ts(삭제
 * 됨, RD-005)가 로컬 헬퍼로 옮겼고, clipboard-paste-extension.test.ts가
 * 세 번째 소비 파일로 등장해 여기로 승격했다(G-TST-002).
 * clipboard-paste-list.test.ts(RD-005)도 이 헬퍼를 쓴다.
 */
export const withUnhandledErrorTracking = (
  run: (errors: unknown[]) => void,
): void => {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => errors.push(event.error);
  window.addEventListener("error", onError);
  try {
    run(errors);
  } finally {
    window.removeEventListener("error", onError);
  }
};
