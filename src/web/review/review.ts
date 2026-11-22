import { MIN_COUNTED, pyramid, type Reviewed, type ReviewSummary } from "../../shared/review";
import { TIERS, type Answer, type Pack, type Prompt, type Tier } from "../../shared/types";

const ORDER = Object.keys(TIERS) as Tier[];
const picker = document.querySelector<HTMLSelectElement>(".packs")!;
const saveButton = document.querySelector<HTMLButtonElement>(".save")!;
const status = document.querySelector<HTMLElement>(".status")!;
const list = document.querySelector<HTMLElement>(".prompts")!;

let reviewed: Reviewed | null = null;
/** The pack as it is being changed; `reviewed.pack` stays as it was loaded. */
let pack: Pack | null = null;
let changed = false;
let picked: { prompt: number; answer: number } | null = null;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children);
  return element;
}

function say(text: string, bad = false) {
  status.textContent = text;
  status.classList.toggle("bad", bad);
}

function change() {
  changed = true;
  saveButton.disabled = false;
  say("Not saved");
  draw();
}

/** How many tiers apart two are. A gem is chosen among the rarest, so it is weighed as rare. */
function apart(a: Tier, b: Tier): number {
  const at = (tier: Tier) => ORDER.indexOf(tier === "gem" ? "rare" : tier);
  return Math.abs(at(a) - at(b));
}

const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

function drawPrompt(prompt: Prompt, p: number): HTMLElement {
  const counts = reviewed!.counts[prompt.id] ?? [];
  const texts = new Set(prompt.answers.map((answer) => answer.text));
  const given = new Map<string, number>();
  for (const count of counts) if (count.judged && texts.has(count.judged)) given.set(count.judged, (given.get(count.judged) ?? 0) + count.times);
  const total = counts.reduce((sum, count) => sum + count.times, 0);
  const byPlayers = total >= MIN_COUNTED ? pyramid(prompt.answers.map((answer) => given.get(answer.text) ?? 0)) : null;
  const signals = reviewed!.signals?.[prompt.id] ?? {};

  const chip = (answer: Answer, a: number) => {
    const signal = signals[answer.text];
    const notes: string[] = [];
    let off = false;
    if (signal?.suggested) {
      notes.push(`Wikipedia: ${signal.views} views of "${signal.title}" in 60 days, read like ${signal.suggested}`);
      off ||= apart(answer.tier, signal.suggested) >= 2;
    }
    const times = given.get(answer.text) ?? 0;
    if (byPlayers) {
      notes.push(`Players: given ${times} times of ${total}, given like ${byPlayers[a]}`);
      off ||= apart(answer.tier, byPlayers[a]!) >= 2;
    }
    const isPicked = picked?.prompt === p && picked.answer === a;
    const button = make("button", { type: "button", className: `chip${off ? " off" : ""}${isPicked ? " selected" : ""}`, title: notes.join("\n") }, answer.text);
    if (answer.aliases?.length) button.append(make("small", {}, `+${answer.aliases.length}`));
    if (signal?.views != null) button.append(make("small", {}, `${short(signal.views)} read`));
    if (times) button.append(make("small", {}, `${times}×`));
    button.addEventListener("click", () => {
      picked = isPicked ? null : { prompt: p, answer: a };
      draw();
    });
    return button;
  };

  const columns = ORDER.map((tier) => {
    const answers = prompt.answers.flatMap((answer, a) => (answer.tier === tier ? [chip(answer, a)] : []));
    const title = make("h3", {}, `${tier} · ${answers.length}`);
    title.style.color = `var(--${tier})`;
    return make("div", { className: "tier" }, title, make("div", { className: "chips" }, ...answers));
  });

  const heading = make("input", { value: prompt.text, ariaLabel: "Prompt" });
  heading.addEventListener("change", () => {
    prompt.text = heading.value;
    change();
  });
  const section = make(
    "section",
    {},
    make("h2", {}, heading, make("span", { className: "meta" }, `${prompt.id} · ${prompt.answers.length} answers · ${total} given by players`)),
    make("div", { className: "tiers" }, ...columns),
  );

  if (picked?.prompt === p) section.append(editor(prompt, picked.answer));

  const adding = make("input", { placeholder: "Add an answer (Enter)", ariaLabel: "Add an answer" });
  adding.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !adding.value.trim()) return;
    prompt.answers.push({ text: adding.value.trim(), tier: "rare" });
    change();
  });
  section.append(make("div", { className: "adding" }, adding));

  const unlisted = counts.filter((count) => !count.judged || !texts.has(count.judged));
  if (unlisted.length) {
    const chips = unlisted.slice(0, 60).map((count) => {
      const allowed = count.judged !== null;
      const label = allowed ? `${count.judged} (allowed by the live judge)` : count.typed;
      const button = make("button", { type: "button", className: `chip ${allowed ? "allowed" : "wrong"}` }, label, make("small", {}, `${count.times}×`));
      button.addEventListener("click", (event) => {
        const target = picked?.prompt === p ? prompt.answers[picked.answer] : undefined;
        if (event.shiftKey && target) target.aliases = [...(target.aliases ?? []), count.typed];
        else prompt.answers.push({ text: count.judged ?? count.typed, tier: "rare" });
        change();
      });
      return button;
    });
    section.append(make("div", { className: "unlisted" }, make("h3", {}, "Typed by players, not listed"), make("div", { className: "chips" }, ...chips)));
  }
  return section;
}

