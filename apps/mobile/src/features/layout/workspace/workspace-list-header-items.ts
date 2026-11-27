import type { NativeStackHeaderItem } from "@react-navigation/native-stack";
import { msg } from "gt-react-native";

import { m, type MessageResolver } from "../../../i18n/messages";
import { withNativeGlassHeaderItem } from "../native-glass-header-items";

type NativeHeaderIcon = NonNullable<Extract<NativeStackHeaderItem, { type: "button" }>["icon"]>;

function sfSymbolIcon(name: string): NativeHeaderIcon {
  return { type: "sfSymbol", name: name as never };
}

/** The sidebar column's bar items, as native header items so the title can size around them. */
export function createWorkspaceListHeaderItems(input: {
  readonly filter: {
    readonly accessibilityLabel: string;
    readonly icon: string;
    readonly title: string;
    readonly onPress: () => void;
  };
  readonly onOpenSettings?: () => void;
  readonly resolve?: MessageResolver;
}): NativeStackHeaderItem[] {
  const resolve = input.resolve ?? m;
  return [
    withNativeGlassHeaderItem({
      type: "button",
      axisBehavior: "horizontalOnly",
      label: input.filter.title,
      accessibilityLabel: input.filter.accessibilityLabel,
      icon: sfSymbolIcon(input.filter.icon),
      onPress: input.filter.onPress,
    }),
    ...(input.onOpenSettings
      ? [
          withNativeGlassHeaderItem({
            type: "button",
            axisBehavior: "horizontalOnly",
            label: resolve(msg("Settings")),
            accessibilityLabel: resolve(msg("Open settings")),
            icon: sfSymbolIcon("gearshape"),
            onPress: input.onOpenSettings,
          }),
        ]
      : []),
  ];
}
