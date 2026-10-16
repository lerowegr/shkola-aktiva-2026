/**
 * Нагрузочный стенд Школы Актива — только на этом компьютере.
 *
 *   node tools/loadtest/server.mjs   →   http://127.0.0.1:4500
 *
 * Цели — только свои: локальная копия, демо и боевой сайт. Скорость — до
 * 50 регистраций в секунду, длительность — до 10 минут; автостоп, если
 * ошибок больше 5% или 95% ответов дольше 3 секунд (за последние 10 секунд).
 *
 * «Регистрация» — путь кандидата из Telegram: главная, вход, код входа,
 * знакомство с паролем (scrypt — тяжёлое место), кабинет, анкета. Тестовые
 * люди с сессиями заводятся заранее scripts/loadtest-seed.ts — кнопкой
 * «Завести» на странице. Отправка анкеты — только на локальной копии:
 * на демо и боевом она назначила бы анкеты настоящим мастерам.
 *
 * Нагрузка сервера: для демо и боевого — по SSH раз в ~2 секунды
 * (процессор, память, загрузка, контейнеры сайта); для локальной — этот компьютер.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = 4500;
const SSH = ["-i", join(os.homedir(), ".ssh", "snimk_vps"), "-o", "BatchMode=yes", "-o", "ServerAliveInterval=10", "root@82.22.38.111"];

const TARGETS = {
  local: {
    label: "Локальная копия",
    url: process.env.LOADTEST_LOCAL_URL ?? "http://localhost:3300",
    db: process.env.LOADTEST_LOCAL_DB ?? "postgresql://egor@localhost:5432/sha_load?schema=public",
    submit: true,
  },
  demo: { label: "Демо", url: "https://demo.schoolofactivity.ru", dc: "./deploy/demo.sh", prefix: "sha-demo-", submit: false },
  prod: { label: "Боевой сайт", url: "https://schoolofactivity.ru", dc: "./deploy/dc.sh", prefix: "sha-site-", submit: false },
};
const LIMITS = { rate: 50, duration: 600, staff: 50 };
const tokensFile = (target) => join(HERE, `tokens-${target}.json`);

// ---------------------------------------------------------------------------
// Тестовые люди: завести и убрать.

function readTokens(target) {
  try {
    return JSON.parse(readFileSync(tokensFile(target), "utf8"));
  } catch {
    return null;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, ...options });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

async function seed(target, candidates, staff) {
  const t = TARGETS[target];
  const args = ["--candidates", String(candidates), "--staff", String(staff)];
  const result = t.dc
    ? await run("ssh", [...SSH, `cd /root/sha-site && ${t.dc} run --rm -T migrate npx tsx scripts/loadtest-seed.ts ${args.join(" ")}`])
    : await run("npx", ["tsx", "scripts/loadtest-seed.ts", ...args, "--open-application"], {
        env: { ...process.env, DATABASE_URL: t.db },
      });
  const json = result.out.slice(result.out.indexOf("{"));
  try {
    const parsed = JSON.parse(json);
    writeFileSync(tokensFile(target), JSON.stringify(parsed));
    chmodSync(tokensFile(target), 0o600);
    return { ok: true, message: `Заведено: кандидатов ${parsed.candidates.length}, организаторов ${parsed.staff.length}. Сессии живут 3 часа.` };
  } catch {
    return { ok: false, message: `Не получилось завести: ${(result.err || result.out).trim().split("\n").slice(-3).join(" ")}` };
  }
}

async function clean(target) {
  const t = TARGETS[target];
  const result = t.dc
    ? await run("ssh", [...SSH, `cd /root/sha-site && ${t.dc} run --rm -T migrate npx tsx scripts/loadtest-clean.ts`])
    : await run("npx", ["tsx", "scripts/loadtest-clean.ts"], { env: { ...process.env, DATABASE_URL: t.db } });
  if (result.code !== 0) return { ok: false, message: `Не получилось убрать: ${result.err.trim().split("\n").slice(-2).join(" ")}` };
  writeFileSync(tokensFile(target), JSON.stringify({ candidates: [], staff: [] }));
  return { ok: true, message: result.out.trim().split("\n").pop() };
}

// ---------------------------------------------------------------------------
// Метрики сервера.

let server = null; // { cpu, mem, memTotal, load, cores, containers: [{name, cpu, mem}] , at }
let metricsProc = null;
let metricsTarget = null;
let prevCpu = null;

function cpuFromStat(line) {
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] ?? 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function startMetrics(target) {
  if (metricsTarget === target && (metricsProc || target === "local")) return;
  stopMetrics();
  metricsTarget = target;
  prevCpu = null;
  server = null;
  const t = TARGETS[target];
  if (!t.dc) {
    metricsProc = setInterval(() => {
      const cpus = os.cpus();
      const total = cpus.reduce((sum, c) => sum + Object.values(c.times).reduce((a, b) => a + b, 0), 0);
      const idle = cpus.reduce((sum, c) => sum + c.times.idle, 0);
      const cpu = prevCpu ? 100 * (1 - (idle - prevCpu.idle) / (total - prevCpu.total)) : 0;
      prevCpu = { idle, total };
      server = { cpu, mem: os.totalmem() - os.freemem(), memTotal: os.totalmem(), load: os.loadavg()[0], cores: cpus.length, containers: [], at: Date.now() };
    }, 2000);
    return;
  }
  const script = `while true; do echo "@@"; head -1 /proc/stat; cat /proc/loadavg; nproc; free -b | sed -n 2p; docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' | grep '^${t.prefix}' || true; done`;
  const child = spawn("ssh", [...SSH, script]);
  metricsProc = child;
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const blocks = buffer.split("@@\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) parseBlock(block);
  });
  child.on("close", () => {
    if (metricsProc === child) metricsProc = null;
  });
}

function parseBlock(block) {
  const lines = block.trim().split("\n");
  if (lines.length < 4) return;
  const stat = cpuFromStat(lines[0]);
  const cpu = prevCpu ? 100 * (1 - (stat.idle - prevCpu.idle) / (stat.total - prevCpu.total)) : 0;
  prevCpu = stat;
  const load = Number(lines[1].split(" ")[0]);
  const cores = Number(lines[2]);
  const mem = lines[3].trim().split(/\s+/);
  const containers = lines.slice(4).map((line) => {
    const [name, cpuPerc, usage] = line.split("|");
    return { name, cpu: Number.parseFloat(cpuPerc), mem: usage?.split("/")[0]?.trim() ?? "" };
  });
  server = { cpu, mem: Number(mem[2]), memTotal: Number(mem[1]), load, cores, containers, at: Date.now() };
}

function stopMetrics() {
  if (metricsProc) {
    if (typeof metricsProc.kill === "function") metricsProc.kill();
    else clearInterval(metricsProc);
  }
  metricsProc = null;
  metricsTarget = null;
}

// ---------------------------------------------------------------------------
// Нагрузка.

const state = {
  running: false,
  target: "local",
  rate: 5,
  duration: 60,
  staff: 0,
  submit: false,
  maxP95: 3,
  startedAt: 0,
  stoppedAt: 0,
  reason: "",
  launched: 0,
  finished: 0,
  failedFlows: 0,
  inflight: 0,
  seconds: [], // [{ t, requests, errors, latencies: [] }]
  endpoints: new Map(), // name → { count, errors, latencies: [], statuses: {} }
  log: [],
};
let arrivalTimer = null;
let queue = [];
let staffTokens = [];
let carry = 0;

function note(text) {
  state.log.unshift(`${new Date().toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow" })} ${text}`);
  state.log.length = Math.min(state.log.length, 40);
}

function bucket() {
  const t = Math.floor((Date.now() - state.startedAt) / 1000);
  let last = state.seconds.at(-1);
  if (!last || last.t !== t) {
    last = { t, requests: 0, errors: 0, latencies: [] };
    state.seconds.push(last);
  }
  return last;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

async function request(name, path, { method = "GET", cookie, body } = {}) {
  const t = TARGETS[state.target];
  const started = performance.now();
  const secure = t.url.startsWith("https://");
  const headers = { "user-agent": "sha-loadtest", origin: t.url, accept: body ? "application/json" : "text/html,application/json" };
  if (cookie) headers.cookie = `${secure ? "__Secure-sha_session" : "sha_session"}=${cookie}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  let status;
  let text = "";
  try {
    const response = await fetch(t.url + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    status = response.status;
    text = await response.text();
  } catch (error) {
    status = error?.name === "TimeoutError" ? 599 : 598;
  }
  const ms = performance.now() - started;
  const failed = status === 0 || status >= 500 || status === 401 || status === 403 || status === 429;
  const b = bucket();
  b.requests++;
  b.latencies.push(ms);
  if (failed) b.errors++;
  let e = state.endpoints.get(name);
  if (!e) state.endpoints.set(name, (e = { count: 0, errors: 0, latencies: [], statuses: {} }));
  e.count++;
  if (failed) e.errors++;
  e.statuses[status] = (e.statuses[status] ?? 0) + 1;
  e.latencies.push(ms);
  if (e.latencies.length > 5000) e.latencies.splice(0, e.latencies.length - 5000);
  let json = null;
  if (text.startsWith("{")) {
    try {
      json = JSON.parse(text);
    } catch {
      /* не JSON */
    }
  }
  return { status, failed, json };
}

