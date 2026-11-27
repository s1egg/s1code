import { useGT } from "gt-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { ProjectFavicon } from "../../components/ProjectFavicon";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import type { HomeProjectChoice } from "./homeProjectChoices";

const CHIP_WIDTH = 64;
const ICON_FRAME = 46;

/**
 * The project row, like the desktop project rail: the list always shows exactly one project, and
 * a tap switches to another. The filter button, where the bar above has none, opens the
 * environment and project sheet.
 */
export function HomeProjectStrip(props: {
  readonly choices: ReadonlyArray<HomeProjectChoice>;
  readonly selectedKey: string | null;
  readonly environmentLabel: string | null;
  readonly onSelect: (key: string) => void;
  /** Omitted where the bar above already opens the sheet. */
  readonly onOpenScopeSheet?: () => void;
  readonly onAddProject: () => void;
  /** List padding the scroller bleeds through so chips start where row content does. */
  readonly gutter: number;
}) {
  const gt = useGT();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={gt("Projects")}
      style={{ marginHorizontal: -props.gutter, overflow: "visible" }}
      contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 }}
    >
      {props.onOpenScopeSheet ? (
        <StripButton
          icon={
            props.environmentLabel === null
              ? "line.3.horizontal.decrease.circle"
              : "line.3.horizontal.decrease.circle.fill"
          }
          label={props.environmentLabel ?? gt("Filter", { $context: "noun, list scope button" })}
          active={props.environmentLabel !== null}
          accessibilityLabel={
            props.environmentLabel === null
              ? gt("Choose environment and project")
              : gt("Choose environment and project, showing {environment}", {
                  environment: props.environmentLabel,
                })
          }
          onPress={props.onOpenScopeSheet}
        />
      ) : null}
      {props.choices.map((choice) => (
        <ProjectChip
          key={choice.key}
          choice={choice}
          selected={choice.key === props.selectedKey}
          onPress={() => props.onSelect(choice.key)}
        />
      ))}
      <StripButton
        icon="plus"
        label={gt("Add", { $context: "verb, adds a project" })}
        accessibilityLabel={gt("Add project")}
        onPress={props.onAddProject}
      />
    </ScrollView>
  );
}

export function useHomeProjectChoiceLabel() {
  const gt = useGT();
  return (choice: HomeProjectChoice) =>
    [
      choice.title,
      choice.waiting > 0
        ? gt("{count, plural, one {{count} waiting on you} other {{count} waiting on you}}", {
            count: choice.waiting,
          })
        : null,
      choice.running > 0
        ? gt("{count, plural, one {{count} working} other {{count} working}}", {
            count: choice.running,
          })
        : null,
      choice.review > 0
        ? gt("{count, plural, one {{count} to review} other {{count} to review}}", {
            count: choice.review,
          })
        : null,
    ]
      .filter((part) => part !== null)
      .join(", ");
}

function ProjectChip(props: {
  readonly choice: HomeProjectChoice;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const gt = useGT();
  const label = useHomeProjectChoiceLabel();
  const { choice, selected } = props;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label(choice)}
      accessibilityHint={selected ? undefined : gt("Lists only this project's threads")}
      onPress={props.onPress}
      className="items-center"
      style={({ pressed }) => ({ width: CHIP_WIDTH, opacity: pressed ? 0.6 : 1 })}
    >
      <View
        className={cn(
          "items-center justify-center rounded-[14px] border-2",
          selected ? "border-primary" : "border-transparent",
        )}
        style={{ width: ICON_FRAME, height: ICON_FRAME }}
      >
        <HomeProjectChoiceIcon choice={choice} size={34} />
        {choice.waiting > 0 || choice.running > 0 ? (
          <View
            className={cn(
              "absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-screen",
              choice.waiting > 0 ? "bg-warning-foreground" : "bg-primary",
            )}
          />
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        className={cn(
          "mt-1 text-[11px]",
          selected ? "font-s1-semibold text-foreground" : "text-foreground-secondary",
        )}
      >
        {choice.title}
      </Text>
    </Pressable>
  );
}

/** The project's own icon, or a neutral glyph for the choice that holds threads without one. */
export function HomeProjectChoiceIcon(props: {
  readonly choice: HomeProjectChoice;
  readonly size: number;
}) {
  const project = props.choice.scope?.representative;
  if (!project) {
    return (
      <View
        className="items-center justify-center rounded-lg bg-subtle"
        style={{ width: props.size, height: props.size }}
      >
        <SymbolView
          name="bubble.left.and.bubble.right"
          size={Math.round(props.size * 0.5)}
          tintColorClassName="accent-icon-muted"
          type="monochrome"
        />
      </View>
    );
  }
  return (
    <ProjectFavicon
      environmentId={project.environmentId}
      projectTitle={props.choice.title}
      workspaceRoot={project.workspaceRoot}
      faviconPath={project.faviconPath}
      projectIcon={project.projectIcon}
      size={props.size}
    />
  );
}

function StripButton(props: {
  readonly icon:
    | "plus"
    | "line.3.horizontal.decrease.circle"
    | "line.3.horizontal.decrease.circle.fill";
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly active?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      className="items-center"
      style={({ pressed }) => ({ width: CHIP_WIDTH, opacity: pressed ? 0.6 : 1 })}
    >
      <View
        className="items-center justify-center rounded-[14px] border border-dashed border-border bg-subtle"
        style={{ width: ICON_FRAME, height: ICON_FRAME }}
      >
        <SymbolView
          name={props.icon}
          size={20}
          tintColorClassName={props.active ? "accent-primary" : "accent-icon-muted"}
          type="monochrome"
        />
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        className={cn(
          "mt-1 text-[11px]",
          props.active ? "font-s1-semibold text-primary-text" : "text-foreground-secondary",
        )}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}
