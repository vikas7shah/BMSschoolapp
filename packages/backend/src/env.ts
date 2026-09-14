/** Centralised env access so a missing wiring mistake fails loudly at cold start. */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}
function opt(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  tables: {
    users: req('TABLE_USERS'),
    children: req('TABLE_CHILDREN'),
    guardianships: req('TABLE_GUARDIANSHIPS'),
    classrooms: req('TABLE_CLASSROOMS'),
    slots: req('TABLE_SLOTS'),
    schools: req('TABLE_SCHOOLS'),
    notifications: req('TABLE_NOTIFICATIONS'),
    push: req('TABLE_PUSH'),
    dedupe: req('TABLE_DEDUPE'),
    rateLimit: req('TABLE_RATELIMIT'),
    loginChannels: req('TABLE_LOGIN_CHANNEL'),
  },
  cognito: {
    userPoolId: req('COGNITO_USER_POOL_ID'),
    clientId: req('COGNITO_CLIENT_ID'),
  },
  sessionSecretArn: req('SESSION_SECRET_ARN'),
  vapidSecretArn: opt('VAPID_SECRET_ARN'),
  schoolId: req('SCHOOL_ID'),
  appUrl: opt('APP_URL'),
  appUrlParam: opt('APP_URL_PARAM'),
  fromEmail: opt('FROM_EMAIL'),
  replyTo: opt('REPLY_TO'),
  remindersFunction: opt('REMINDERS_FUNCTION'),
  /** SES configuration set that reports bounces and complaints. */
  sesConfigSet: opt('SES_CONFIG_SET'),
  schoolName: opt('SCHOOL_NAME'),
  smsSenderId: opt('SMS_SENDER_ID'),
  /** False until an SMS origination identity exists; sends fall back to email. */
  smsEnabled: opt('SMS_ENABLED') === 'true',
  stage: opt('STAGE', 'prod'),
};
