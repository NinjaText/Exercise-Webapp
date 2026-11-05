import { calendarMonthWindow } from "./cycle";
import { isAiUsageLimitError } from "./errors";
import {
  SYSTEM_ACCOUNT,
  assertWithinAllowance,
  extractTokenUsage,
  recordUsage,
  resolveAiAccountForUserId,
  resolveCurrentAiAccount,
  type AiAccount,
} from "./service";

export interface MeteredCallOptions {
  /**
   * Bill a specific user instead of the signed-in one (background jobs acting
   * for a trainer). null forces the system bucket.
   */
  actorUserId?: string | null;
}

/**
 * THE choke point for every AI call. Wrap the provider call:
 *
 *   const res = await meteredAiCall("program.generate", () => openai.chat.completions.create({...}))
 *   const { object } = await meteredAiCall("nutrition.photo", () => generateObject({...}))
 *
 * 1. Resolves the billed account (Clerk session → trainer; none → system).
 * 2. Refuses with AiUsageLimitError when the allowance is used up.
 * 3. Runs the call and records its prompt/completion tokens.
 *
 * Metering is fail-open: a DB/Clerk error while checking or recording is
 * logged and never blocks or fails the AI call — only a positive "exhausted"
 * refuses. Streaming calls: pass `stream_options: { include_usage: true }`
 * (OpenAI) or record from `onFinish` (AI SDK) via recordUsage.
 */
export async function meteredAiCall<R>(
  feature: string,
  call: () => Promise<R>,
  opts: MeteredCallOptions = {}
): Promise<R> {
  let account: AiAccount = SYSTEM_ACCOUNT;
  let window = calendarMonthWindow(new Date());
  try {
    account =
      opts.actorUserId === null
        ? SYSTEM_ACCOUNT
        : opts.actorUserId
          ? await resolveAiAccountForUserId(opts.actorUserId)
          : await resolveCurrentAiAccount();
    // The system bucket is never blocked and always calendar-month: no lookup needed.
    if (account.accountUserId) window = (await assertWithinAllowance(account)).window;
  } catch (error) {
    if (isAiUsageLimitError(error)) throw error;
    console.error(`[ai-usage] allowance check failed for ${feature} (allowing call):`, error);
  }

  const result = await call();

  const usage = extractTokenUsage(result);
  if (usage) {
    try {
      await recordUsage(account, window, feature, usage);
    } catch (error) {
      console.error(`[ai-usage] failed to record ${usage.totalTokens} tokens for ${feature}:`, error);
    }
  }
  return result;
}
