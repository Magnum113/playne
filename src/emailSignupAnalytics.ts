import { EMAIL_GOALS, reachGoal } from "./analytics";
import { parseEmailSignupOrigin } from "./emailSignup";

export function trackEmailSignup(step: keyof typeof EMAIL_GOALS, origin: unknown) {
  const params = parseEmailSignupOrigin(origin);
  if (params) reachGoal(EMAIL_GOALS[step], params);
}
