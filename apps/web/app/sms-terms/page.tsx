import { LegalPage } from '@/components/legal-page';

export default function SmsTermsPage() {
  return (
    <LegalPage title="Text message terms" updated="September 25, 2026">
      <p>Burlington Montessori School sends texts through this app to parents who turn them on.</p>
      <ul>
        <li><strong>What you&apos;ll get:</strong> sign-in codes and reminders about your snack day, about 2–4 a month.</li>
        <li><strong>To stop:</strong> reply STOP, or turn Text message off under You. <strong>For help:</strong> reply HELP or call the office at (781) 526-5368.</li>
        <li>Msg &amp; data rates may apply. Carriers aren&apos;t liable for late or undelivered messages.</li>
        <li>We never share your number for marketing. See <a href="/privacy/">Privacy</a>.</li>
      </ul>
    </LegalPage>
  );
}