const pause = (min, max) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
const FACULTIES = ["МЭО", "СНиМК", "ВШУ", "НАБ", "ИТиАБД", "ФЭБ", "ЮФ", "ФФ"];
const LONG = "Это ответ нагрузочного теста. В школе я был в совете старшеклассников, мы готовили праздники и сбор макулатуры; моя роль — договариваться с людьми и держать сроки. ".repeat(2);
const FORMATS = { DIGITS: "1901234", GROUP: "ТЦБМ23-2", PHONE: "+7 999 123-45-67", VK: "vk.ru/loadtest", TELEGRAM: "@loadtest_user" };

function answerFor(question) {
  if (question.format) return FORMATS[question.format] ?? "Тест";
  switch (question.type) {
    case "LONG_TEXT":
      return LONG.slice(0, question.maxLength ?? LONG.length);
    case "SINGLE_CHOICE":
      return question.options[0] ?? "";
    case "MULTI_CHOICE":
      return question.options.slice(0, 2);
    case "URL":
      return "https://drive.google.com/drive/folders/loadtest";
    default:
      return "Тест";
  }
}

async function candidateFlow(token, index) {
  state.inflight++;
  let ok = true;
  const step = async (...args) => {
    const result = await request(...args);
    if (result.failed) ok = false;
    return result;
  };
  try {
    await step("Главная /", "/");
    await step("Вход /login", "/login");
    await step("Код входа Telegram", "/api/auth/telegram-code", { method: "POST", body: {} });
    await step("Сессия /api/session", "/api/session", { cookie: token });
    await step("Знакомство /cabinet/welcome", "/cabinet/welcome", { cookie: token });
    await pause(500, 1500);
    const login = `lt${index.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const password = `Lt-${Math.random().toString(36).slice(2)}-Pass9`;
    const onboarding = await step("Знакомство: сохранить (пароль)", "/api/cabinet/onboarding", {
      method: "POST",
      cookie: token,
      body: {
        lastName: "Тестов",
        firstName: "Нагрузка",
        middleName: "",
        course: "1",
        faculty: FACULTIES[index % FACULTIES.length],
        studentId: String(1900000 + index),
        phone: "+7 999 123-45-67",
        login,
        email: `${login}@loadtest.local`,
        password,
        repeat: password,
      },
    });
    if (onboarding.json && onboarding.json.ok === false && !onboarding.failed) {
      note(`Знакомство не прошло: ${onboarding.json.message}`);
      ok = false;
    }
    await step("Кабинет /cabinet", "/cabinet", { cookie: token });
    const app = await step("Анкета: загрузить", "/api/cabinet/application", { cookie: token });
    const data = app.json?.data;
    if (data?.editable) {
      const questions = state.submit ? data.questions : data.questions.slice(0, 5);
      for (const question of questions) {
        await pause(300, 900);
        await step("Анкета: автосохранение ответа", "/api/cabinet/application/answer", {
          method: "POST",
          cookie: token,
          body: { questionId: question.id, value: answerFor(question) },
        });
      }
      if (state.submit && TARGETS[state.target].submit) {
        await step("Анкета: ФИО и студбилет", "/api/cabinet/application/profile", {
          method: "POST",
          cookie: token,
          body: { lastName: "Тестов", firstName: "Нагрузка", studentId: String(1900000 + index) },
        });
        const sent = await step("Анкета: отправить", "/api/cabinet/application/submit", { method: "POST", cookie: token, body: {} });
        if (sent.json?.ok === false) {
          ok = false;
          if (state.failedFlows < 3) note(`Анкета не отправилась: ${sent.json.message}`);
        }
      }
    }
  } finally {
    state.inflight--;
    state.finished++;
    if (!ok) state.failedFlows++;
  }
}

async function staffLoop(token) {
  while (state.running) {
    await request("Орг: все анкеты", "/api/staff/applications?scope=all", { cookie: token });
    await request("Орг: вкладки", "/api/staff/nav", { cookie: token });
    await pause(1500, 3500);
    if (!state.running) break;
    await request("Орг: страница /staff/all", "/staff/all", { cookie: token });
    await pause(2000, 4000);
  }
}

function start(input) {
  if (state.running) return { ok: false, message: "Тест уже идёт." };
  const target = TARGETS[input.target] ? input.target : null;
  if (!target) return { ok: false, message: "Такой цели нет." };
  const rate = Number(input.rate);
  const duration = Number(input.duration);
  const staff = Number(input.staff ?? 0);
  const maxP95 = Number(input.maxP95 ?? 3);
  if (!(maxP95 >= 1 && maxP95 <= 15)) return { ok: false, message: "Порог автостопа — от 1 до 15 секунд." };
  if (!(rate > 0 && rate <= LIMITS.rate)) return { ok: false, message: `Скорость — от 0,1 до ${LIMITS.rate} регистраций в секунду.` };
  if (!(Number.isInteger(duration) && duration >= 5 && duration <= LIMITS.duration)) return { ok: false, message: `Длительность — от 5 до ${LIMITS.duration} секунд.` };
  if (!(Number.isInteger(staff) && staff >= 0 && staff <= LIMITS.staff)) return { ok: false, message: `Организаторов — от 0 до ${LIMITS.staff}.` };
  const tokens = readTokens(target);
  const need = Math.ceil(rate * duration);
  if (!tokens || tokens.candidates.length < need) {
    return { ok: false, message: `Нужно ${need} тестовых кандидатов, заведено ${tokens?.candidates.length ?? 0}. Нажмите «Завести».` };
  }
  if (staff > tokens.staff.length) return { ok: false, message: `Тестовых организаторов заведено ${tokens.staff.length}.` };

  // Каждый тестовый кандидат регистрируется один раз: использованных не берём снова.
  queue = tokens.candidates.slice(0, need);
  writeFileSync(tokensFile(target), JSON.stringify({ ...tokens, candidates: tokens.candidates.slice(need) }));
  staffTokens = tokens.staff.slice(0, staff);

  Object.assign(state, {
    running: true,
    target,
    rate,
    duration,
    staff,
    submit: Boolean(input.submit) && TARGETS[target].submit,
    maxP95,
    startedAt: Date.now(),
    stoppedAt: 0,
    reason: "",
    launched: 0,
    finished: 0,
    failedFlows: 0,
    inflight: 0,
    seconds: [],
    endpoints: new Map(),
  });
  carry = 0;
  startMetrics(target);
  note(`Старт: ${TARGETS[target].label}, ${rate}/с × ${duration} с, организаторов ${staff}${state.submit ? ", с отправкой анкет" : ""}.`);

  for (const token of staffTokens) void staffLoop(token);
  arrivalTimer = setInterval(() => {
    const elapsed = (Date.now() - state.startedAt) / 1000;
    if (elapsed >= duration) return stop("время вышло");
    carry += rate / 10;
    while (carry >= 1 && queue.length) {
      carry--;
      const token = queue.shift();
      void candidateFlow(token, state.launched++);
    }
    if (state.inflight > 3000) return stop("слишком много незавершённых регистраций — сайт не успевает");
    // Автостоп по последним 10 секундам — после первых 10.
    if (elapsed > 10) {
      const recent = state.seconds.slice(-10);
      const requests = recent.reduce((sum, s) => sum + s.requests, 0);
      const errors = recent.reduce((sum, s) => sum + s.errors, 0);
      const p95 = quantile(recent.flatMap((s) => s.latencies), 0.95);
      if (requests > 20 && errors / requests > 0.05) return stop(`автостоп: ошибок ${Math.round((100 * errors) / requests)}% за 10 с`);
      if (requests > 20 && p95 > state.maxP95 * 1000) return stop(`автостоп: 95% ответов дольше ${(p95 / 1000).toFixed(1)} с`);
    }
  }, 100);
  return { ok: true };
}

function stop(reason = "остановлен вручную") {
  if (!state.running) return { ok: true };
  clearInterval(arrivalTimer);
  state.running = false;
  state.stoppedAt = Date.now();
  state.reason = reason;
  note(`Стоп: ${reason}. Регистраций запущено ${state.launched}, завершено ${state.finished}, с ошибками ${state.failedFlows}.`);
  return { ok: true };
}

function snapshot() {
  const last = state.seconds.slice(-1)[0];
  const window = state.seconds.slice(-5);
  const requests = window.reduce((sum, s) => sum + s.requests, 0);
  const errors = window.reduce((sum, s) => sum + s.errors, 0);
  const latencies = window.flatMap((s) => s.latencies);
  return {
    running: state.running,
    target: state.target,
    targets: Object.fromEntries(
      Object.entries(TARGETS).map(([key, t]) => [key, { label: t.label, url: t.url, submit: t.submit, tokens: readTokens(key)?.candidates.length ?? 0, staff: readTokens(key)?.staff.length ?? 0 }]),
    ),
    limits: LIMITS,
    config: { rate: state.rate, duration: state.duration, staff: state.staff, submit: state.submit },
    elapsed: state.startedAt ? ((state.stoppedAt || Date.now()) - state.startedAt) / 1000 : 0,
    reason: state.reason,
    launched: state.launched,
    finished: state.finished,
    failedFlows: state.failedFlows,
    inflight: state.inflight,
    now: {
      rps: window.length ? requests / window.length : 0,
      errorRate: requests ? errors / requests : 0,
      p50: quantile(latencies, 0.5),
      p95: quantile(latencies, 0.95),
    },
    series: state.seconds.map((s) => ({ t: s.t, rps: s.requests, err: s.errors, p50: quantile(s.latencies, 0.5), p95: quantile(s.latencies, 0.95) })),
    endpoints: [...state.endpoints.entries()].map(([name, e]) => ({
      name,
      count: e.count,
      errors: e.errors,
      p50: quantile(e.latencies, 0.5),
      p95: quantile(e.latencies, 0.95),
      statuses: e.statuses,
    })),
    server,
    log: state.log,
    lastSecond: last?.t ?? 0,
  };
}

// Метрики сервера копим и между тестами — чтобы видеть фон.
const serverSeries = [];
setInterval(() => {
  if (!server) return;
  serverSeries.push({ at: server.at, cpu: server.cpu, mem: server.mem / server.memTotal, load: server.load / server.cores });
  if (serverSeries.length > 600) serverSeries.shift();
}, 2000);

// ---------------------------------------------------------------------------
// HTTP: страница, данные, команды.

const page = readFileSync(join(HERE, "index.html"), "utf8");

createServer(async (req, res) => {
  const send = (code, body, type = "application/json; charset=utf-8") => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  // Только с этого компьютера и только со своей страницы.
  if (req.method === "POST" && req.headers.origin !== `http://127.0.0.1:${PORT}`) return send(403, { ok: false, message: "Чужая страница." });
  const url = new URL(req.url, "http://x");
  if (req.method === "GET" && url.pathname === "/") return send(200, page, "text/html; charset=utf-8");
  if (req.method === "GET" && url.pathname === "/state") {
    const target = TARGETS[url.searchParams.get("target")] ? url.searchParams.get("target") : state.target;
    if (!state.running) startMetrics(target);
    return send(200, { ...snapshot(), serverSeries, watching: metricsTarget });
  }
  if (req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return send(400, { ok: false, message: "Плохой запрос." });
    }
    if (url.pathname === "/start") return send(200, start(body));
    if (url.pathname === "/stop") return send(200, stop());
    if (url.pathname === "/seed" || url.pathname === "/clean") {
      if (state.running) return send(200, { ok: false, message: "Сначала остановите тест." });
      if (!TARGETS[body.target]) return send(200, { ok: false, message: "Такой цели нет." });
      if (url.pathname === "/clean") return send(200, await clean(body.target));
      const candidates = Number(body.candidates);
      const staff = Number(body.staff ?? 20);
      if (!(Number.isInteger(candidates) && candidates > 0 && candidates <= 30000)) return send(200, { ok: false, message: "Кандидатов — от 1 до 30 000." });
      if (!(Number.isInteger(staff) && staff >= 0 && staff <= LIMITS.staff)) return send(200, { ok: false, message: `Организаторов — до ${LIMITS.staff}.` });
      return send(200, await seed(body.target, candidates, staff));
    }
  }
  send(404, { ok: false, message: "Нет такого." });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Нагрузочный стенд: http://127.0.0.1:${PORT}  (Ctrl+C — выйти)`);
  if (!existsSync(join(HERE, "index.html"))) console.error("Нет index.html рядом с server.mjs");
});

process.on("SIGINT", () => {
  stop("стенд закрыт");
  stopMetrics();
  process.exit(0);
});
