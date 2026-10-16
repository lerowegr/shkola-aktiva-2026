/**
 * Пересоздать демо-отбор (lib/demo/scenario.ts). Только для демо-копии:
 * без DEMO_RESET_CONFIRM=1 не запускается, чтобы случайно не стереть людей
 * @demo.local не там. На сервере: ./deploy/demo.sh reset
 */
import { resetDemo } from "../lib/demo/scenario";
import { db } from "../lib/db";

if (process.env.NUXT_PUBLIC_DEMO !== "true" || process.env.DEMO_RESET_CONFIRM !== "1") {
  console.error("Это не демо-копия: нужны NUXT_PUBLIC_DEMO=true и DEMO_RESET_CONFIRM=1.");
  process.exit(1);
}

resetDemo()
  .then((result) => console.log(`Демо готово: организаторов ${result.staff}, кандидатов ${result.candidates}.`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
