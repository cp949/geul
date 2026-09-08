import { ExamplePage } from "../../example-shell/example-page.js";
import FormattingToolbarExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const FormattingToolbarPage = () => (
  <ExamplePage
    description="텍스트를 입력하고 드래그로 선택하면 서식 툴바가 나타난다. Bold, Italic, 색상 등을 시도해 보라."
    source={exampleSource}
    title="Formatting toolbar"
  >
    <FormattingToolbarExample />
  </ExamplePage>
);

export default FormattingToolbarPage;
