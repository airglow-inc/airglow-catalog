// The Gmail connection is scoped to the user's Google account email (the
// connector account label). The label is a claim, not a verified identity —
// GMAIL_GET_PROFILE confirms the authorized mailbox actually matches.
async function getGmailConnectionInfoForEmail(
  email: string,
): Promise<{ connected: boolean; email?: string }> {
  if (!email) return { connected: false };
  try {
    const { connected } = await airglow.connectors.status('gmail', { account: email });
    if (!connected) return { connected: false };
    const profile = await airglow.connectors.execute('GMAIL_GET_PROFILE', { user_id: 'me' }, { account: email });
    const data: any = profile.data ?? {};
    const confirmedEmail = data.emailAddress || data.response_data?.emailAddress || undefined;
    if (confirmedEmail && confirmedEmail.toLowerCase() !== email.toLowerCase()) {
      return { connected: false, email: confirmedEmail };
    }
    return { connected: true, email: confirmedEmail || email };
  } catch {
    return { connected: false };
  }
}

// --- Message parsing ---

function unwrap(raw: any): any {
  return raw?.data?.response_data ?? raw?.data ?? raw ?? {};
}

function parseMessage(raw: any): {
  subject: string;
  from: string;
  to: string;
  cc: string;
  body: string;
} {
  const d = unwrap(raw);
  return {
    subject: d.subject ?? d.Subject ?? '',
    from: d.sender ?? d.from ?? d.From ?? '',
    to: d.to ?? d.To ?? '',
    cc: d.cc ?? d.Cc ?? '',
    body: d.messageText ?? d.message_text ?? d.body ?? d.plain_text ?? d.snippet ?? '',
  };
}

// --- Main handler ---

export default async function extract(body: { messageId?: string; userEmail?: string }) {
  const { messageId, userEmail } = body;

  if (!messageId) return { ok: false, error: 'messageId is required' };
  if (!userEmail) return { ok: false, error: 'userEmail is required' };

  // Gmail connection check — the client runs airglow.connectors.connect()
  // (OAuth popup) when this comes back needsAuth.
  const conn = await getGmailConnectionInfoForEmail(userEmail);
  if (!conn.connected) {
    return { ok: false, needsAuth: true, userEmail, toolkit: 'gmail' };
  }

  // Fetch the email
  let gmailRaw: unknown;
  try {
    gmailRaw = await airglow.connectors.execute(
      'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
      { message_id: messageId, user_id: 'me' },
      { account: userEmail },
    );
  } catch (e) {
    return { ok: false, error: `Gmail fetch failed: ${String(e)}` };
  }

  const { subject, from, to, cc, body: emailBody } = parseMessage(gmailRaw);
  if (!emailBody) {
    return { ok: false, error: 'Email body was empty after Gmail fetch' };
  }

  const participants = [
    from && `from: ${from}`,
    to && `to: ${to}`,
    cc && `cc: ${cc}`,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `Extract meeting details from this email.

Email subject: ${subject}
User (do NOT include as guest): ${userEmail}
Participants:
${participants}

${emailBody}`;

  const schema = {
    type: 'object' as const,
    properties: {
      title: { type: 'string' as const, description: 'Concise meeting title, e.g. "Alice<>Bob"' },
      date: { type: 'string' as const, description: 'YYYY-MM-DD. Suggest next business day if not mentioned in email' },
      startTime: { type: 'string' as const, description: 'HH:MM 24h format. Default 14:00 if not mentioned' },
      endTime: { type: 'string' as const, description: 'HH:MM 24h format. Default 30 min after startTime' },
      guests: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: `Email addresses of guests from the participants list. NEVER include ${userEmail}.`,
      },
      location: { type: 'string' as const, description: 'Meeting location if mentioned, otherwise empty string' },
      description: { type: 'string' as const, description: 'One brief sentence about the meeting agenda, or empty string' },
    },
    required: ['title', 'date', 'startTime', 'endTime', 'guests', 'location', 'description'] as const,
    additionalProperties: false as const,
  };

  const model = 'anthropic/claude-sonnet-5';

  // airglow.llm proxies to the platform's LLM gateway — no app API key needed.
  const response = await airglow.llm.chat({
    model,
    messages: [{ role: 'user', content: prompt }],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'meeting_details', strict: true, schema },
    },
  });

  const text = response.choices[0]?.message?.content ?? '';

  // Log data passed back to client for storage in airglow.storage
  const _log = { model, subject, participants, prompt, raw: text };

  try {
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);
    return { ok: true, result, _log: { ..._log, result } };
  } catch {
    return { ok: false, error: 'Failed to parse LLM response', raw: text, _log };
  }
}
