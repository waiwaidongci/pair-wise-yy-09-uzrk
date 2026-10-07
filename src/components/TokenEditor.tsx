import { For, Show, createMemo } from "solid-js";
import { Tabs } from "@kobalte/core/tabs";
import type { DesignToken, TokenKind } from "../types/tokens";
import { TOKEN_LABELS } from "../utils/exporters";
import { ISSUE_LABELS } from "../utils/resolver";
import { contrastGrade, contrastRatio } from "../utils/color";
import { useTokenStore } from "../stores/tokenStore";

const kinds: TokenKind[] = ["color", "fontSize", "spacing", "radius", "shadow", "motion"];

function TokenRow(props: { token: DesignToken; kind: TokenKind }) {
  const store = useTokenStore();
  const isColor = () => props.kind === "color";
  const resolved = () => store.resolvedActive().byId[props.token.id];
  const displayValue = () => resolved()?.resolvedValue ?? props.token.value;
  const isAlias = () => Boolean(props.token.ref) && !props.token.override;
  const upstreamValue = () => (props.token.ref ? store.resolvedActive().byName[props.token.ref]?.resolvedValue : undefined);
  const ratio = createMemo(() => {
    if (!isColor()) return 0;
    const background = store.resolvedActive().byId["color-surface"]?.resolvedValue ?? "#fff";
    return contrastRatio(displayValue(), background);
  });

  return (
    <div class="grid grid-cols-[minmax(150px,1.2fr)_minmax(110px,0.8fr)_32px] gap-3 border-b border-slate-100 px-3 py-3 last:border-0">
      <div>
        <input
          class="w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-mono text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white"
          value={props.token.name}
          onInput={(event) => store.updateToken(props.kind, props.token.id, { name: event.currentTarget.value })}
        />
        <p class="mt-1 line-clamp-1 px-2 text-[11px] text-slate-400">{props.token.description}</p>
      </div>
      <div class="flex items-center gap-2">
        <Show when={isColor()}>
          <input
            type="color"
            class="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isAlias()}
            value={displayValue().match(/^#[0-9a-f]{6}$/i) ? displayValue() : "#000000"}
            onInput={(event) => store.updateToken(props.kind, props.token.id, { value: event.currentTarget.value })}
          />
        </Show>
        <input
          class="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
          value={displayValue()}
          disabled={isAlias()}
          title={isAlias() ? "该令牌跟随引用，覆盖后才能直接编辑" : undefined}
          onInput={(event) => store.updateToken(props.kind, props.token.id, { value: event.currentTarget.value })}
        />
      </div>
      <button
        class="rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
        title="删除令牌"
        onClick={() => store.removeToken(props.kind, props.token.id)}
      >
        ×
      </button>

      <div class="col-span-full flex flex-wrap items-center gap-2 px-2">
        <span class="text-[11px] font-semibold text-slate-400">引用</span>
        <select
          class="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-blue-400"
          value={props.token.ref ?? ""}
          onChange={(event) => store.setTokenRef(props.kind, props.token.id, event.currentTarget.value || undefined)}
        >
          <option value="">无（字面量）</option>
          <For each={store.activeTheme().tokens[props.kind].filter((token) => token.id !== props.token.id)}>
            {(token) => <option value={token.name}>{token.name}</option>}
          </For>
        </select>

        <Show when={props.token.ref}>
          <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
            → {props.token.ref} = {upstreamValue() ?? "?"}
          </code>
          <Show
            when={props.token.override}
            fallback={
              <button
                class="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                title="保留引用关系，但用自定义值覆盖解析结果"
                onClick={() => store.toggleOverride(props.kind, props.token.id, true)}
              >
                覆盖
              </button>
            }
          >
            <span class="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">已覆盖</span>
            <button
              class="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              title="放弃覆盖值，重新跟随引用"
              onClick={() => store.toggleOverride(props.kind, props.token.id, false)}
            >
              恢复引用值
            </button>
          </Show>
          <Show when={props.token.needsReview}>
            <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
              待复核 · 上游已变为 {upstreamValue()}
            </span>
            <button
              class="rounded-md bg-amber-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-amber-500"
              title="放弃覆盖，采用上游新值"
              onClick={() => store.toggleOverride(props.kind, props.token.id, false)}
            >
              采用新值
            </button>
            <button
              class="rounded-md border border-amber-300 px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
              title="确认当前覆盖值仍然有效"
              onClick={() => store.acknowledgeReview(props.kind, props.token.id)}
            >
              保留
            </button>
          </Show>
          <Show when={resolved()?.issue}>
            <span class="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
              {ISSUE_LABELS[resolved()!.issue!]}
            </span>
          </Show>
        </Show>
      </div>

      <Show when={isColor()}>
        <div class="col-span-2 col-start-2 flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
          <span class="text-[11px] text-slate-500">对比度 {ratio().toFixed(2)}:1</span>
          <span
            class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              ratio() >= 4.5 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {contrastGrade(ratio())}
          </span>
        </div>
      </Show>
    </div>
  );
}

export default function TokenEditor() {
  const store = useTokenStore();
  const issueCount = () => store.resolvedActive().issues.length;
  return (
    <section class="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 class="text-sm font-bold text-slate-800">令牌编辑器</h2>
          <p class="text-xs text-slate-400">
            修改会实时写入当前主题
            <Show when={issueCount() > 0}>
              <span class="ml-2 rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700">
                {issueCount()} 个引用问题
              </span>
            </Show>
          </p>
        </div>
        <button
          class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          onClick={() => {
            const label = window.prompt("快照名称", `${store.activeTheme().name} ${new Date().toLocaleTimeString("zh-CN")}`);
            if (label !== null) store.saveSnapshot(label);
          }}
        >
          保存快照
        </button>
      </div>

      <Tabs defaultValue="color" class="flex min-h-0 flex-1 flex-col">
        <Tabs.List class="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
          <For each={kinds}>
            {(kind) => (
              <Tabs.Trigger
                value={kind}
                class="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-500 outline-none transition data-[selected]:bg-white data-[selected]:text-blue-700 data-[selected]:shadow-sm"
              >
                {TOKEN_LABELS[kind]}
              </Tabs.Trigger>
            )}
          </For>
        </Tabs.List>
        <For each={kinds}>
          {(kind) => (
            <Tabs.Content value={kind} class="scroll-area min-h-0 flex-1 overflow-y-auto">
              <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {store.activeTheme().tokens[kind].length} 个令牌
                </span>
                <button class="text-xs font-semibold text-blue-600 hover:text-blue-800" onClick={() => store.addToken(kind)}>
                  + 添加令牌
                </button>
              </div>
              <For each={store.activeTheme().tokens[kind]}>
                {(token) => <TokenRow token={token} kind={kind} />}
              </For>
            </Tabs.Content>
          )}
        </For>
      </Tabs>
    </section>
  );
}
