#!/usr/bin/env python3
"""Waits for toll-free registration v7 to be decided, then files v8 with the
short consent wording and docs/opt-in-journey.png. If v7 is approved it stops
and reports instead of replacing an approved registration."""
import subprocess, json, sys, time
R = 'registration-54212cc8a1c84d83ab4c83e467b9f763'
def aws(*a):
    r = subprocess.run(['aws', 'pinpoint-sms-voice-v2', *a, '--output', 'json', '--region', 'us-east-1'], capture_output=True, text=True)
    if r.returncode: print('ERR', a[0], r.stderr.strip()[:300]); sys.exit(1)
    return json.loads(r.stdout) if r.stdout.strip() else {}
while True:
    v7 = [v for v in aws('describe-registration-versions', '--registration-id', R)['RegistrationVersions'] if v['VersionNumber'] == 7][0]
    if v7['RegistrationVersionStatus'] != 'REVIEWING': break
    time.sleep(600)
print('v7:', v7['RegistrationVersionStatus'], (v7.get('DeniedReasons') or [{}])[0].get('Reason'))
if v7['RegistrationVersionStatus'] == 'APPROVED':
    print('v7 approved - v8 NOT submitted'); sys.exit(0)
v = aws('create-registration-version', '--registration-id', R)['VersionNumber']
prev = {f['FieldPath']: f for f in aws('describe-registration-field-values', '--registration-id', R, '--version-number', '7')['RegistrationFieldValues']}
att = aws('create-registration-attachment', '--attachment-body', 'fileb://docs/opt-in-journey.png', '--tags', 'Key=Project,Value=SnackDays')['RegistrationAttachmentId']
time.sleep(8)
CONSENT = "Snack-day reminders and sign-in codes from Burlington Montessori School. About 2–4 texts a month. Msg & data rates may apply. Reply STOP to cancel, HELP for help."
OPTIN = ("Parents are added by the school office with texts OFF. To get texts, a parent signs in at bms.homeoperationshub.com, opens the You screen "
         "and turns on Text message. The switch reads: \"" + CONSENT + "\" with links to the Terms and Privacy pages. Texts go to the number shown on that screen. "
         "Staff cannot turn texts on for a parent. The attached image shows the four screens in order: sign in, switch off, switch on, terms.")
text = {k: f['TextValue'] for k, f in prev.items() if f.get('TextValue')}
text['messagingUseCase.optInDescription'] = OPTIN
select = {k: f['SelectChoices'][0] for k, f in prev.items() if f.get('SelectChoices')}
for k, val in text.items(): aws('put-registration-field-value', '--registration-id', R, '--field-path', k, '--text-value', val)
for k, val in select.items(): aws('put-registration-field-value', '--registration-id', R, '--field-path', k, '--select-choices', val)
aws('put-registration-field-value', '--registration-id', R, '--field-path', 'messagingUseCase.optInImage', '--registration-attachment-id', att)
defs = aws('describe-registration-field-definitions', '--registration-type', 'US_TOLL_FREE_REGISTRATION')['RegistrationFieldDefinitions']
have = {f['FieldPath'] for f in aws('describe-registration-field-values', '--registration-id', R, '--version-number', str(v))['RegistrationFieldValues']}
miss = [d['FieldPath'] for d in defs if d['FieldRequirement'] == 'REQUIRED' and d['FieldPath'] not in have]
if miss: print('missing', miss); sys.exit(1)
r = aws('submit-registration-version', '--registration-id', R)
print('submitted v' + str(r['VersionNumber']), r['RegistrationVersionStatus'])
