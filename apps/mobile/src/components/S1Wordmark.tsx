import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

const S1_MARK =
  "M0 0h28v6H0zm0 0h6v16H0zm0 13h28v6H0zm22 13h6v19h-6zM0 26h28v6H0zM36 0h8v6h-8zM40 0h8v32h-8zM34 26h22v6H34z";

export function S1Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  return (
    <Svg accessibilityLabel="S1" height={props.height} width={props.height * 2} viewBox="0 0 64 32">
      <ThemedPath
        d={S1_MARK}
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
