// @vitest-environment jsdom
/**
 * 공용 선택 헬퍼 `selection-events.ts`가 소유한 주장을 고정한다.
 *
 * 그 모듈이 존재하는 이유 전체가 한 가지 사실이다 — jsdom은 `selectionchange`를
 * **매크로태스크로 큐잉**하므로 동기로 진행하는 테스트 본문은 그 이벤트를 절대
 * 보지 못하고, 그래서 선택을 바꾼 테스트가 이벤트를 직접 쏴야 한다. jsdom이
 * 동기 발행으로 돌아서면 그 전제가 무너지는데, 헤더 주석만으로는 아무것도 지지
 * 않는다. 실제로 이 파일이 생기기 전에는 그 헤더의 주장 하나가 거짓인 채로
 * react 테스트 165건 중 아무것도 실패하지 않았다. 여기서 주장들을 실행 가능한
 * 형태로 고정한다.
 *
 * 아래 수치는 전부 이 파일이 직접 측정해서 적은 것이지 헤더에서 옮겨 온 값이
 * 아니다. 헤더와 여기가 어긋나면 헤더가 틀린 것이다.
 *
 * 리스너를 달기 전에 매크로태스크 하나를 흘려보내는 것이 이 파일의 전제다.
 * 큐잉된 지연분은 테스트 경계를 넘어 살아남으므로, 흘려보내지 않으면 앞 테스트가
 * 남긴 지연분이 뒤 테스트의 횟수로 들어온다(실측: 드레인을 뺀 사본에서 "빈
 * 선택에서 selectText 1회는 다음 매크로태스크까지 누적 2회다"가
 * `expected 3 to be 2`로 지고, 같은 사본에서 그 하나만 따로 돌리면 통과한다).
 */
import { cleanup, render } from "@testing-library/react";
import { act, createElement, useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  collapseSelection,
  fireSelectionChange,
  selectText,
} from "./selection-events.js";

afterEach(cleanup);

/** 다음 매크로태스크까지 기다린다. 큐잉된 `selectionchange`가 그때 도착한다. */
const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * 선택 대상 노드를 `document.body`에 붙이고 `selectionchange` 횟수를 세는
 * 리스너를 단다. 리스너를 달기 전 매크로태스크 하나를 흘려보내 앞 테스트가 남긴
 * 지연분을 털어낸다(파일 첫머리 주석 참조).
 *
 * `dispose`는 반드시 `finally`에서 부른다 — body에 직접 붙인 노드는
 * `afterEach(cleanup)`의 정리 대상이 아니다(`PIT-0017`).
 */
const openSelectionProbe = async () => {
  const host = document.createElement("div");
  const text = document.createTextNode("abcdefghij");
  host.append(text);
  document.body.append(host);
  window.getSelection()?.removeAllRanges();
  await nextMacrotask();

  let fired = 0;
  const countFired = () => {
    fired += 1;
  };
  document.addEventListener("selectionchange", countFired);

  return {
    host,
    text,
    fired: () => fired,
    dispose: () => {
      document.removeEventListener("selectionchange", countFired);
      host.remove();
      window.getSelection()?.removeAllRanges();
    },
  };
};

/** 노드 안의 구간을 `selectionchange` 없이 선택한다. 발행 시점만 볼 때 쓴다. */
const addRangeQuietly = (node: Node, start: number, end: number) => {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  window.getSelection()?.addRange(range);
};

/** `selectionchange`를 구독해 받은 횟수를 그대로 그리는 오버레이 최소형. */
const SelectionChangeCounter = () => {
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    const listener = () => setSeen((value) => value + 1);
    document.addEventListener("selectionchange", listener);
    return () => document.removeEventListener("selectionchange", listener);
  }, []);
  return createElement("span", null, String(seen));
};

describe("jsdom의 selectionchange 발행 시점", () => {
  it("선택을 세우면 동기·마이크로태스크 시점에는 발행하지 않고 다음 매크로태스크에서 1회 발행한다", async () => {
    const probe = await openSelectionProbe();
    try {
      addRangeQuietly(probe.text, 0, 3);

      expect(probe.fired()).toBe(0);
      await Promise.resolve();
      expect(probe.fired()).toBe(0);
      await nextMacrotask();
      expect(probe.fired()).toBe(1);
      await nextMacrotask();
      expect(probe.fired()).toBe(1);
    } finally {
      probe.dispose();
    }
  });

  it("선택을 지우는 것도 같은 매크로태스크 지연을 받는다", async () => {
    const probe = await openSelectionProbe();
    try {
      addRangeQuietly(probe.text, 0, 3);
      await nextMacrotask();
      const afterSelecting = probe.fired();

      window.getSelection()?.removeAllRanges();

      expect(probe.fired() - afterSelecting).toBe(0);
      await nextMacrotask();
      expect(probe.fired() - afterSelecting).toBe(1);
    } finally {
      probe.dispose();
    }
  });

  it("선택이 실제로 바뀌지 않으면 아예 발행하지 않는다", async () => {
    const probe = await openSelectionProbe();
    try {
      expect(window.getSelection()?.rangeCount).toBe(0);

      window.getSelection()?.removeAllRanges();

      expect(probe.fired()).toBe(0);
      await nextMacrotask();
      expect(probe.fired()).toBe(0);
      await nextMacrotask();
      expect(probe.fired()).toBe(0);
    } finally {
      probe.dispose();
    }
  });

  it("act()는 큐잉된 지연분을 앞당기지 않는다", async () => {
    const probe = await openSelectionProbe();
    try {
      addRangeQuietly(probe.text, 0, 3);

      await act(async () => {});
      expect(probe.fired()).toBe(0);
      act(() => {});
      expect(probe.fired()).toBe(0);

      await nextMacrotask();
      expect(probe.fired()).toBe(1);
    } finally {
      probe.dispose();
    }
  });
});

