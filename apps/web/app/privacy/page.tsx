import { LegalPage } from '@/components/legal-page';

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="September 25, 2026">
      <p>This app is provided by Burlington Montessori School for its families.</p>
      <ul>
        <li><strong>What we keep:</strong> your name, the phone and email the school has for you, your children&apos;s classrooms, and the snack days you sign up for.</li>
        <li><strong>What it&apos;s for:</strong> running the snack calendar and sending the reminders and codes you choose.</li>
        <li>We don&apos;t sell or share your information, and we never share phone numbers or text consent with anyone for marketing.</li>
        <li>Questions or corrections: ask the school office.</li>
      </ul>
    </LegalPage>
  );
}
