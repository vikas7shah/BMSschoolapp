import { LegalPage } from '@/components/legal-page';

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="September 15, 2026">
      <p>
        This app is run by <strong>Galaxy Holdings LLC</strong>, operating as Home Operations Hub, for
        <strong> Burlington Montessori School</strong>. It exists to organise snack days and share school
        news with the families of enrolled children. This policy says what we hold, why, and who sees it.
      </p>

      <h2>What we hold</h2>
      <ul>
        <li>Your name, the mobile number and email address the school holds for you, and which of your children is in which classroom — provided by the school office from its roster.</li>
        <li>The snack days you sign up for, and the reminders and confirmations we sent you.</li>
        <li>Your notification preferences: whether you want email, text messages, or push notifications.</li>
        <li>Sign-in records: when you last signed in, and short-lived codes used to sign you in.</li>
      </ul>

      <h2>What we use it for</h2>
      <ul>
        <li>Showing you the snack calendar and your family's days.</li>
        <li>Sending sign-in codes and snack-day reminders by the channels you have switched on.</li>
        <li>Showing the school office which days still need a family.</li>
      </ul>
      <p>Nothing else. We do not advertise, profile, or sell or share your information for marketing.</p>

      <h2>Text messages</h2>
      <p>
        Text messages are off until you switch them on under <strong>You</strong>. When you do, your mobile number
        is used only to send the messages described in the <a href="/sms-terms/">text message terms</a>. Mobile
        information is never shared with third parties or affiliates for marketing or promotional purposes.
        Reply STOP to opt out at any time.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>You see your own family's details and days. Other families see the child's first name on days that are taken, not contact details.</li>
        <li>School staff see the roster and the calendar for their school.</li>
        <li>Service providers that carry the app and its messages — Amazon Web Services for hosting, email and text delivery — process data on our behalf and under our instructions.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        While your child is enrolled and you are on the school's roster. When the office removes a family from the
        app, the account, its sign-in, and its bookings are deleted. Message history is kept for the school year.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Change your email address and notification channels under <strong>You</strong>.</li>
        <li>Ask the school office to correct your details or remove your family from the app.</li>
        <li>Email us at <a href="mailto:hello@homeoperationshub.com">hello@homeoperationshub.com</a> with any question about your data.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Galaxy Holdings LLC · 1 Alan R Gerrish Dr, Unit 1, Woburn, MA 01801 ·{' '}
        <a href="mailto:hello@homeoperationshub.com">hello@homeoperationshub.com</a>
      </p>
    </LegalPage>
  );
}
