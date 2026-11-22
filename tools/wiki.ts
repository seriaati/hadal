// Looks answers up on Wikipedia and Wikidata, for the pack tools beside this file.

/**
 * Wikimedia allows a script 200 requests a minute when it names a way to reach whoever runs it,
 * and only 10 when it does not: https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits
 */
const AGENT = "hadal-pack-tools/0.1 (https://github.com/seriaati/hadal)";
/** The most titles or ids one request may name. */
const BATCH = 50;

export type Article = { title: string; qid: string | null };

async function get(url: string, params: Record<string, string>): Promise<any> {
  const query = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  for (let tries = 1; ; tries++) {
    const res = await fetch(`${url}?${query}`, { headers: { "user-agent": AGENT } });
    if (res.ok) return res.json();
    // Told to slow down: wait as long as asked, and try again a few times.
    if (res.status !== 429 || tries === 5) throw new Error(`${url} answered ${res.status}`);
    const wait = Number(res.headers.get("retry-after") ?? 10);
    console.error(`Wikimedia asked to slow down: waiting ${wait} s`);
    await Bun.sleep(1000 * wait);
  }
}

const api = (language: string) => `https://${language}.wikipedia.org/w/api.php`;

function batches<T>(things: T[]): T[][] {
  return Array.from({ length: Math.ceil(things.length / BATCH) }, (_, i) => things.slice(i * BATCH, (i + 1) * BATCH));
}

/** An Action API query over many titles, followed through every page of its answer. */
async function query(language: string, titles: string[], params: Record<string, string>): Promise<any[]> {
  const answers = [];
  for (const batch of batches(titles)) {
    let more: Record<string, string> = {};
    do {
      const answer = await get(api(language), { action: "query", titles: batch.join("|"), ...params, ...more });
      answers.push(answer);
      more = answer.continue ?? {};
    } while (Object.keys(more).length);
  }
  return answers;
}

/**
 * The article each name leads to, by the name, after redirects. A name with no article, or that
 * leads to a disambiguation page, is left out: give it a fuller title (`"Boxer (dog breed)"`).
 */
export async function articles(names: string[], language: string): Promise<Map<string, Article>> {
  const found = new Map<string, Article>();
  for (const answer of await query(language, names, { redirects: "1", prop: "pageprops", ppprop: "wikibase_item|disambiguation" })) {
    const leads = new Map<string, string>();
    for (const step of [...(answer.query?.normalized ?? []), ...(answer.query?.redirects ?? [])]) leads.set(step.from, step.to);
    const pages = new Map<string, any>((answer.query?.pages ?? []).map((page: any) => [page.title, page]));
    for (const name of names) {
      let title = name;
      for (let i = 0; i < 3 && leads.has(title); i++) title = leads.get(title)!;
      const page = pages.get(title);
      if (!page || page.missing || page.pageprops?.disambiguation !== undefined) continue;
      found.set(name, { title, qid: page.pageprops?.wikibase_item ?? null });
    }
  }
  return found;
}

/** How often each article was read in the last 60 days, by title. */
export async function views(titles: string[], language: string): Promise<Map<string, number>> {
  const read = new Map<string, number>();
  for (const answer of await query(language, titles, { prop: "pageviews", pvipdays: "60" })) {
    for (const page of answer.query?.pages ?? []) {
      // A page whose views come in a later part of the answer has none in this one.
      if (!page.pageviews) continue;
      const days = Object.values(page.pageviews as Record<string, number | null>);
      read.set(page.title, (read.get(page.title) ?? 0) + days.reduce<number>((sum, day) => sum + (day ?? 0), 0));
    }
  }
  return read;
}

/** The other titles that redirect to each article: names a player may type for the same thing. */
export async function redirects(titles: string[], language: string): Promise<Map<string, string[]>> {
  const names = new Map<string, string[]>();
  for (const answer of await query(language, titles, { prop: "redirects", rdlimit: "max", rdnamespace: "0" })) {
    for (const page of answer.query?.pages ?? []) {
      const more = (page.redirects ?? []).map((redirect: { title: string }) => redirect.title);
      names.set(page.title, [...(names.get(page.title) ?? []), ...more]);
    }
  }
  return names;
}

export type Entity = { labels: Record<string, string>; sitelinks: number; zhwiki: string | null };

/** Each Wikidata item's labels in the languages asked for, and in how many Wikipedias it has an article. */
export async function entities(qids: string[], languages: string[]): Promise<Map<string, Entity>> {
  const found = new Map<string, Entity>();
  for (const batch of batches(qids)) {
    const answer = await get("https://www.wikidata.org/w/api.php", { action: "wbgetentities", ids: batch.join("|"), props: "labels|sitelinks", languages: languages.join("|") });
    for (const [qid, entity] of Object.entries<any>(answer.entities ?? {})) {
      const labels = Object.fromEntries(Object.entries<any>(entity.labels ?? {}).map(([language, label]) => [language, label.value as string]));
      const sitelinks = Object.keys(entity.sitelinks ?? {}).filter((site) => site.endsWith("wiki") && site !== "commonswiki");
      found.set(qid, { labels, sitelinks: sitelinks.length, zhwiki: entity.sitelinks?.zhwiki?.title ?? null });
    }
  }
  return found;
}

/** A page as Wikipedia shows it, in HTML: its templates (flags, links built by them) already worked out. */
export async function rendered(title: string, language: string): Promise<string> {
  const answer = await get(api(language), { action: "parse", page: title, prop: "text", redirects: "1" });
  if (answer.error) throw new Error(`${title}: ${answer.error.info}`);
  return answer.parse.text;
}

/** The articles a page links to, or the articles in a category ("Category:Dog breeds"): candidates for a list, to be sorted by hand. */
export async function members(source: string, language: string): Promise<string[]> {
  const titles: string[] = [];
  let more: Record<string, string> = {};
  const category = /^category:/i.test(source);
  do {
    const params: Record<string, string> = category
      ? { action: "query", list: "categorymembers", cmtitle: source, cmnamespace: "0", cmlimit: "max" }
      : { action: "query", titles: source, redirects: "1", prop: "links", plnamespace: "0", pllimit: "max" };
    const answer = await get(api(language), { ...params, ...more });
    const found = category ? (answer.query?.categorymembers ?? []) : (answer.query?.pages ?? []).flatMap((page: any) => page.links ?? []);
    titles.push(...found.map((page: { title: string }) => page.title));
    more = answer.continue ?? {};
  } while (Object.keys(more).length);
  return titles;
}