describe("selectText", () => {
  it("텍스트 노드의 [start, end) 구간을 문자 단위로 선택하고 동기 시점에 정확히 1회 발행한다", async () => {
    const probe = await openSelectionProbe();
    try {
      selectText(probe.text, 2, 5);

      expect(window.getSelection()?.rangeCount).toBe(1);
      expect(window.getSelection()?.toString()).toBe("cde");
      expect(probe.fired()).toBe(1);
    } finally {
      probe.dispose();
    }
  });

  it("요소 노드에서는 오프셋이 자식 단위다", async () => {
    const probe = await openSelectionProbe();
    try {
      const first = document.createElement("span");
      first.textContent = "AA";
      const second = document.createElement("span");
      second.textContent = "BB";
      probe.host.append(first, second);

      selectText(probe.host, 1, 3);

      expect(window.getSelection()?.toString()).toBe("AABB");
    } finally {
      probe.dispose();
    }
  });

  it("기존 선택을 남기지 않고 대체한다", async () => {
    const probe = await openSelectionProbe();
    try {
      selectText(probe.text, 0, 3);
      selectText(probe.text, 4, 7);

      expect(window.getSelection()?.rangeCount).toBe(1);
      expect(window.getSelection()?.toString()).toBe("efg");
    } finally {
      probe.dispose();
    }
  });
});

describe("collapseSelection", () => {
  it("rangeCount를 0으로 만들고 동기 시점에 정확히 1회 발행한다", async () => {
    const probe = await openSelectionProbe();
    try {
      selectText(probe.text, 0, 3);
      await nextMacrotask();
      const afterSelecting = probe.fired();

      collapseSelection();

      expect(window.getSelection()?.rangeCount).toBe(0);
      expect(probe.fired() - afterSelecting).toBe(1);
    } finally {
      probe.dispose();
    }
  });
});

describe("fireSelectionChange", () => {
  it("선택을 바꾸지 않고 동기 1회만 발행한다", async () => {
    const probe = await openSelectionProbe();
    try {
      selectText(probe.text, 0, 3);
      await nextMacrotask();
      const afterSelecting = probe.fired();

      fireSelectionChange();

      expect(probe.fired() - afterSelecting).toBe(1);
      expect(window.getSelection()?.toString()).toBe("abc");
      await nextMacrotask();
      await nextMacrotask();
      expect(probe.fired() - afterSelecting).toBe(1);
    } finally {
      probe.dispose();
    }
  });
});

/**
 * 헬퍼가 직접 쏘는 1회 뒤에 jsdom이 큐잉한 지연분이 따라온다. 호출부에 `await`가
 * 있으면 그 지연분이 뒤늦게 도착하므로, 리스너 호출 횟수를 단언하는 테스트는 이
 * 누적값을 알아야 한다.
 */
describe("큐잉된 지연분의 누적 횟수", () => {
  it("빈 선택에서 selectText 1회는 다음 매크로태스크까지 누적 2회다", async () => {
    const probe = await openSelectionProbe();
    try {
      selectText(probe.text, 0, 3);

      expect(probe.fired()).toBe(1);
      await nextMacrotask();
      expect(probe.fired()).toBe(2);
      await nextMacrotask();
      expect(probe.fired()).toBe(2);
    } finally {
      probe.dispose();
    }
  });

  it("선택이 이미 있으면 selectText 1회는 누적 3회다", async () => {
    const probe = await openSelectionProbe();
    try {
      selectText(probe.text, 0, 3);
      await nextMacrotask();
      await nextMacrotask();
      const afterSelecting = probe.fired();

      selectText(probe.text, 4, 7);

      expect(probe.fired() - afterSelecting).toBe(1);
      await nextMacrotask();
      expect(probe.fired() - afterSelecting).toBe(3);
      await nextMacrotask();
      expect(probe.fired() - afterSelecting).toBe(3);
    } finally {
      probe.dispose();
    }
  });

  it("선택이 있을 때 collapseSelection은 누적 2회다", async () => {
    const probe = await openSelectionProbe();
    try {
      selectText(probe.text, 0, 3);
      await nextMacrotask();
      await nextMacrotask();
      const afterSelecting = probe.fired();

      collapseSelection();

      expect(probe.fired() - afterSelecting).toBe(1);
      await nextMacrotask();
      expect(probe.fired() - afterSelecting).toBe(2);
      await nextMacrotask();
      expect(probe.fired() - afterSelecting).toBe(2);
    } finally {
      probe.dispose();
    }
  });

  it("이미 빈 선택에서 collapseSelection은 지연분을 남기지 않아 누적 1회다", async () => {
    const probe = await openSelectionProbe();
    try {
      collapseSelection();

      expect(probe.fired()).toBe(1);
      await nextMacrotask();
      await nextMacrotask();
      expect(probe.fired()).toBe(1);
    } finally {
      probe.dispose();
    }
  });
});

describe("act 감싸기", () => {
  it("리스너의 React state 갱신이 동기 단언 시점에 렌더까지 끝나 있다", () => {
    const view = render(createElement(SelectionChangeCounter));

    fireSelectionChange();

    expect(view.container.textContent).toBe("1");
  });
});
