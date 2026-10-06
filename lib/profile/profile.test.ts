import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { avatarFile, deleteAvatarFiles, processAvatar } from "./avatar";
import { resetNickname, setNickname } from "./nickname";

let dir: string;
beforeEach(async () => {
  await resetDatabase();
  dir = mkdtempSync(path.join(tmpdir(), "sha-avatars-"));
  process.env.UPLOADS_DIR = dir;
});
afterEach(() => {
  delete process.env.UPLOADS_DIR;
  rmSync(dir, { recursive: true, force: true });
});

async function photo(): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: "#1c63ff" } }).png().toBuffer();
}

describe("свой ник", () => {
  it("первая установка свободна, повторная — с паузой 7 дней", async () => {
    const user = await db.user.create({ data: {} });
    expect(await setNickname(user.id, "Звезда")).toEqual({ ok: true });
    expect(await setNickname(user.id, "Звезда")).toEqual({ ok: true });
    expect(await setNickname(user.id, "Комета")).toMatchObject({ ok: false });
    const week = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await setNickname(user.id, "Комета", week)).toEqual({ ok: true });
  });

  it("ник уникален без учёта регистра", async () => {
    const first = await db.user.create({ data: {} });
    const second = await db.user.create({ data: {} });
    expect(await setNickname(first.id, "Звезда")).toEqual({ ok: true });
    expect(await setNickname(second.id, "звезда")).toMatchObject({ ok: false });
  });

  it("сброс убирает ник", async () => {
    const user = await db.user.create({ data: {} });
    await setNickname(user.id, "Звезда");
    expect(await resetNickname(user.id)).toEqual({ ok: true });
    expect(await resetNickname(user.id)).toMatchObject({ ok: false });
  });
});

describe("аватарка", () => {
  it("фото режется в квадрат и сохраняется, старое удаляется", async () => {
    const first = await processAvatar(await photo());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await processAvatar(await photo());
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.storageKey).not.toBe(first.storageKey);
    const meta = await sharp(avatarFile(second.storageKey)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([256, 256, "webp"]);
    await deleteAvatarFiles(first.storageKey);
    await deleteAvatarFiles(second.storageKey);
  });

  it("мусор и перевес отклоняются", async () => {
    expect(await processAvatar(Buffer.from("не фото"))).toMatchObject({ ok: false });
    expect(await processAvatar(Buffer.alloc(6 * 1024 * 1024))).toMatchObject({ ok: false });
  });
});
