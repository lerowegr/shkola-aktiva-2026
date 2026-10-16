import { hashPassword } from "~~/lib/auth/password";
import { db } from "~~/lib/db";

import { checkCredentials, checkOnboarding, type CredentialsInput, type OnboardingField, type CredentialsField, type OnboardingInput } from "./onboarding";

/**
 * Знакомство на базе. Что подставить в форму: уже сохранённое, иначе — из
 * анкеты отбора (если человек подавался до появления экрана), иначе имя и
 * фамилию из Telegram.
 *
 * Регистрация участника — только через Telegram, поэтому у пришедшего
 * оттуда ещё нет пароля: здесь же он задаёт логин, почту и пароль, чтобы
 * входить и без Telegram.
 */
export interface OnboardingView extends OnboardingInput {
  done: boolean;
  /** Пароля нет — в форме блок «Данные для входа». */
  needsCredentials: boolean;
  login: string;
  email: string;
}

export async function loadOnboarding(userId: string): Promise<OnboardingView> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      middleName: true,
      course: true,
      faculty: true,
      studentId: true,
      phone: true,
      onboardedAt: true,
      login: true,
      email: true,
      passwordHash: true,
      applications: {
        where: { season: { isCurrent: true } },
        select: { lastName: true, firstName: true, middleName: true, studentId: true },
      },
    },
  });
  const application = user.applications[0];
  return {
    lastName: user.lastName ?? application?.lastName ?? "",
    firstName: user.firstName ?? application?.firstName ?? "",
    middleName: user.middleName ?? application?.middleName ?? "",
    course: user.course ?? "",
    faculty: user.faculty ?? "",
    studentId: user.studentId ?? application?.studentId ?? "",
    phone: user.phone ?? "",
    done: user.onboardedAt !== null,
    needsCredentials: user.passwordHash === null,
    login: user.login ?? "",
    email: user.email ?? "",
  };
}

type Problem = { field: OnboardingField | CredentialsField; message: string };
export type SaveOnboardingResult = { ok: true } | { ok: false; problems: Problem[] };

export async function saveOnboarding(
  userId: string,
  input: OnboardingInput,
  credentials?: CredentialsInput,
): Promise<SaveOnboardingResult> {
  const before = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { onboardedAt: true, passwordHash: true } });

  const checked = checkOnboarding(input);
  const problems: Problem[] = checked.ok ? [] : [...checked.problems];

  // Данные для входа обязательны, пока пароля нет: иначе без Telegram не войти.
  let login: { login: string; email: string; passwordHash: string } | null = null;
  if (before.passwordHash === null) {
    const creds = checkCredentials(credentials ?? { login: "", email: "", password: "", repeat: "" });
    if (!creds.ok) problems.push(...creds.problems);
    else {
      const [byLogin, byEmail] = await Promise.all([
        db.user.findFirst({ where: { login: creds.value.login, NOT: { id: userId } }, select: { id: true } }),
        db.user.findFirst({ where: { email: creds.value.email, NOT: { id: userId } }, select: { id: true } }),
      ]);
      if (byLogin) problems.push({ field: "login", message: "Такой логин уже занят — придумайте другой." });
      if (byEmail) problems.push({ field: "email", message: "Эта почта уже привязана к другому аккаунту. Укажите другую или напишите организаторам." });
      if (!byLogin && !byEmail) {
        login = { login: creds.value.login, email: creds.value.email, passwordHash: await hashPassword(creds.value.password) };
      }
    }
  }

  if (!checked.ok || problems.length) return { ok: false, problems };

  try {
    await db.user.update({
      where: { id: userId },
      data: {
        ...checked.value,
        onboardedAt: before.onboardedAt ?? new Date(),
        ...(login ? { login: login.login, email: login.email, passwordHash: login.passwordHash, passwordSetAt: new Date() } : {}),
      },
    });
  } catch (error) {
    // Два человека взяли один логин в одну секунду.
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, problems: [{ field: "login", message: "Такой логин или почта уже заняты — попробуйте другие." }] };
    }
    throw error;
  }

  // Черновик анкеты, если он уже есть, — те же ФИО и студбилет: человек
  // поправил себя здесь, и в анкете должно быть так же.
  await db.application.updateMany({
    where: { userId, status: "DRAFT", season: { isCurrent: true } },
    data: {
      lastName: checked.value.lastName,
      firstName: checked.value.firstName,
      middleName: checked.value.middleName,
      studentId: checked.value.studentId,
    },
  });
  return { ok: true };
}
