#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BmsStack } from '../lib/bms-stack';

const app = new cdk.App();

// Every resource carries the project tag, so the school's cost shows up as
// its own line in Cost Explorer rather than mixed with anything else in the
// account. Activate "Project" under Billing → Cost allocation tags once.
cdk.Tags.of(app).add('Project', 'SnackDays');

const stage = app.node.tryGetContext('stage') ?? 'prod';

new BmsStack(app, `Bms-${stage}`, {
  stage,
  schoolName: app.node.tryGetContext('schoolName'),
  timezone: app.node.tryGetContext('timezone'),
  reminderHour: Number(app.node.tryGetContext('reminderHour') ?? 17),
  fromEmail: app.node.tryGetContext('fromEmail') || undefined,
  smsSenderId: app.node.tryGetContext('smsSenderId') || undefined,
  // Flip to true once an SMS origination identity exists. Until then AWS
  // accepts every Publish and silently drops it, so the app must not pretend
  // a text was sent.
  smsEnabled: app.node.tryGetContext('smsEnabled') === true
    || app.node.tryGetContext('smsEnabled') === 'true',
  alertEmail: app.node.tryGetContext('alertEmail'),
  budgetUsd: Number(app.node.tryGetContext('budgetUsd') ?? 10),
  retainData: app.node.tryGetContext('retainData') !== 'false'
    && app.node.tryGetContext('retainData') !== false,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'Montessori school parent operations — snack sign-up and reminders',
});
