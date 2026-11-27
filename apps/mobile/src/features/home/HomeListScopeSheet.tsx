import { StackActions, useNavigation } from "@react-navigation/native";
import type { EnvironmentId } from "@s1tools/contracts";
import { useGT } from "gt-react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { SheetHeader } from "../../components/ui/SheetHeader";
import { cn } from "../../lib/cn";
import { steadyNavigationThreadShellsAtom } from "../../state/threads";
import { useLaunchingThreads, usePendingNewTasks } from "../../state/use-pending-new-tasks";
import { useWorkspaceState } from "../../state/workspace";
import { useAtomValue } from "@effect/atom-react";
import { homeListFilterEnvironments } from "./home-list-filter-menu";
import { useHomeListOptions } from "./home-list-options";
import type { HomeProjectChoice } from "./homeProjectChoices";
import { HomeProjectChoiceIcon, useHomeProjectChoiceLabel } from "./HomeProjectStrip";
import { useHomeProjectSelection } from "./useHomeProjectSelection";

/** Picks the environment, then the one project, that the thread list shows. */
export function HomeListScopeSheet() {
  const gt = useGT();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const threads = useLaunchingThreads(useAtomValue(steadyNavigationThreadShellsAtom));
  const pendingTasks = usePendingNewTasks();
  const { environments: workspaceEnvironments } = useWorkspaceState();
  const environments = homeListFilterEnvironments(workspaceEnvironments);
  const availableEnvironmentIds = useMemo(
    () => new Set(environments.map((environment) => environment.environmentId)),
    [environments],
  );
  const { options, setSelectedEnvironmentId, setSelectedProjectKey } =
    useHomeListOptions(availableEnvironmentIds);
  const { choices, selected } = useHomeProjectSelection({
    threads,
    pendingTasks,
    environmentId: options.selectedEnvironmentId,
    projectGroupingMode: options.projectGroupingMode,
    selectedProjectKey: options.selectedProjectKey,
  });
  const selectedKey = selected?.key ?? null;
  const environmentLabelById = new Map(
    environments.map((environment) => [environment.environmentId, environment.label]),
  );
  const showsEnvironmentOnRows = options.selectedEnvironmentId === null && environments.length > 1;

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <SheetHeader title={gt("Switch project")} onClose={() => navigation.goBack()} />
      <ScreenContent>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        >
          {environments.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityRole="radiogroup"
              accessibilityLabel={gt("Environment", { $context: "filter menu heading" })}
              contentContainerClassName="gap-2"
            >
              <EnvironmentOption
                label={gt("All environments")}
                selected={options.selectedEnvironmentId === null}
                onPress={() => setSelectedEnvironmentId(null)}
              />
              {environments.map((environment) => (
                <EnvironmentOption
                  key={environment.environmentId}
                  label={environment.label}
                  selected={options.selectedEnvironmentId === environment.environmentId}
                  onPress={() => setSelectedEnvironmentId(environment.environmentId)}
                />
              ))}
            </ScrollView>
          ) : null}
          {choices.length === 0 ? (
            <Text className="pt-6 text-center text-sm text-foreground-muted">
              {gt("No projects here yet.")}
            </Text>
          ) : (
            <View className="overflow-hidden rounded-2xl bg-grouped-card">
              {choices.map((choice, index) => (
                <ProjectRow
                  key={choice.key}
                  choice={choice}
                  selected={choice.key === selectedKey}
                  separator={index < choices.length - 1}
                  environmentLabel={
                    showsEnvironmentOnRows
                      ? environmentLabelOf(choice.environmentIds, environmentLabelById)
                      : null
                  }
                  onPress={() => {
                    setSelectedProjectKey(choice.key);
                    navigation.goBack();
                  }}
                />
              ))}
            </View>
          )}
          <View className="overflow-hidden rounded-2xl bg-grouped-card">
            <Pressable
              accessibilityRole="button"
              // Replacing the sheet opens the flow in one step, with no dismissal to wait out.
              onPress={() => navigation.dispatch(StackActions.replace("AddProject"))}
              className="min-h-14 flex-row items-center gap-3 px-4 py-2.5"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <View className="size-[30px] items-center justify-center rounded-lg border border-dashed border-border bg-subtle">
                <SymbolView
                  name="plus"
                  size={15}
                  tintColorClassName="accent-icon-muted"
                  type="monochrome"
                />
              </View>
              <Text className="text-[15px] font-s1-medium text-foreground">
                {gt("Add project")}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </ScreenContent>
    </View>
  );
}

function environmentLabelOf(
  environmentIds: ReadonlyArray<EnvironmentId>,
  labels: ReadonlyMap<EnvironmentId, string>,
): string | null {
  const known = environmentIds.flatMap((id) => {
    const label = labels.get(id);
    return label === undefined ? [] : [label];
  });
  return known.length === 0 ? null : known.join(", ");
}

function EnvironmentOption(props: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      onPress={props.onPress}
      className={cn(
        "min-h-9 justify-center rounded-full px-4",
        props.selected ? "bg-primary" : "bg-grouped-card",
      )}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Text
        numberOfLines={1}
        className={cn(
          "text-sm",
          props.selected ? "font-s1-semibold text-primary-foreground" : "text-foreground",
        )}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function ProjectRow(props: {
  readonly choice: HomeProjectChoice;
  readonly selected: boolean;
  readonly separator: boolean;
  readonly environmentLabel: string | null;
  readonly onPress: () => void;
}) {
  const gt = useGT();
  const label = useHomeProjectChoiceLabel();
  const { choice } = props;
  const detail = [props.environmentLabel, choice.scope?.representative.workspaceRoot ?? null]
    .filter((part) => part !== null && part !== "")
    .join(" · ");
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      accessibilityLabel={label(choice)}
      accessibilityHint={props.selected ? undefined : gt("Lists only this project's threads")}
      onPress={props.onPress}
      className="min-h-14 flex-row items-center gap-3 px-4 py-2.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <HomeProjectChoiceIcon choice={choice} size={30} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-s1-medium text-foreground">
          {choice.title}
        </Text>
        {detail.length > 0 ? (
          <Text numberOfLines={1} className="text-xs text-foreground-muted">
            {detail}
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-center gap-2" importantForAccessibility="no-hide-descendants">
        {choice.running > 0 ? (
          <View className="flex-row items-center gap-1">
            <View className="size-2 rounded-full bg-primary" />
            <Text className="text-xs tabular-nums text-foreground-secondary">{choice.running}</Text>
          </View>
        ) : null}
        {choice.waiting > 0 ? (
          <View className="flex-row items-center gap-1">
            <View className="size-2 rounded-full bg-warning-foreground" />
            <Text className="text-xs tabular-nums text-foreground-secondary">{choice.waiting}</Text>
          </View>
        ) : null}
      </View>
      {props.selected ? (
        <SymbolView
          name="checkmark"
          size={16}
          tintColorClassName="accent-primary"
          type="monochrome"
        />
      ) : null}
    </Pressable>
  );
}