function editor(prompt: Prompt, a: number): HTMLElement {
  const answer = prompt.answers[a]!;
  const text = make("input", { className: "text", value: answer.text, ariaLabel: "Answer" });
  text.addEventListener("change", () => {
    answer.text = text.value.trim();
    change();
  });
  const aliases = make("input", { className: "aliases", value: (answer.aliases ?? []).join(", "), placeholder: "Other names, split by commas", ariaLabel: "Other names" });
  aliases.addEventListener("change", () => {
    const names = aliases.value.split(",").map((name) => name.trim()).filter(Boolean);
    if (names.length) answer.aliases = names;
    else delete answer.aliases;
    change();
  });
  const tiers = ORDER.map((tier, i) => {
    const button = make("button", { type: "button", disabled: answer.tier === tier }, `${i + 1} ${tier}`);
    button.addEventListener("click", () => setTier(tier));
    return button;
  });
  const remove = make("button", { type: "button" }, "Remove");
  remove.addEventListener("click", removePicked);
  const signal = reviewed!.signals?.[prompt.id]?.[answer.text];
  const why = signal ? `Wikipedia: "${signal.title ?? "no article"}", ${signal.views ?? "?"} views, in ${signal.sitelinks ?? "?"} Wikipedias` : "No Wikipedia signals: run bun tools/signals.ts on this pack";
  return make("div", { className: "editor" }, text, aliases, ...tiers, remove, make("span", { className: "why" }, why));
}

function setTier(tier: Tier) {
  if (!picked || !pack) return;
  pack.prompts[picked.prompt]!.answers[picked.answer]!.tier = tier;
  change();
}

function removePicked() {
  if (!picked || !pack) return;
  pack.prompts[picked.prompt]!.answers.splice(picked.answer, 1);
  picked = null;
  change();
}

function draw() {
  if (!pack) return;
  // Redrawing would take the focus from a field being typed in.
  const typing = document.activeElement instanceof HTMLInputElement && list.contains(document.activeElement) ? document.activeElement.ariaLabel : null;
  list.replaceChildren(...pack.prompts.map(drawPrompt));
  if (typing === "Add an answer") (list.querySelectorAll<HTMLInputElement>('input[aria-label="Add an answer"]')[picked?.prompt ?? 0])?.focus();
}

async function open(language: string, id: string) {
  if (changed && !confirm("Leave this pack without saving?")) {
    picker.value = `${reviewed!.language}/${reviewed!.pack.id}`;
    return;
  }
  say("Loading");
  const res = await fetch(`/api/dev/review/${language}/${id}`);
  if (!res.ok) return say(`Could not load ${language}/${id}`, true);
  reviewed = (await res.json()) as Reviewed;
  pack = structuredClone(reviewed.pack);
  changed = false;
  picked = null;
  saveButton.disabled = true;
  history.replaceState(null, "", `#${language}/${id}`);
  say(reviewed.signals ? "" : "No Wikipedia signals for this pack yet");
  draw();
}

async function save() {
  if (!reviewed || !pack) return;
  say("Saving");
  const res = await fetch(`/api/dev/review/${reviewed.language}/${pack.id}`, { method: "PUT", body: JSON.stringify(pack) });
  const { problems } = (await res.json()) as { problems: string[] };
  if (problems.length) return say(`Not saved:\n${problems.join("\n")}`, true);
  reviewed.pack = structuredClone(pack);
  changed = false;
  saveButton.disabled = true;
  say("Saved; the game plays it now");
}

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) {
    if (event.key === "Escape") event.target.blur();
    return;
  }
  if (!picked) return;
  const tier = ORDER[Number(event.key) - 1];
  if (tier) setTier(tier);
  else if (event.key === "Delete" || event.key === "Backspace") removePicked();
  else if (event.key === "Escape") {
    picked = null;
    draw();
  }
});
addEventListener("beforeunload", (event) => {
  if (changed) event.preventDefault();
});
saveButton.addEventListener("click", () => void save());
picker.addEventListener("change", () => {
  const [language, id] = picker.value.split("/");
  void open(language!, id!);
});

const packs = (await (await fetch("/api/dev/review")).json()) as ReviewSummary[];
for (const language of [...new Set(packs.map((one) => one.language))]) {
  const group = make("optgroup", { label: language });
  for (const one of packs.filter((pack) => pack.language === language)) group.append(make("option", { value: `${language}/${one.id}` }, `${one.name} (${one.prompts})`));
  picker.append(group);
}
const wanted = location.hash.slice(1);
picker.value = packs.some((one) => `${one.language}/${one.id}` === wanted) ? wanted : picker.value;
const [language, id] = picker.value.split("/");
if (language && id) await open(language, id);
