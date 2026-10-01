import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { checkInitData } from "./telegram-init-data";

const TOKEN = "123456:TEST-BOT-TOKEN";
const NOW = new Date("2026-09-15T12:00:00Z");

/** Собирает такую же строку, какую присылает Telegram. */
function sign(
  fields: Record<string, string>,
  token = TOKEN,
): string {
  const pairs = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort();

  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");

  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}

const USER = JSON.stringify({
  id: 4242,
  first_name: "Егор",
  last_name: "Ярцев",
  username: "lerowegr",
});

function freshFields(seconds = Math.floor(NOW.getTime() / 1000)) {
  return { auth_date: String(seconds), query_id: "AAB", user: USER };
}

describe("checkInitData", () => {
  it("принимает подписанную ботом строку", () => {
    const result = checkInitData(sign(freshFields()), TOKEN, NOW);

    expect(result).toEqual({
      ok: true,
      user: {
        id: "4242",
        firstName: "Егор",
        lastName: "Ярцев",
        username: "lerowegr",
      },
      authDate: new Date("2026-09-15T12:00:00Z"),
    });
  });

  it("не верит подписи чужого бота", () => {
    const foreign = sign(freshFields(), "999:SOMEONE-ELSE");
    expect(checkInitData(foreign, TOKEN, NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("замечает подмену данных после подписи", () => {
    const honest = sign(freshFields());
    const tampered = honest.replace(/user=[^&]*/, `user=${encodeURIComponent(
      JSON.stringify({ id: 1, first_name: "Чужой" }),
    )}`);

    expect(checkInitData(tampered, TOKEN, NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("не принимает вчерашнюю строку", () => {
    const yesterday = Math.floor(NOW.getTime() / 1000) - 25 * 60 * 60;
    expect(checkInitData(sign(freshFields(yesterday)), TOKEN, NOW)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("не принимает строку из будущего", () => {
    const later = Math.floor(NOW.getTime() / 1000) + 10 * 60;
    expect(checkInitData(sign(freshFields(later)), TOKEN, NOW)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("без подписи и без токена бота не пропускает", () => {
    expect(checkInitData("auth_date=1&user=%7B%7D", TOKEN, NOW)).toEqual({
      ok: false,
      reason: "no_signature",
    });
    expect(checkInitData(sign(freshFields()), "", NOW)).toEqual({
      ok: false,
      reason: "no_signature",
    });
  });

  it("подписанную строку без человека не принимает", () => {
    const noUser = sign({ auth_date: String(Math.floor(NOW.getTime() / 1000)) });
    expect(checkInitData(noUser, TOKEN, NOW)).toEqual({
      ok: false,
      reason: "no_user",
    });
  });
});
