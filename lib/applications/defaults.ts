import type { QuestionFormat, QuestionType } from "~~/lib/generated/prisma/enums";

import {
  PORTRAIT_APPLICATION_CRITERIA,
  PORTRAIT_APPLICATION_MARKERS,
  PORTRAIT_ASSESSMENT_CRITERIA,
  PORTRAIT_ASSESSMENT_MARKERS,
  PORTRAIT_HOMEWORK_CRITERIA,
  PORTRAIT_HOMEWORK_MARKERS,
  PORTRAIT_INTERVIEW_CRITERIA,
  PORTRAIT_INTERVIEW_MARKERS,
  PORTRAIT_QUESTIONS,
  PORTRAIT_SECTIONS,
} from "./portrait";

/**
 * Анкета, критерии и маркеры по умолчанию — то, с чего начинается новый
 * сезон. Источник — портрет участника ША'26 (portrait.ts, из таблиц
 * организаторов). Это стартовый набор, а не закон: всё правится в админке
 * «Анкета и оценка», и сид правки не перезаписывает.
 */

export interface DefaultQuestion {
  section: string;
  type: QuestionType;
  label: string;
  help?: string;
  required?: boolean;
  options?: string[];
  maxLength?: number;
  minLength?: number;
  format?: QuestionFormat;
}

export interface DefaultSection {
  title: string;
  description?: string;
  homework?: boolean;
}

export interface DefaultCriterion {
  title: string;
  badge?: string;
  description?: string;
  indicators?: string;
  maxScore: number;
  levels: { score: number; text: string }[];
}

export interface DefaultMarker {
  title: string;
  example: string;
}

export const DEFAULT_APPLICATION_QUESTIONS: DefaultQuestion[] = PORTRAIT_QUESTIONS;
export const DEFAULT_APPLICATION_SECTIONS: DefaultSection[] = PORTRAIT_SECTIONS;

export const DEFAULT_APPLICATION_CRITERIA: DefaultCriterion[] = PORTRAIT_APPLICATION_CRITERIA;
export const DEFAULT_APPLICATION_MARKERS: DefaultMarker[] = PORTRAIT_APPLICATION_MARKERS;
export const DEFAULT_HOMEWORK_CRITERIA: DefaultCriterion[] = PORTRAIT_HOMEWORK_CRITERIA;
export const DEFAULT_HOMEWORK_MARKERS: DefaultMarker[] = PORTRAIT_HOMEWORK_MARKERS;
export const DEFAULT_ASSESSMENT_CRITERIA: DefaultCriterion[] = PORTRAIT_ASSESSMENT_CRITERIA;
export const DEFAULT_ASSESSMENT_MARKERS: DefaultMarker[] = PORTRAIT_ASSESSMENT_MARKERS;
export const DEFAULT_INTERVIEW_CRITERIA: DefaultCriterion[] = PORTRAIT_INTERVIEW_CRITERIA;
export const DEFAULT_INTERVIEW_MARKERS: DefaultMarker[] = PORTRAIT_INTERVIEW_MARKERS;
