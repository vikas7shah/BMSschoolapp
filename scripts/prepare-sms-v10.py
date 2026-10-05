#!/usr/bin/env python3
"""Prepares toll-free registration v10 as a DRAFT with Burlington Montessori
School as the business — v9 was denied for naming the software company
(Galaxy Holdings / Home Operations Hub) rather than the school that sends the
texts. Carries over v9's samples, URLs and opt-in image; leaves the tax ID
empty for the owner to enter. Does NOT submit."""
import json, subprocess, sys
R = 'registration-54212cc8a1c84d83ab4c83e467b9f763'

OVERRIDES = {
    'companyInfo.companyName': 'Burlington Montessori School',
    'companyInfo.website': 'https://burlingtonmontessorischool.org/',
    'companyInfo.address1': '6 Lexington St',
    'companyInfo.city': 'Burlington',
    'companyInfo.state': 'MA',
    'companyInfo.zipCode': '01803',
    'companyInfo.isoCountryCode': 'US',
    'contactInfo.firstName': 'Daniel',
    'contactInfo.lastName': 'Bertini',
    'contactInfo.supportEmail': 'dbertini0101@gmail.com',
    'contactInfo.supportPhoneNumber': '+17812730432',
    'messagingUseCase.useCaseDetails': (
        'Burlington Montessori School, a private Montessori school in Burlington, MA, texts the parents of its '
        'enrolled children through its parent app, BMS Families (bms.homeoperationshub.com). Two kinds of message, '
        'only to parents who turned texts on in the app: (1) a one-time code when the parent signs in, and (2) '
        'reminders about school activities the parent signed up for, such as their snack day. About 2-4 messages '
        'a month per parent. No marketing; numbers are never shared.'
    ),
    'messagingUseCase.optInDescription': (
        'Burlington Montessori School adds each enrolled family to its parent app, BMS Families, with texts OFF. '
        'To get texts, a parent signs in at bms.homeoperationshub.com, opens the You screen and turns on Text '
        'message. The switch reads: "Snack-day reminders and sign-in codes from Burlington Montessori School. '
        'About 2-4 texts a month. Msg & data rates may apply. Reply STOP to cancel, HELP for help." with links to '
        'the Terms and Privacy pages. Texts go to the number shown on that screen. School staff cannot turn texts '
        'on for a parent. The attached image shows the four screens in order: sign in, switch off, switch on, terms.'
    ),
}
LEAVE_EMPTY = {'companyInfo.taxId'}  # the owner enters the school's EIN in the console


def aws(*a):
    r = subprocess.run(['aws', 'pinpoint-sms-voice-v2', *a, '--output', 'json', '--region', 'us-east-1'],
                       capture_output=True, text=True)
    if r.returncode:
        print('ERR', a[0], r.stderr.strip()[:300]); sys.exit(1)
    return json.loads(r.stdout) if r.stdout.strip() else {}


v = aws('create-registration-version', '--registration-id', R)['VersionNumber']
prev = aws('describe-registration-field-values', '--registration-id', R, '--version-number', '9')['RegistrationFieldValues']
for f in prev:
    p = f['FieldPath']
    if p in LEAVE_EMPTY:
        continue
    if p in OVERRIDES:
        aws('put-registration-field-value', '--registration-id', R, '--field-path', p, '--text-value', OVERRIDES[p])
    elif f.get('RegistrationAttachmentId'):
        aws('put-registration-field-value', '--registration-id', R, '--field-path', p,
            '--registration-attachment-id', f['RegistrationAttachmentId'])
    elif f.get('SelectChoices'):
        aws('put-registration-field-value', '--registration-id', R, '--field-path', p, '--select-choices', *f['SelectChoices'])
    elif f.get('TextValue'):
        aws('put-registration-field-value', '--registration-id', R, '--field-path', p, '--text-value', f['TextValue'])

have = {f['FieldPath'] for f in aws('describe-registration-field-values', '--registration-id', R,
                                    '--version-number', str(v))['RegistrationFieldValues']}
missing = sorted(set(OVERRIDES) - have)
print(f'v{v} prepared as DRAFT (not submitted). Still to fill in the console: companyInfo.taxId'
      + (f'; unexpectedly missing: {missing}' if missing else ''))
