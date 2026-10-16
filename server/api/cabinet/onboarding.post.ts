import { z } from "zod";

import { saveOnboarding } from "~~/lib/profile/onboarding-store";
import { requireSignedIn } from "~~/server/utils/session";

const text = (max: number) => z.string().max(max).default("");
const schema = z.object({
  lastName: text(60),
  firstName: text(60),
  middleName: text(60),
  course: text(4),
  faculty: text(20),
  studentId: text(30),
  phone: text(30),
  // Данные для входа — у пришедших через Telegram без пароля.
  login: text(64),
  email: text(160),
  password: z.string().max(256).default(""),
  repeat: z.string().max(256).default(""),
});

/**
 * Знакомство при первом входе. Время прохождения сохраняется один раз —
 * правка данных его не сдвигает.
 */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  const { login, email, password, repeat, ...profile } = body;
  const result = await saveOnboarding(user.id, profile, { login, email, password, repeat });
  if (!result.ok) return { ok: false, message: result.problems[0]!.message, problems: result.problems };
  await audit(event, { actorId: user.id, action: "profile.onboarding", entityType: "user", entityId: user.id });
  return { ok: true, message: "Готово, добро пожаловать!" };
});
