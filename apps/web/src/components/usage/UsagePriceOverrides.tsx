import { useAtomValue } from "@effect/atom-react";
import { AuthSettingsWriteScope, type EnvironmentId, sessionGrantsScope } from "@s1tools/contracts";
import { ChevronDownIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { AsyncResult, Atom } from "effect/reactivity";
import { msg, T, useGT, useMessages, Var } from "gt-react";
import { useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { environmentSession, readEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useUsage, type EnvironmentUsageStatus } from "../../state/usage";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Menu, MenuCheckboxItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { readUsagePagePreferences, usageWindowFor } from "./usagePagePreferences";
import { isUsagePriceEdit, USAGE_PRICE_FIELDS } from "./usagePriceForm";
import {
  isEmptyUsagePriceDraft,
  usageAliasCell,
  usagePriceCell,
  usagePriceTableChanges,
  usagePriceTableErrors,
  type UsagePriceDraft,
  type UsagePriceField,
} from "./usagePriceTable";
import {
  writeUsagePrices,
  type UsagePriceTarget,
  type UsagePriceWriteResult,
} from "./usagePriceTargets";

const priceTargetsAtom = Atom.make((get): readonly UsagePriceTarget[] =>
  [...get(environmentPresentations.presentationsAtom)].map(([environmentId, environment]) => {
    const settings = get(serverEnvironment.settingsValueAtom(environmentId));
    const session = get(environmentSession.sessionStateAtom(environmentId));
    const sessionData = AsyncResult.getOrElse(session, () => null);
    const access =
      session._tag === "Failure"
        ? "denied"
        : sessionData === null
          ? session.waiting
            ? "pending"
            : "denied"
          : sessionGrantsScope(sessionData, AuthSettingsWriteScope)
            ? "granted"
            : "denied";
    return {
      environmentId,
      label: environment.entry.target.label,
      prices: settings?.usagePriceOverrides ?? null,
      aliases:
        environment.serverConfig?.environment.capabilities.usageModelAliases === true
          ? (settings?.usageModelAliases ?? null)
          : null,
      unavailable:
        environment.connection.phase !== "connected"
          ? msg("Offline")
          : settings === null
            ? msg("Prices not loaded")
            : access === "pending"
              ? msg("Checking permissions…")
              : access === "denied"
                ? msg("Read-only access")
                : null,
    };
  }),
);

type SaveAttempt = {
  readonly drafts: readonly UsagePriceDraft[];
  readonly destinations: readonly {
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }[];
  readonly results: ReadonlyMap<
    EnvironmentId,
    UsagePriceWriteResult | { readonly status: "saving" }
  >;
};

/** The model the next prices view opens a row for, set by whatever opens it. */
const requestedPriceModelAtom = Atom.make<string | undefined>(undefined).pipe(
  Atom.keepAlive,
  Atom.withLabel("usage:requested-price-model"),
);

export function requestUsagePriceModel(model: string | undefined) {
  appAtomRegistry.set(requestedPriceModelAtom, model);
}

/** Custom model prices, as the thread details sidebar's drill-in under Usage. */
export function UsagePricesDrillIn({
  selectedEnvironmentIds,
}: {
  /** The environments Usage is filtered to; new prices save to these unless changed here. */
  readonly selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
}) {
  const initialModel = useAtomValue(requestedPriceModelAtom);
  // The same window Usage last read, so model suggestions come from its cached answers.
  const [window] = useState(() => usageWindowFor(readUsagePagePreferences().windowDays));
  const { environments } = useUsage(window);
  return (
    <UsagePriceOverrides
      key={initialModel}
      usage={environments}
      initialSelectedEnvironmentIds={selectedEnvironmentIds}
      initialModel={initialModel}
    />
  );
}

export function UsagePriceOverrides({
  usage,
  initialSelectedEnvironmentIds = null,
  initialModel,
}: {
  readonly usage: readonly EnvironmentUsageStatus[];
  readonly initialSelectedEnvironmentIds?: ReadonlySet<EnvironmentId> | null;
  readonly initialModel?: string | undefined;
}) {
  const gt = useGT();
  const messages = useMessages();
  const environments = useAtomValue(priceTargetsAtom).map((target) =>
    target.unavailable === null ? target : { ...target, unavailable: messages(target.unavailable) },
  );
  const [selectedIds, setSelectedIds] = useState(initialSelectedEnvironmentIds);
  const selected = environments.filter(
    (environment) => selectedIds === null || selectedIds.has(environment.environmentId),
  );
  const [drafts, setDrafts] = useState<readonly UsagePriceDraft[]>(() =>
    initialModel === undefined ||
    selected.some(
      (environment) =>
        Object.hasOwn(environment.prices ?? {}, initialModel) ||
        Object.hasOwn(environment.aliases ?? {}, initialModel),
    )
      ? []
      : [{ id: "new:initial", model: initialModel, isNew: true, values: {} }],
  );
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState<SaveAttempt | null>(null);
  const focusRowRef = useRef<string | null>(null);
  const nextRowId = useRef(0);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const customModels = [
    ...new Set(
      selected.flatMap((environment) => [
        ...Object.keys(environment.prices ?? {}),
        ...Object.keys(environment.aliases ?? {}),
      ]),
    ),
  ].sort();
  const models = [
    ...new Set([
      ...customModels,
      ...usage
        .filter((environment) =>
          selected.some((target) => target.environmentId === environment.environmentId),
        )
        .flatMap((environment) => environment.summary?.buckets.map((bucket) => bucket.model) ?? []),
    ]),
  ].sort();
  const newModels = new Set(
    drafts.filter((draft) => draft.isNew).map((draft) => draft.model.trim()),
  );
  const rows: readonly UsagePriceDraft[] = [
    ...customModels
      .filter((model) => attempt === null || !newModels.has(model))
      .map(
        (model) =>
          drafts.find((draft) => draft.id === `model:${model}`) ?? {
            id: `model:${model}`,
            model,
            isNew: false,
            values: {},
          },
      ),
    ...drafts.filter((draft) => draft.isNew),
  ];
  const stagedDrafts = drafts.filter((draft) => !isEmptyUsagePriceDraft(draft));
  const errors = usagePriceTableErrors(selected, stagedDrafts, messages);
  // New rows still block Save, but show a price error only once a price or mapping is typed.
  const awaitingPrice = new Set<string>();
  for (const draft of stagedDrafts) {
    if (!draft.isNew) continue;
    if (draft.model.trim() === "") errors.set(draft.id, gt("Enter a model ID."));
    else if (
      attempt === null &&
      (customModels.includes(draft.model.trim()) ||
        drafts.some((other) => other.id !== draft.id && other.model.trim() === draft.model.trim()))
    )
      errors.set(draft.id, gt("This model already has a row. Edit its prices there."));
    else if (
      (draft.alias ?? "").trim() === "" &&
      Object.values(draft.values).every((value) => value.trim() === "")
    )
      awaitingPrice.add(draft.id);
  }
  const failedDestinations =
    attempt?.destinations.filter(
      (destination) => attempt.results.get(destination.environmentId)?.status === "failed",
    ) ?? [];
  const locked = pending || failedDestinations.length > 0;
  const hasChanges = stagedDrafts.length > 0;
  const destinationLabel =
    selected.length === 1
      ? selected[0]!.label
      : gt("{count, plural, one {{count} environments} other {{count} environments}}", {
          count: selected.length,
        });
  const selectionLabel = selectedIds === null ? gt("All environments") : destinationLabel;
  const discard = () => {
    setDrafts([]);
    setAttempt(null);
  };
  const selectEnvironments = (ids: ReadonlySet<EnvironmentId> | null) => {
    setSelectedIds(ids);
    setAttempt(null);
  };
  const updateDraft = (draft: UsagePriceDraft) => {
    setDrafts((previous) =>
      previous.some((entry) => entry.id === draft.id)
        ? previous.map((entry) => (entry.id === draft.id ? draft : entry))
        : [...previous, draft],
    );
    setAttempt(null);
  };
  const matchesSaved = (
    row: UsagePriceDraft,
    cell: { value: string; placeholder: string },
    value: string,
  ) =>
    !row.isNew &&
    cell.placeholder !== gt("Mixed") &&
    cell.placeholder !== gt("Unavailable") &&
    value === cell.value;
  const updateOrDropDraft = (draft: UsagePriceDraft) => {
    if (!draft.isNew && Object.keys(draft.values).length === 0 && draft.alias === undefined)
      setDrafts((previous) => previous.filter((entry) => entry.id !== draft.id));
    else updateDraft(draft);
  };
  const editCell = (row: UsagePriceDraft, field: UsagePriceField, value: string) => {
    const values = { ...row.values, [field]: value };
    const original = usagePriceCell(selected, row.model, field, messages);
    if (matchesSaved(row, original, value)) delete values[field];
    updateOrDropDraft({ ...row, values });
  };
  const editAlias = (row: UsagePriceDraft, value: string) => {
    const { alias: _alias, ...rest } = row;
    const original = usageAliasCell(selected, row.model, messages);
    updateOrDropDraft(
      matchesSaved(row, original, value)
        ? // A restored mapping hides the price inputs, so their typed values go too.
          { ...rest, values: value === "" ? rest.values : {} }
        : { ...rest, alias: value },
    );
  };
  const save = async (retry = false) => {
    if (pending) return;
    const destinations = retry ? failedDestinations : selected;
    const edits = retry && attempt ? attempt.drafts : stagedDrafts;
    if (destinations.length === 0 || edits.length === 0) return;
    const targets = destinations.map(
      (destination) =>
        environments.find(
          (environment) => environment.environmentId === destination.environmentId,
        ) ?? {
          ...destination,
          prices: null,
          aliases: null,
          unavailable: gt("Environment removed"),
        },
    );
    const changes = new Map(
      targets.map((target) => [
        target.environmentId,
        usagePriceTableChanges(target, edits, messages),
      ]),
    );
    setPending(true);
    setAttempt((previous) => ({
      drafts: edits,
      destinations: retry && previous ? previous.destinations : targets,
      results: new Map([
        ...(retry && previous ? previous.results : []),
        ...targets.map((target) => [target.environmentId, { status: "saving" } as const] as const),
      ]),
    }));
    let failed = false;
    await writeUsagePrices({
      targets: targets.map((target) => ({
        ...target,
        unavailable:
          target.unavailable ?? [...changes.get(target.environmentId)!.errors.values()][0] ?? null,
      })),
      changes: new Map([...changes].map(([id, plan]) => [id, plan.changes])),
      write: async (input) =>
        readEnvironmentScope(input.environmentId, AuthSettingsWriteScope)
          ? updateSettings(input)
          : { _tag: "Failure" },
      onResult: (environmentId, result) => {
        if (result.status === "failed") failed = true;
        setAttempt((previous) =>
          previous === null
            ? null
            : { ...previous, results: new Map(previous.results).set(environmentId, result) },
        );
      },
    });
    setPending(false);
    if (!failed) setDrafts([]);
  };

  const applyMenu = (
    <Menu>
      <MenuTrigger
        render={<Button variant="outline" size="xs" className="min-w-0" />}
        aria-labelledby="usage-prices-apply-label usage-prices-selection"
        disabled={pending || hasChanges}
      >
        <span id="usage-prices-selection" className="truncate">
          {selectionLabel}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0" aria-hidden />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuCheckboxItem
          checked={selectedIds === null}
          closeOnClick={false}
          onCheckedChange={(checked) => selectEnvironments(checked ? null : new Set())}
        >
          <T>All environments</T>
        </MenuCheckboxItem>
        <MenuSeparator />
        {environments.map((environment) => (
          <MenuCheckboxItem
            key={environment.environmentId}
            checked={selectedIds === null || selectedIds.has(environment.environmentId)}
            closeOnClick={false}
            onCheckedChange={(checked) => {
              const next = new Set(selected.map((target) => target.environmentId));
              if (checked) next.add(environment.environmentId);
              else next.delete(environment.environmentId);
              selectEnvironments(next.size === environments.length ? null : next);
            }}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="min-w-0 flex-1 truncate">{environment.label}</span>
              {environment.unavailable ? (
                <span className="text-xs text-muted-foreground">{environment.unavailable}</span>
              ) : null}
            </span>
          </MenuCheckboxItem>
        ))}
      </MenuPopup>
    </Menu>
  );

  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-muted-foreground">
        <T>
          Prices and mappings apply to all past and future usage on the environments you select.
        </T>
      </p>
      <div className="flex min-w-0 items-center gap-2">
        <Label id="usage-prices-apply-label" className="shrink-0">
          <T>Apply to</T>
        </Label>
        {applyMenu}
      </div>
      {selected.length === 0 ? (
        <p className="text-muted-foreground">
          {environments.length === 0
            ? gt("Connect an environment to set model prices.")
            : gt("Select an environment to see and change its model prices.")}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              <T>USD / million tokens</T>
            </span>
            <Button
              size="xs"
              variant="ghost"
              disabled={locked}
              onClick={() => {
                const id = `new:${nextRowId.current++}`;
                focusRowRef.current = id;
                updateDraft({ id, model: "", isNew: true, values: {} });
              }}
            >
              <PlusIcon aria-hidden />
              <T>Add model price</T>
            </Button>
          </div>
          <ul aria-label={gt("Custom model prices")} className="flex flex-col gap-2">
            {rows.length === 0 ? (
              <li className="py-4 text-center text-muted-foreground">
                {selected.some((environment) => environment.prices === null)
                  ? gt("Some environment prices are unavailable.")
                  : gt("No custom prices or mappings. Add a row to set one.")}
              </li>
            ) : (
              rows.map((row) => {
                const aliasCell = usageAliasCell(selected, row.model, messages);
                const alias = (row.alias ?? aliasCell.value).trim();
                const error = awaitingPrice.has(row.id) ? undefined : errors.get(row.id);
                return (
                  <li
                    key={row.id}
                    data-row-id={row.id}
                    className="flex flex-col gap-2 rounded-lg border border-border p-2"
                  >
                    <div className="flex min-w-0 items-start gap-1">
                      <div className="min-w-0 flex-1">
                        {row.isNew ? (
                          <Input
                            size="compact"
                            value={row.model}
                            ref={(node) => {
                              if (node && focusRowRef.current === row.id) {
                                node.focus();
                                focusRowRef.current = null;
                              }
                            }}
                            aria-label={gt("New model ID")}
                            aria-invalid={error !== undefined || undefined}
                            list="usage-price-models"
                            placeholder={gt("Model ID")}
                            autoComplete="off"
                            spellCheck={false}
                            disabled={locked}
                            onChange={(event) => updateDraft({ ...row, model: event.target.value })}
                          />
                        ) : (
                          <span
                            className={cn(
                              "block py-1 font-medium break-all text-foreground",
                              row.removed && "text-muted-foreground line-through",
                            )}
                          >
                            {row.model}
                          </span>
                        )}
                      </div>
                      <Tooltip>
                        <TooltipTrigger
                          render={<Button size="icon-xs" variant="ghost" />}
                          disabled={locked}
                          aria-label={
                            row.removed
                              ? gt("Undo reset for {model}", { model: row.model })
                              : row.isNew
                                ? gt("Remove new model")
                                : gt("Reset price for {model} to automatic", { model: row.model })
                          }
                          onClick={() => {
                            if (row.isNew)
                              setDrafts((previous) =>
                                previous.filter((entry) => entry.id !== row.id),
                              );
                            else if (row.removed) updateOrDropDraft({ ...row, removed: false });
                            else updateDraft({ ...row, removed: true });
                          }}
                        >
                          {row.isNew ? <XIcon aria-hidden /> : <RotateCcwIcon aria-hidden />}
                        </TooltipTrigger>
                        <TooltipPopup>
                          {row.removed
                            ? gt("Undo reset")
                            : row.isNew
                              ? gt("Remove row")
                              : gt("Reset to automatic")}
                        </TooltipPopup>
                      </Tooltip>
                    </div>
                    {error !== undefined ? (
                      <p role="alert" className="text-destructive">
                        {error}
                      </p>
                    ) : null}
                    {row.removed ? (
                      <span className="text-muted-foreground">
                        <T>Automatic pricing after saving</T>
                      </span>
                    ) : (
                      <>
                        <label className="flex flex-col gap-1">
                          <span className="text-muted-foreground">
                            <T>Map to</T>
                          </span>
                          <Input
                            size="compact"
                            value={row.alias ?? aliasCell.value}
                            aria-label={gt("Map {model} to model", {
                              model: row.model || gt("new model"),
                            })}
                            list="usage-alias-models"
                            placeholder={row.isNew ? gt("Optional") : aliasCell.placeholder}
                            autoComplete="off"
                            spellCheck={false}
                            disabled={locked}
                            onChange={(event) => editAlias(row, event.target.value)}
                          />
                        </label>
                        {alias !== "" ? (
                          <span className="break-all text-muted-foreground">
                            <T>
                              Counted as <Var>{alias}</Var>
                            </T>
                          </span>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {USAGE_PRICE_FIELDS.map((field) => {
                              const cell = usagePriceCell(selected, row.model, field.key, messages);
                              const value = row.values[field.key] ?? (row.isNew ? "" : cell.value);
                              return (
                                <label key={field.key} className="flex min-w-0 flex-col gap-1">
                                  <span className="truncate text-muted-foreground">
                                    {messages(field.label)}
                                  </span>
                                  <Input
                                    size="compact"
                                    inputMode="decimal"
                                    aria-label={gt("{field} price for {model}", {
                                      field: messages(field.label),
                                      model: row.model || gt("new model"),
                                    })}
                                    value={value}
                                    placeholder={
                                      row.isNew
                                        ? field.optional
                                          ? gt("Input rate")
                                          : "0.00"
                                        : cell.placeholder
                                    }
                                    autoComplete="off"
                                    disabled={locked}
                                    font="mono"
                                    onChange={(event) => {
                                      if (isUsagePriceEdit(value, event.target.value))
                                        editCell(row, field.key, event.target.value);
                                    }}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })
            )}
          </ul>
          <datalist id="usage-price-models">
            {models
              .filter((model) => !customModels.includes(model))
              .map((model) => (
                <option key={model} value={model} />
              ))}
          </datalist>
          <datalist id="usage-alias-models">
            {models
              .filter((model) =>
                selected.every((environment) => !Object.hasOwn(environment.aliases ?? {}, model)),
              )
              .map((model) => (
                <option key={model} value={model} />
              ))}
          </datalist>
          <p className="text-muted-foreground">
            {gt(
              "Blank cache rates use the input price. Enter 0 for free tokens. A mapped model’s usage counts as the model it maps to.",
            )}
            {selected.length > 1
              ? ` ${gt("Mixed cells keep each environment’s rate until you edit them.")}`
              : ""}
          </p>
        </>
      )}
      {attempt ? (
        <div role="status" className="grid gap-1">
          {attempt.destinations.map((destination) => {
            const result = attempt.results.get(destination.environmentId);
            return (
              <div key={destination.environmentId} className="flex justify-between gap-3">
                <span className="truncate text-muted-foreground">{destination.label}</span>
                <span
                  className={
                    result?.status === "failed"
                      ? "text-right text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {result?.status === "failed"
                    ? gt("Not saved · {error}", { error: result.error })
                    : result?.status === "saved"
                      ? gt("Saved")
                      : gt("Saving…")}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {hasChanges ? (
        <p className="text-muted-foreground">
          {gt("Changes apply to {destination}", { destination: destinationLabel })}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {hasChanges ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={discard}>
            {failedDestinations.length > 0 ? gt("Discard pending changes") : gt("Discard changes")}
          </Button>
        ) : null}
        <Button
          size="sm"
          disabled={
            pending ||
            (!hasChanges && failedDestinations.length === 0) ||
            (failedDestinations.length === 0 && (errors.size > 0 || selected.length === 0))
          }
          onClick={() => void save(failedDestinations.length > 0)}
        >
          {pending
            ? gt("Saving…")
            : failedDestinations.length > 0
              ? gt("Retry failed saves")
              : gt("Save changes")}
        </Button>
      </div>
    </div>
  );
}
