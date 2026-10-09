import { db } from "~~/lib/db";

import { checkOnboarding, type OnboardingInput, type OnboardingResult } from "./onboarding";

/**
 * Знакомство на базе. Что подставить в форму: уже сохранённое, иначе — из
 * анкеты отбора (если человек подавался до появления экрана), иначе имя и
 * фамилию из Telegram.
 */
export async function loadOnboarding(userId: string): Promise<Omit<OnboardingInput, "consent"> & { consented: boolean }> {
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
      consentAt: true,
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
    consented: user.consentAt !== null,
  };
}

export async function saveOnboarding(userId: string, input: OnboardingInput): Promise<OnboardingResult> {
  const checked = checkOnboarding(input);
  if (!checked.ok) return checked;

  const before = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { consentAt: true } });
  await db.user.update({
    where: { id: userId },
    data: { ...checked.value, consentAt: before.consentAt ?? new Date() },
  });

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
  return checked;
}
