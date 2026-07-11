import { prisma } from "@rukus/db";
import type { Form, FormsConfig } from "@rukus/shared";

/** Look up a single form definition by id from a guild's forms config. */
export function findForm(config: FormsConfig, formId: string): Form | undefined {
  return config.forms.find((f) => f.id === formId);
}

/** Persist a completed submission as PENDING and return the row. */
export function createSubmission(params: {
  guildId: string;
  formId: string;
  formName: string;
  userId: string;
  answers: { label: string; value: string }[];
}) {
  return prisma.formSubmission.create({
    data: {
      guildId: params.guildId,
      formId: params.formId,
      formName: params.formName,
      userId: params.userId,
      answers: params.answers,
      status: "PENDING",
    },
  });
}

export function getSubmission(id: string) {
  return prisma.formSubmission.findUnique({ where: { id } });
}

export function attachReviewMessage(id: string, messageId: string) {
  return prisma.formSubmission.update({
    where: { id },
    data: { reviewMessageId: messageId },
  });
}

export function resolveSubmission(params: {
  id: string;
  status: "APPROVED" | "DENIED";
  reviewedBy: string;
  note?: string;
}) {
  return prisma.formSubmission.update({
    where: { id: params.id },
    data: {
      status: params.status,
      reviewedBy: params.reviewedBy,
      reviewNote: params.note ?? null,
      reviewedAt: new Date(),
    },
  });
}
