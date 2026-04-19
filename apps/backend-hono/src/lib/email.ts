import { env } from 'cloudflare:workers';

type EmailRecipient = {
  email: string;
  name?: string;
};

type SendEmailInput = {
  to: EmailRecipient[];
  subject: string;
  text: string;
  html?: string;
  tags?: string[];
};

type MailpitAddress = {
  Email: string;
  Name?: string;
};

const toMailpitAddresses = (recipients: EmailRecipient[]): MailpitAddress[] => {
  return recipients.map((recipient) => ({
    Email: recipient.email,
    ...(recipient.name ? { Name: recipient.name } : {}),
  }));
};

export const sendEmail = async (input: SendEmailInput): Promise<void> => {
  const mailpitUrl = env.MAILPIT_URL?.trim();

  if (!mailpitUrl) {
    console.log(`[email] ${input.subject} -> ${input.to.map((recipient) => recipient.email).join(', ')}`);
    console.log(input.text);
    return;
  }

  const response = await fetch(`${mailpitUrl}/api/v1/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      From: {
        Email: env.MAIL_FROM_EMAIL,
        Name: env.MAIL_FROM_NAME,
      },
      To: toMailpitAddresses(input.to),
      Subject: input.subject,
      Text: input.text,
      HTML: input.html,
      Tags: input.tags ?? ['auth'],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Mailpit send failed with status ${response.status}: ${details}`);
  }
};
