import { useEffect } from "react";

import { useDictionary, useEditorMount } from "./use-editor.js";

// spec §5 "로딩/차단 상태"의 "수 초" — DELTA-05가 확정한 값(RD-004-DELTA-05.md
// "결정"). 브라우저가 로드 실패와 삽입 차단(X-Frame-Options 등)을 구분해
// 알려주지 않아 순수 휴리스틱이다 — host에 노출하지 않는 비공개 상수(공개
// API 확장은 roadmap-workflow 승격 예외 대상이라 이 DELTA 범위 밖).
const IFRAME_LOAD_TIMEOUT_MS = 5000;

const IFRAME_SELECTOR = '[data-geul-media-kind="iframe"] > iframe';

const LOAD_STATUS_ATTR = "data-geul-iframe-load-status";
const LOAD_STATUS_LABEL_ATTR = "data-geul-iframe-load-status-label";

type TrackedIframe = {
  // 마지막으로 본 src. PM이 URL 교체 시 같은 <iframe> DOM 인스턴스를
  // 재사용할지 새로 만들지는 공개 계약이 아니라(RD-004-DELTA-05.md "결정"),
  // 엘리먼트 identity만으로 추적하면 재사용 케이스에서 이전 판정이 새
  // URL에 잘못 이어질 수 있다 — 매 스캔마다 이 값과 비교해 달라지면
  // 무조건 재시작한다.
  src: string;
  // load 완료(또는 뒤늦은 late-load) 후에는 null이다 — 그래도 Map에서
  // 엔트리 자체를 지우지 않는다. observer는 subtree 전체의 childList
  // mutation마다 scan()을 다시 돌리는데(이 iframe과 무관한 편집이어도
  // 트리거된다), 그때 track()이 "같은 src로 이미 처리됨"을 이 엔트리로
  // 판별하지 못하면 이미 끝난 로드를 새 iframe으로 오인해 타이머를
  // 재시작시킨다 — 정상 로드된 iframe이 몇 초 뒤 오탐 timeout으로
  // 잘못 표시되는 버그였다.
  timer: number | null;
  onLoad: () => void;
};

const clearTimedOutMarker = (wrapper: HTMLElement): void => {
  wrapper.removeAttribute(LOAD_STATUS_ATTR);
  wrapper.removeAttribute(LOAD_STATUS_LABEL_ATTR);
};

/**
 * iframe onLoad 미발생 타임아웃 휴리스틱 UI(roadmap Issue #212 RD-004
 * DELTA-05, spec §5 "로딩/차단 상태"). src가 있는 iframe이 `IFRAME_LOAD_
 * TIMEOUT_MS` 안에 `load`를 내지 않으면 wrapper(`[data-geul-media-kind=
 * "iframe"]`)에 `data-geul-iframe-load-status="timeout"` +
 * `data-geul-iframe-load-status-label`을 세팅한다 — `_iframe.scss`의
 * `::after`(`content: attr()`, `[data-geul-media-empty]::after`와 같은 기법)가
 * 그린다. 모델/커맨드에 저장하지 않는 순수 UI 휘발 상태다("Interact
 * 토글"과 동일 원칙, DELTA-03) — 문서 상태의 순수 함수가 아니라(같은
 * 문서로도 몇 초 뒤 상태가 바뀐다) core decoration(`MediaEmptyLabelExtension`
 * 선례)을 재사용할 수 없어 react effect + 타이머로 구현한다.
 *
 * `media-resize-handles.tsx`/`media-handle-overlays.tsx`의 `findMediaElement`/
 * `findMediaVisualElement`는 현재 hover/선택된 블록 하나만 조회하는 스코프
 * 함수라 재사용할 수 없다 — 이 컴포넌트는 에디터 루트 전체를
 * `MutationObserver`(`table-handles.tsx`/`media-toolbar.tsx` 선례와 같은
 * 패턴)로 스캔해 문서 안 모든 iframe을 동시에 추적한다. `SlashMenu`가
 * `MediaHandleOverlays`/`TableHandles`와 같은 이유로 자동 마운트하므로
 * `index.ts`에 공개 export하지 않는다.
 */
export const IframeLoadStatus = () => {
  const { element } = useEditorMount();
  const dictionary = useDictionary();

  useEffect(() => {
    if (element === null) return;
    const ownerWindow = element.ownerDocument.defaultView;
    if (ownerWindow === null) return;

    const tracked = new Map<HTMLIFrameElement, TrackedIframe>();

    const untrack = (iframe: HTMLIFrameElement): void => {
      const entry = tracked.get(iframe);
      if (entry === undefined) return;
      if (entry.timer !== null) ownerWindow.clearTimeout(entry.timer);
      iframe.removeEventListener("load", entry.onLoad);
      tracked.delete(iframe);
    };

    const track = (iframe: HTMLIFrameElement, wrapper: HTMLElement): void => {
      const src = iframe.getAttribute("src") ?? "";
      const existing = tracked.get(iframe);
      if (existing !== undefined && existing.src === src) return;
      if (existing !== undefined) untrack(iframe);

      clearTimedOutMarker(wrapper);

      const onLoad = () => {
        untrack(iframe);
        // 완전히 지우지 않고 같은 src의 "완료" 자리표시자를 남긴다(위
        // TrackedIframe.timer 주석) — 무관한 mutation으로 인한 재-scan이
        // 이 iframe을 새로 트래킹하며 타이머를 재시작하는 것을 막는다.
        tracked.set(iframe, { src, timer: null, onLoad });
        clearTimedOutMarker(wrapper);
      };
      iframe.addEventListener("load", onLoad);
      const timer = ownerWindow.setTimeout(() => {
        // 여기서도 완전히 지우지 않고 같은 src의 "timeout 확정" 자리표시자를
        // 남긴다 — 지우면 이 iframe과 무관한 다음 mutation의 재-scan이
        // 다시 "새 iframe"으로 오인해 timeout 문구를 껐다가 5초 뒤 다시
        // 켜는 깜빡임을 만든다.
        tracked.set(iframe, { src, timer: null, onLoad });
        wrapper.setAttribute(LOAD_STATUS_ATTR, "timeout");
        wrapper.setAttribute(
          LOAD_STATUS_LABEL_ATTR,
          dictionary.status.iframeLoadTimeout,
        );
      }, IFRAME_LOAD_TIMEOUT_MS);
      tracked.set(iframe, { src, timer, onLoad });
    };

    const scan = (): void => {
      const seen = new Set<HTMLIFrameElement>();
      element
        .querySelectorAll<HTMLIFrameElement>(IFRAME_SELECTOR)
        .forEach((iframe) => {
          seen.add(iframe);
          const wrapper = iframe.parentElement;
          if (wrapper !== null) track(iframe, wrapper);
        });
      for (const iframe of [...tracked.keys()]) {
        if (!seen.has(iframe)) untrack(iframe);
      }
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(element, {
      attributeFilter: ["src"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      for (const iframe of [...tracked.keys()]) untrack(iframe);
    };
  }, [element, dictionary]);

  return null;
};
