import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { cleanFilename, MAX_UPLOAD_BYTES, readUpload, savePdf } from "./uploads";

const dir = path.resolve("test-results/uploads");
process.env.UPLOADS_DIR = dir;

const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");

beforeEach(resetDatabase);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("загрузка PDF", () => {
  it("настоящий PDF сохраняется на диск и читается обратно", async () => {
    const user = await db.user.create({ data: {} });
    const result = await savePdf({ userId: user.id, filename: "ДЗ_Смирнова.pdf", data: pdf });
    expect(result.ok).toBe(true);

    const stored = await readUpload(result.ok ? result.uploadId : "");
    expect(stored?.upload.filename).toBe("ДЗ_Смирнова.pdf");
    expect(Buffer.from(stored!.data).toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(existsSync(path.join(dir, stored!.upload.storageKey))).toBe(true);
  });

  it("не PDF с расширением .pdf — отказ", async () => {
    const user = await db.user.create({ data: {} });
    const fake = new TextEncoder().encode("MZ\x90\x00 это не pdf");
    expect(await savePdf({ userId: user.id, filename: "work.pdf", data: fake })).toMatchObject({ ok: false });
  });

  it("слишком большой — отказ", async () => {
    const user = await db.user.create({ data: {} });
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(pdf);
    expect(await savePdf({ userId: user.id, filename: "big.pdf", data: big })).toMatchObject({ ok: false });
  });

  it("имя чистится от путей и получает .pdf", () => {
    expect(cleanFilename("../../etc/passwd")).toBe("passwd.pdf");
    expect(cleanFilename("C:\\Users\\me\\Работа.PDF")).toBe("Работа.PDF");
    expect(cleanFilename("")).toBe("работа.pdf");
  });
});
