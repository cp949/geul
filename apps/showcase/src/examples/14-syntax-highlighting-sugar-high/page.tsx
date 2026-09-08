import { ExamplePage } from "../../example-shell/example-page.js";
import SyntaxHighlightingSugarHighExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const SyntaxHighlightingSugarHighPage = () => (
  <ExamplePage
    description="sugar-high(zero-dependency 경량 구문 강조 라이브러리)로 만든 SyntaxHighlighter 함수를 EditorProvider에 연결한 예제다. 코드 블록의 각 토큰에 sugar-high CSS class가 적용되지만 source 텍스트 자체는 바뀌지 않는다."
    source={exampleSource}
    title="Syntax highlighting (sugar-high)"
  >
    <SyntaxHighlightingSugarHighExample />
  </ExamplePage>
);

export default SyntaxHighlightingSugarHighPage;
