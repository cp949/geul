import type { EditorError, Result, TableCellTarget } from "@cp949/geul-core";

import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
  type TableCellColor,
} from "./table-cell-colors.js";
import { useEditor } from "./use-editor.js";

const swatchClassName = "geul-menu-swatch";
const sectionLabelClassName = "geul-menu-section-label";

export type TableCellColorPalettesProps = {
  tableBlockId: string;
  target: TableCellTarget;
  /**
   * 실패한 명령의 Result를 actionError로 남기는 쪽은 이 컴포넌트를 감싸는
   * 메뉴가 가진 useTableCommandFeedback()이다(Issue #66) — 여기서 독립된
   * useTableCommandFeedback()을 새로 부르지 않고 그 runCommand를 그대로 받아
   * 쓴다. 메뉴당 알림 슬롯이 하나뿐이라는 불변식(TableHandleMenu/
   * TableCellFormatMenu가 이미 다른 명령 실패도 같은 actionError로 보여준다)을
   * 이 컴포넌트가 두 번째 상태를 만들어 깨뜨리지 않기 위해서다(4차 아키텍처
   * 리뷰 카드 V 그릴링 결론).
   */
  runCommand: (
    run: () => Result<void, EditorError>,
    onSuccess?: () => void,
  ) => void;
  /** runCommand의 onSuccess로 그대로 전달된다 — 성공했을 때만 호출된다. */
  onApplied: () => void;
};

/**
 * 표 셀 글자색·배경색 팔레트(Text/Background 두 벌). TableHandleMenu(행/열
 * 대상)와 TableCellFormatMenu(셀 목록 대상)가 target만 다르게 넘겨 공유한다 —
 * applyColor·renderPalette 각 39줄이 두 파일에 문자 그대로 반복되던 것을
 * 이 컴포넌트 하나로 모았다(4차 아키텍처 리뷰 카드 V).
 */
export const TableCellColorPalettes = ({
  tableBlockId,
  target,
  runCommand,
  onApplied,
}: TableCellColorPalettesProps) => {
  const editor = useEditor();

  const applyColor = (property: "text" | "background", color: string | null) =>
    runCommand(
      () =>
        property === "text"
          ? editor.commands.setTableCellTextColor(tableBlockId, target, color)
          : editor.commands.setTableCellBackgroundColor(
              tableBlockId,
              target,
              color,
            ),
      onApplied,
    );

  const renderPalette = (
    property: "text" | "background",
    label: string,
    colors: TableCellColor[],
  ) => (
    <>
      <p className={sectionLabelClassName}>{label}</p>
      <div className="geul-menu-palette">
        {colors.map((color) => (
          <button
            aria-label={`${label} ${color.name}`}
            className={swatchClassName}
            key={color.value}
            onClick={() => applyColor(property, color.value)}
            onMouseDown={(event) => event.preventDefault()}
            role="menuitem"
            style={
              property === "background"
                ? { backgroundColor: color.value }
                : { backgroundColor: "transparent", color: color.value }
            }
            type="button"
          >
            {property === "text" ? "A" : ""}
          </button>
        ))}
        <button
          aria-label={`${label} None`}
          className={swatchClassName}
          onClick={() => applyColor(property, null)}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          ×
        </button>
      </div>
    </>
  );

  return (
    <>
      {renderPalette("text", "Text color", TABLE_TEXT_COLORS)}
      {renderPalette("background", "Background color", TABLE_BACKGROUND_COLORS)}
    </>
  );
};
