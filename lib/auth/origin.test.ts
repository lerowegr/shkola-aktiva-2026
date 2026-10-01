import { describe, expect, it } from "vitest";

import { isTrustedOrigin } from "./origin";

const ALLOWED = ["https://sha-2026.example", "sha-2026.example"];

describe("isTrustedOrigin", () => {
  it("пропускает свой сайт", () => {
    expect(isTrustedOrigin("https://sha-2026.example", ALLOWED)).toBe(true);
  });

  it("пропускает запрос без заголовка: это не браузер", () => {
    expect(isTrustedOrigin(undefined, ALLOWED)).toBe(true);
  });

  it("не пускает чужой сайт", () => {
    expect(isTrustedOrigin("https://evil.example", ALLOWED)).toBe(false);
  });

  it("не обманывается похожим именем", () => {
    expect(isTrustedOrigin("https://sha-2026.example.evil.example", ALLOWED)).toBe(
      false,
    );
    expect(isTrustedOrigin("https://not-sha-2026.example", ALLOWED)).toBe(false);
  });

  it("различает порт: localhost:3000 и localhost:4000 разные", () => {
    expect(isTrustedOrigin("http://localhost:3000", ["http://localhost:3000"])).toBe(true);
    expect(isTrustedOrigin("http://localhost:4000", ["http://localhost:3000"])).toBe(false);
  });

  it("понимает голый хост с портом, а не только полный адрес", () => {
    // Так выглядит заголовок Host, и раньше он молча превращался в пустую
    // строку: «localhost:3100» разбирался как протокол, а не как хост.
    expect(isTrustedOrigin("http://localhost:3100", ["localhost:3100"])).toBe(true);
    expect(isTrustedOrigin("http://localhost:3100", ["localhost:3000"])).toBe(false);
    expect(isTrustedOrigin("https://sha-2026.example", ["sha-2026.example"])).toBe(true);
  });

  it("не пускает песочницу и мусор", () => {
    expect(isTrustedOrigin("null", ALLOWED)).toBe(false);
    expect(isTrustedOrigin("совсем не адрес", ALLOWED)).toBe(false);
  });

  it("пустые записи в списке разрешённых ничего не разрешают", () => {
    expect(isTrustedOrigin("https://sha-2026.example", [undefined, ""])).toBe(false);
  });
});
