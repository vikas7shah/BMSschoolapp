import { LegalPage } from '@/components/legal-page';

export default function SmsTermsPage() {
  return (
    <LegalPage title="Text message terms" updated="September 15, 2026">
      <p>
        These terms cover text messages (SMS) sent by <strong>Galaxy Holdings LLC</strong>, operating as
        Home Operations Hub, on behalf of <strong>Burlington Montessori School</strong> through this app.
      </p>

      <h2>What you will receive</h2>
      <ul>
        <li>A one-time sign-in code when you sign in to the app by text.</li>
        <li>Reminders about the snack day you signed up for: the day before, a week before, and when days still need a family.</li>
      </ul>
      <p>About 2–4 messages a month. Message frequency varies with how the school year runs.</p>

      <h2>How you opt in</h2>
      <p>
        Nobody is texted without asking. Text messages are off for every family until you sign in,
        open <strong>You</strong>, and switch on <strong>Text message</strong>. The switch shows the full consent
        statement and the number that will be used. Consent is yours alone; school staff cannot switch it on for you.
      </p>

      <h2>How you opt out</h2>
      <ul>
        <li>Reply <strong>STOP</strong> to any message and texts end at once.</li>
        <li>Or switch <strong>Text message</strong> off under <strong>You</strong> in the app.</li>
      </ul>
      <p>Reply <strong>HELP</strong> to any message for help, or email <a href="mailto:hello@homeoperationshub.com">hello@homeoperationshub.com</a>.</p>

      <h2>Cost</h2>
      <p>
        Messages are free from us. <strong>Message and data rates may apply</strong> according to your mobile plan.
        Carriers are not liable for delayed or undelivered messages.
      </p>

      <h2>Your number</h2>
      <p>
        We text the number the school holds for you, shown on the <strong>You</strong> screen. Your number is used only
        to deliver these messages and is never sold or shared for marketing. See the{' '}
        <a href="/privacy/">privacy policy</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Galaxy Holdings LLC · 1 Alan R Gerrish Dr, Unit 1, Woburn, MA 01801 ·{' '}
        <a href="mailto:hello@homeoperationshub.com">hello@homeoperationshub.com</a>
      </p>
    </LegalPage>
  );
}
