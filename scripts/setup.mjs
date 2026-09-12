#!/usr/bin/env node
/**
 * One-time bootstrap: creates the school record, a first classroom, and the
 * first staff account so someone can sign in and run everything else from the
 * admin screens.
 *
 *   node scripts/setup.mjs --phone "+14155550123" --name "Vikas Shah"
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { REGION, backendConfig, normalizePhone, ulidish } from './lib/stack.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

// Defaults come from the deployed configuration, never from a second copy of
// it here — the sign-in SMS is branded from cdk.json, so the school record has
// to agree with it or parents see two different school names.
const cdkContext = JSON.parse(
  readFileSync(new URL('../infra/cdk.json', import.meta.url), 'utf8'),
).context;

const phoneRaw = arg('phone');
const fullName = arg('name', 'School Admin');
const emailRaw = arg('email');
const email = emailRaw ? emailRaw.trim().toLowerCase() : undefined;
const schoolName = arg('school', cdkContext.schoolName);
const timezone = arg('timezone', cdkContext.timezone);
const reminderHour = Number(arg('reminder-hour', String(cdkContext.reminderHour ?? 17)));
const classroomName = arg('classroom', 'Primary');

if (!phoneRaw) {
  console.error('Usage: node scripts/setup.mjs --phone "+14155550123" [--name "Jane Doe"]');
  process.exit(1);
}
const phone = normalizePhone(phoneRaw);
if (!phone) {
  console.error(`"${phoneRaw}" is not a valid phone number.`);
  process.exit(1);
}

const { env, outputs } = await backendConfig();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const cognito = new CognitoIdentityProviderClient({ region: REGION });
const now = new Date().toISOString();
const schoolId = env.SCHOOL_ID || 'school';

/* --------------------------------------------------------------- the school */

const existingSchool = await ddb.send(new GetCommand({
  TableName: env.TABLE_SCHOOLS, Key: { schoolId },
}));

if (existingSchool.Item) {
  const drifted = existingSchool.Item.name !== schoolName
    || existingSchool.Item.timezone !== timezone
    || existingSchool.Item.reminderHour !== reminderHour;
  if (drifted) {
    await ddb.send(new PutCommand({
      TableName: env.TABLE_SCHOOLS,
      Item: { ...existingSchool.Item, name: schoolName, timezone, reminderHour },
    }));
    console.log(`✓ Updated school to "${schoolName}" (${timezone}, reminders at ${reminderHour}:00)`);
  } else {
    console.log(`✓ School "${existingSchool.Item.name}" already exists`);
  }
} else {
  await ddb.send(new PutCommand({
    TableName: env.TABLE_SCHOOLS,
    Item: { schoolId, name: schoolName, timezone, reminderHour, createdAt: now },
  }));
  console.log(`✓ Created school "${schoolName}" (${timezone}, reminders at ${reminderHour}:00)`);
}

/* ------------------------------------------------------------ the classroom */

const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
const rooms = await ddb.send(new QueryCommand({
  TableName: env.TABLE_CLASSROOMS,
  IndexName: 'bySchool',
  KeyConditionExpression: 'schoolId = :s',
  ExpressionAttributeValues: { ':s': schoolId },
}));

let classroomId;
if (rooms.Items?.length) {
  classroomId = rooms.Items[0].classroomId;
  console.log(`✓ Classroom "${rooms.Items[0].name}" already exists`);
} else {
  classroomId = ulidish();
  await ddb.send(new PutCommand({
    TableName: env.TABLE_CLASSROOMS,
    Item: {
      classroomId, schoolId, name: classroomName,
      snackWeekdays: [1, 2, 3, 4, 5],
      slotTypes: ['DRY', 'FRUIT'],
      createdAt: now,
    },
  }));
  console.log(`✓ Created classroom "${classroomName}" (Mon–Fri, dry snack + fruit)`);
}

/* -------------------------------------------------------------- the admin */

const existing = await ddb.send(new QueryCommand({
  TableName: env.TABLE_USERS,
  IndexName: 'byPhone',
  KeyConditionExpression: 'phone = :p',
  ExpressionAttributeValues: { ':p': phone },
  Limit: 1,
}));

if (existing.Items?.length) {
  const current = existing.Items[0];
  if (email && current.email !== email) {
    // Adding an address here is what enables signing in by email.
    await ddb.send(new PutCommand({
      TableName: env.TABLE_USERS,
      Item: { ...current, email, updatedAt: now },
    }));
    console.log(`✓ Set email ${email} on the ${current.role} account for ${phone}`);
  } else {
    console.log(`✓ ${phone} is already registered as ${current.role}`);
  }
} else {
  const [firstName, ...rest] = fullName.split(' ');
  const userId = ulidish();

  await cognito.send(new AdminCreateUserCommand({
    UserPoolId: env.COGNITO_USER_POOL_ID,
    Username: phone,
    MessageAction: 'SUPPRESS',
    UserAttributes: [
      { Name: 'phone_number', Value: phone },
      { Name: 'phone_number_verified', Value: 'true' },
      { Name: 'custom:userId', Value: userId },
    ],
  }));
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: env.COGNITO_USER_POOL_ID,
    Username: phone,
    Password: `${randomBytes(24).toString('base64url')}aA1!`,
    Permanent: true,
  }));

  await ddb.send(new PutCommand({
    TableName: env.TABLE_USERS,
    Item: {
      userId, schoolId, role: 'ADMIN',
      firstName: firstName || 'School', lastName: rest.join(' ') || 'Admin',
      phone, email, status: 'INVITED',
      prefs: { sms: true, email: false, push: false, inApp: true },
      createdAt: now, updatedAt: now,
    },
  }));
  console.log(`✓ Created staff account for ${fullName} (${phone})`);
}

console.log(`\nOpen ${outputs.AppUrl} and sign in with ${phone}.`);
console.log('If the code does not arrive, run:  npm run otp');
