import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

/*
 * promisify видит у scrypt несколько перегрузок и выбирает первую — ту,
 * что без настроек. Указываем тип руками, иначе параметры стоимости
 * передать нельзя.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Пароли организаторов.
 *
 * Считаем scrypt из стандартной библиотеки Node, а не argon2 или bcrypt
 * из npm. Причина не в том, что он лучше — argon2id современнее. Причина
 * в том, что оба конкурента собираются под платформу нативно, а сайт
 * едет в Docker на сервер, где пересборка нативного модуля — это
 * ровно та поломка, которую чинят ночью перед запуском. scrypt входит в
 * Node, признан OWASP и не может «не собраться».
 *
 * N = 2^14 (16 МБ памяти, ~0,08 с на сервере) — уровень, который автор
 * scrypt советует для входа на сайт. Было 2^16 (64 МБ, 0,32 с), но
 * нагрузочный тест показал: сервер с 4 ядрами при этом регистрирует не
 * больше 5–6 человек в секунду, а в пик открытия анкеты нужно ~17.
 * От онлайн-перебора защищают лимит попыток и правила паролей.
 *
 * В строке лежит всё, что нужно для проверки, включая параметры. Когда
 * через пару лет их поднимут, старые хеши продолжат работать: проверка
 * читает параметры из самой строки, а не из текущих настроек.
 */
const COST = 14; // 2^14
const BLOCK_SIZE = 8;
const PARALLEL = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** scrypt отказывается работать, если ему не разрешить нужную память. */
function memoryFor(cost: number, blockSize: number, parallel: number): number {
  return 128 * (1 << cost) * blockSize * parallel + 1024 * 1024;
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);

  const key = await scryptAsync(plain.normalize("NFKC"), salt, KEY_LENGTH, {
    N: 1 << COST,
    r: BLOCK_SIZE,
    p: PARALLEL,
    maxmem: memoryFor(COST, BLOCK_SIZE, PARALLEL),
  });

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLEL,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/** Хеш со старыми параметрами — пересчитать при следующем удачном входе. */
export function needsRehash(stored: string | null): boolean {
  const parts = stored?.split("$") ?? [];
  return parts[0] === "scrypt" && (Number(parts[1]) !== COST || Number(parts[2]) !== BLOCK_SIZE || Number(parts[3]) !== PARALLEL);
}

/**
 * Сравнение идёт через timingSafeEqual: обычное === возвращается тем
 * быстрее, чем раньше нашлось расхождение, и по времени ответа хеш
 * восстанавливается побайтово.
 */
export async function verifyPassword(
  plain: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallel = Number(parts[3]);

  if (!Number.isInteger(cost) || cost < 12 || cost > 20) return false;
  if (!Number.isInteger(blockSize) || !Number.isInteger(parallel)) return false;

  const salt = Buffer.from(parts[4]!, "base64");
  const expected = Buffer.from(parts[5]!, "base64");

  const key = await scryptAsync(plain.normalize("NFKC"), salt, expected.length, {
    N: 1 << cost,
    r: blockSize,
    p: parallel,
    maxmem: memoryFor(cost, blockSize, parallel),
  });

  return key.length === expected.length && timingSafeEqual(key, expected);
}
