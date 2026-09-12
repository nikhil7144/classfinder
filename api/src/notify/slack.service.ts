import { Injectable, Logger } from "@nestjs/common";

/**
 * Telling the team something happened, in Slack.
 *
 * An incoming webhook and nothing more. It is deliberately not part of the
 * notifications table: that queue exists to reach *users* and is drained by a
 * worker with retries, because a family missing an enquiry matters. This is
 * the office finding out, and the office can read the database if a message
 * goes astray.
 *
 * **Nothing here may ever fail the request that triggered it.** A coach
 * finishing their listing must not see an error because Slack was down, or
 * because nobody has set the webhook. Every failure is logged and swallowed.
 */
@Injectable()
export class SlackService {
  private readonly log = new Logger(SlackService.name);

  /** Unset in development and in tests, where this quietly does nothing. */
  private get webhook(): string | undefined {
    return process.env.SLACK_WEBHOOK_URL?.trim() || undefined;
  }

  get configured(): boolean {
    return Boolean(this.webhook);
  }

  /**
   * Post a message. Fire and forget.
   *
   * Not awaited by callers: the person who caused it is waiting on a save, and
   * a webhook round trip is not theirs to pay for.
   */
  send(text: string, blocks?: unknown[]): void {
    const url = this.webhook;
    if (!url) return;

    void this.post(url, text, blocks);
  }

  private async post(url: string, text: string, blocks?: unknown[]): Promise<void> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `text` is the fallback Slack shows in a notification and in clients
        // that cannot render blocks, so it is always sent even when blocks are.
        body: JSON.stringify(blocks ? { text, blocks } : { text }),
        // A webhook that hangs must not hold a connection open indefinitely.
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.log.warn(`Slack refused the message: ${response.status}`);
      }
    } catch (error) {
      this.log.warn(`Slack could not be reached: ${(error as Error).message}`);
    }
  }

  /**
   * A new coach or academy has finished their listing.
   *
   * Worth a message because it is actionable: a listing is invisible to
   * families until an admin approves it, so this is the queue growing by one.
   */
  providerRegistered(fields: {
    name: string | null;
    providerType: string;
    area: string | null;
    phone: string | null;
  }): void {
    const where = fields.area ?? "area not given";
    this.send(
      `New listing to review: ${fields.name ?? "Unnamed"} (${fields.providerType}) — ${where}`,
      [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `*New coach listing* — waiting for approval\n` +
              `*${fields.name ?? "Unnamed"}* · ${fields.providerType}\n` +
              `${where}${fields.phone ? ` · ${fields.phone}` : ""}`,
          },
        },
      ],
    );
  }

  /**
   * A family has finished their profile.
   *
   * Not actionable in the way a listing is — nobody approves a family — but it
   * is the number the business is actually watching, and `openToOffers` says
   * whether any coach will ever see them.
   */
  seekerRegistered(fields: {
    name: string | null;
    area: string | null;
    lookingFor: number;
    openToOffers: boolean;
  }): void {
    const where = fields.area ?? "area not given";
    this.send(
      `New family: ${fields.name ?? "Unnamed"} — ${where}`,
      [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `*New family*\n` +
              `*${fields.name ?? "Unnamed"}* · ${where}\n` +
              `${fields.lookingFor} thing${fields.lookingFor === 1 ? "" : "s"} on their list · ` +
              `${fields.openToOffers ? "open to coaches" : "not open to coaches"}`,
          },
        },
      ],
    );
  }
}
