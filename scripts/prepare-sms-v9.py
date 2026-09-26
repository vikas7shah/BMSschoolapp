#!/usr/bin/env python3
"""Waits for toll-free registration v8 to be decided, then prepares v9 as a
DRAFT — every field carried over from v8, the company website changed to the
public homeoperationshub.com — and stops. It does NOT submit: the owner reviews
and submits it in the AWS console. If v8 is approved, it does nothing."""
import subprocess, json, sys, time
R = 'registration-54212cc8a1c84d83ab4c83e467b9f763'
WEBSITE = 'https://homeoperationshub.com/'
def aws(*a):
    r = subprocess.run(['aws', 'pinpoint-sms-voice-v2', *a, '--output', 'json', '--region', 'us-east-1'], capture_output=True, text=True)
    if r.returncode: print('ERR', a[0], r.stderr.strip()[:300]); sys.exit(1)
    return json.loads(r.stdout) if r.stdout.strip() else {}
while True:
    v8 = [v for v in aws('describe-registration-versions', '--registration-id', R)['RegistrationVersions'] if v['VersionNumber'] == 8][0]
    if v8['RegistrationVersionStatus'] != 'REVIEWING': break
    time.sleep(600)
print('v8:', v8['RegistrationVersionStatus'], (v8.get('DeniedReasons') or [{}])[0].get('Reason'))
if v8['RegistrationVersionStatus'] == 'APPROVED':
    print('v8 approved - no v9 needed'); sys.exit(0)
v = aws('create-registration-version', '--registration-id', R)['VersionNumber']
prev = aws('describe-registration-field-values', '--registration-id', R, '--version-number', '8')['RegistrationFieldValues']
for f in prev:
    p = f['FieldPath']
    if f.get('RegistrationAttachmentId'):
        aws('put-registration-field-value', '--registration-id', R, '--field-path', p, '--registration-attachment-id', f['RegistrationAttachmentId'])
    elif f.get('SelectChoices'):
        aws('put-registration-field-value', '--registration-id', R, '--field-path', p, '--select-choices', *f['SelectChoices'])
    elif f.get('TextValue'):
        val = WEBSITE if p == 'companyInfo.website' else f['TextValue']
        aws('put-registration-field-value', '--registration-id', R, '--field-path', p, '--text-value', val)
defs = aws('describe-registration-field-definitions', '--registration-type', 'US_TOLL_FREE_REGISTRATION')['RegistrationFieldDefinitions']
have = {f['FieldPath'] for f in aws('describe-registration-field-values', '--registration-id', R, '--version-number', str(v))['RegistrationFieldValues']}
miss = [d['FieldPath'] for d in defs if d['FieldRequirement'] == 'REQUIRED' and d['FieldPath'] not in have]
print(f'v{v} prepared as DRAFT (not submitted); website = {WEBSITE}; missing required: {miss or "none"}')
