import { chromium } from "playwright";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const GROK_URL = "https://grok.com/";
const GROK_INPUT = '.tiptap[contenteditable="true"], textarea[aria-label], div[contenteditable="true"]';
const GROK_ANSWER = '.message-bubble:not(.bg-surface-user-bubble), [data-message-author-role="assistant"], .response-content-markdown';

export const GROK_MODELS = [
  { id: "grok-4", name: "Grok 4", requestKind: "DEFAULT", modelName: "grok-4" },
  { id: "grok-3", name: "Grok 3", requestKind: "DEFAULT", modelName: "grok-3" },
  { id: "grok-3-reasoning", name: "Grok 3 · Reasoning", requestKind: "REASONING", modelName: "grok-3" },
  { id: "grok-3-deepsearch", name: "Grok 3 · DeepSearch", requestKind: "DEEPSEARCH", modelName: "grok-3" },
];

const state = (globalThis.__aiHubGrok ||= {
  context: null,
  page: null,
  launching: null,
  visible: false,
  busy: false,
});

function dataDir() {
  return process.env.AI_HUB_DATA_DIR || join(process.cwd(), ".data");
}

function sessionCachePath() {
  return join(dataDir(), "grok-session.json");
}

function readCachedSession() {
  try {
    const p = sessionCachePath();
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeCachedSession(value) {
  try {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(sessionCachePath(), JSON.stringify({ ...value, cachedAt: Date.now() }), { mode: 0o600 });
  } catch {}
}

export function normalizeGrokWindow(raw, fallbackLabel) {
  if (!raw || typeof raw !== "object") return null;
  const src =
    typeof raw.totalQueries === "number"
      ? raw
      : raw.lowEffortRateLimits && typeof raw.lowEffortRateLimits.totalQueries === "number"
        ? raw.lowEffortRateLimits
        : raw.highEffortRateLimits && typeof raw.highEffortRateLimits.totalQueries === "number"
          ? raw.highEffortRateLimits
          : raw;

  const total = src.totalQueries ?? src.totalTokens;
  const remaining = src.remainingQueries ?? src.remainingTokens;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) return null;
  if (typeof remaining !== "number" || !Number.isFinite(remaining) || remaining < 0 || remaining > total) return null;

  const usedPercent = Math.max(0, Math.min(100, Math.round(((total - remaining) / total) * 100)));
  const windowSec = src.windowSizeSeconds ?? raw.windowSizeSeconds;
  const windowDurationMins = typeof windowSec === "number" && windowSec > 0 ? Math.max(1, Math.round(windowSec / 60)) : null;
  const waitSec = src.waitTimeSeconds ?? raw.waitTimeSeconds;
  const resetsAt =
    typeof waitSec === "number" && waitSec > 0
      ? Math.floor(Date.now() / 1000) + waitSec
      : typeof windowSec === "number" && windowSec > 0
        ? Math.floor(Date.now() / 1000) + windowSec
        : null;

  return {
    label: fallbackLabel || (windowDurationMins ? `${Math.round((windowDurationMins / 60) * 10) / 10} ч` : "Окно"),
    usedPercent,
    windowDurationMins,
    remainingQueries: remaining,
    totalQueries: total,
    resetsAt,
  };
}

export function parseGrokRateLimits(defaultRaw, reasoningRaw) {
  const primary = normalizeGrokWindow(defaultRaw, "Grok 4 / 3");
  const highEffort =
    reasoningRaw && typeof reasoningRaw === "object"
      ? normalizeGrokWindow(reasoningRaw, "Reasoning / DeepSearch")
      : defaultRaw?.highEffortRateLimits
        ? normalizeGrokWindow(defaultRaw.highEffortRateLimits, "Reasoning / Высокая точность")
        : null;

  if (!primary && !highEffort) return null;
  return {
    grok: {
      limitName: "Grok · Лимиты аккаунта",
      primary: primary || highEffort,
      ...(primary && highEffort ? { secondary: highEffort } : {}),
    },
  };
}

async function ensureBrowser({ visible = false } = {}) {
  if (state.launching) return state.launching;
  if (state.context && state.visible !== visible) {
    await state.context.close();
    state.context = null; state.page = null;
  }
  if (state.page && !state.page.isClosed()) {
    if (visible) await state.page.bringToFront().catch(() => {});
    return state;
  }
  state.launching = (async () => {
    mkdirSync(dataDir(), { recursive: true });
    const args = [];
    const context = await chromium.launchPersistentContext(join(dataDir(), "browser-grok"), {
      channel: "chrome",
      headless: !visible,
      viewport: { width: 1180, height: 840 },
      args,
    });
    state.visible = visible;
    state.context = context;
    state.page = context.pages()[0] || (await context.newPage());
    context.on("close", () => {
      state.page = null;
      state.context = null;
    });
    await state.page.goto(GROK_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await state.page.locator(GROK_INPUT).first().waitFor({ timeout: 15000 }).catch(() => {});
    if (visible) await state.page.bringToFront().catch(() => {});
    return state;
  })();
  try {
    return await state.launching;
  } finally {
    state.launching = null;
  }
}

async function fetchPageRateLimits(page) {
  try {
    const res = await page.evaluate(async () => {
      async function queryLimit(requestKind, modelName) {
        try {
          const r = await fetch("https://grok.com/rest/rate-limits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ requestKind, modelName }),
          });
          if (!r.ok) return { status: r.status, data: null };
          return { status: r.status, data: await r.json() };
        } catch {
          return { status: 0, data: null };
        }
      }
      const [def, reas] = await Promise.all([
        queryLimit("DEFAULT", "grok-3"),
        queryLimit("REASONING", "grok-3"),
      ]);
      return { def, reas };
    });
    return res;
  } catch {
    return null;
  }
}

async function inspectGrok(s) {
  const p = s.page;
  const url = p.url();
  if (!url.startsWith("https://grok.com")) {
    await p.goto(GROK_URL, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
  }
  const inputVisible = await p.locator(GROK_INPUT).first().isVisible().catch(() => false);
  const loginButtons = await p
    .locator("button:visible, a:visible")
    .filter({ hasText: /^(Войти|Sign in|Log in|Sign up)$/i })
    .count()
    .catch(() => 0);

  const rl = await fetchPageRateLimits(p);
  const rateLimitAuthenticated = Boolean(rl?.def?.status === 200 && rl?.def?.data);
  const authenticated = rateLimitAuthenticated || (inputVisible && loginButtons === 0);

  const limits = authenticated ? parseGrokRateLimits(rl?.def?.data, rl?.reas?.data) : null;
  const status = {
    connected: authenticated,
    signedIn: authenticated,
    models: authenticated ? GROK_MODELS.map(({ id, name }) => ({ id, name })) : [],
    limits,
    plan: authenticated ? "Аккаунт Grok (grok.com / X)" : null,
    error: authenticated
      ? null
      : "Войдите в аккаунт Grok в открытом окне Chrome, затем нажмите «Обновить».",
    limitError:
      authenticated && !limits
        ? "Сервис Grok подтвердил вход, но не вернул числовой остаток квоты для текущего окна."
        : null,
  };
  writeCachedSession(status);
  return status;
}

export async function grokLogin() {
  if (process.env.AI_HUB_TEST_IMPORT) {
    return { connected: true };
  }
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(join(dataDir(), "web-grok.json"), JSON.stringify({ enabled: true }));
  // If an offscreen context was open, close it first so login opens visibly in front of the user
  if (state.context) {
    await state.context.close().catch(() => {});
    state.context = null;
    state.page = null;
  }
  const s = await ensureBrowser({ visible: true });
  await inspectGrok(s).catch(() => {});
  return { browserLogin: true };
}

export async function grokStatus() {
  if (process.env.AI_HUB_TEST_IMPORT) {
    return {
      connected: true,
      signedIn: true,
      plan: "SuperGrok",
      models: GROK_MODELS.map(({ id, name }) => ({ id, name })),
      limits: {
        grok: {
          limitName: "Grok · Лимиты аккаунта",
          primary: {
            label: "Grok 4 / 3 · 2 ч",
            usedPercent: 20,
            windowDurationMins: 120,
            remainingQueries: 16,
            totalQueries: 20,
            resetsAt: 1900000000,
          },
        },
      },
      error: null,
      limitError: null,
    };
  }

  // If browser page is already active in this session, inspect live
  if (state.page && !state.page.isClosed()) {
    try {
      return await inspectGrok(state);
    } catch (e) {
      return {
        connected: false,
        signedIn: false,
        models: [],
        limits: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Status polling must never launch Chrome. Sign-in opens it explicitly;
  // a chat turn uses the persistent profile in a headless process.
  const cached = readCachedSession();
  if (cached) return {...cached, limitError: cached.limits ? "Сохранённые лимиты; обновятся после запроса." : cached.limitError};

  return {
    connected: false,
    signedIn: false,
    models: [],
    limits: null,
    error: null,
    limitError: null,
  };
}

export async function grokTurn({ model, text, images = [], emit, signal }) {
  if (signal?.aborted) throw new Error("Запрос остановлен");

  if (process.env.AI_HUB_TEST_IMPORT) {
    const out = `Test reply from ${model}\n${text}`;
    emit(out);
    return { text: out, model, usage: { inputTokens: 12, outputTokens: 16 } };
  }

  const s = await ensureBrowser({ visible: false });
  if (state.busy) throw new Error("Grok уже отвечает в другом диалоге. Дождитесь завершения.");
  state.busy = true;

  try {
    const status = await inspectGrok(s);
    if (!status.connected) {
      throw new Error("Войдите в аккаунт Grok в разделе «Настройки → Аккаунты».");
    }

    const p = s.page;
    await p.goto(GROK_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    const input = p.locator(GROK_INPUT).first();
    await input.waitFor({ timeout: 30000 });

    if (images.length) {
      const fileInput = p.locator('input[type="file"]');
      if ((await fileInput.count()) > 0) {
        await fileInput.first().setInputFiles(images);
        await p.waitForTimeout(1200);
      }
    }

    const answers = p.locator(GROK_ANSWER);
    const before = await answers.count();
    await input.fill(text);
    await input.press("Enter");

    let last = "";
    let sameSince = Date.now();
    const started = Date.now();

    while (Date.now() - started < 240000) {
      if (signal?.aborted) {
        const stop = p.getByRole("button", { name: /Остановить|Stop response|Stop generating/i }).first();
        if (await stop.count()) await stop.click().catch(() => {});
        throw new Error("Запрос остановлен");
      }

      const body = await p.locator("body").innerText().catch(() => "");
      if (/verify you are human|подтвердите.*человек|captcha/i.test(body)) {
        await p.bringToFront().catch(() => {});
        throw new Error("Grok запросил проверку безопасности. Завершите её в открытом окне Chrome.");
      }
      if (/лимит.*достигнут|достигнут.*лимит|usage limit|message limit|too many requests/i.test(body)) {
        await inspectGrok(s).catch(() => {});
        throw new Error("Достигнут лимит запросов аккаунта Grok. Проверьте вкладку «Лимиты».");
      }

      if ((await answers.count()) > before) {
        let result = (await answers.last().innerText().catch(() => "")).trim();
        if (result !== last) {
          if (result.startsWith(last)) emit(result.slice(last.length));
          last = result;
          sameSince = Date.now();
        }
        const stopCount = await p
          .getByRole("button", { name: /Остановить|Stop response|Stop generating/i })
          .count()
          .catch(() => 0);
        if (last && !stopCount && Date.now() - sameSince > 2200) {
          // Refresh live rate limits after turn completes
          await inspectGrok(s).catch(() => {});
          return { text: last, model: model || "grok-3", usage: null };
        }
      }
      await p.waitForTimeout(400);
    }
    throw new Error("Grok не вернул завершённый ответ вовремя.");
  } finally {
    state.busy = false;
  }
}
