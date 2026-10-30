export const LEGACY_EMAIL_CONSENT_VERSION = "rank-notifications-2026-10-28-v1";
export const EMAIL_CONSENT_VERSION = "playne-emails-2026-10-30-v1";
export const EMAIL_LABEL = "Получать письма Playne";
export const EMAIL_DESCRIPTION = "Новые игры, напоминания и результаты";
export type EmailPurpose = "rank" | "general";
export const emailConsentPurpose = (
  version: unknown,
): EmailPurpose | undefined =>
  version === EMAIL_CONSENT_VERSION
    ? "general"
    : version === LEGACY_EMAIL_CONSENT_VERSION
      ? "rank"
      : undefined;
