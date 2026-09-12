import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface MonitoringProps {
  stage: string;
  /** Where every alert goes. Subscription must be confirmed by email once. */
  alertEmail: string;
  /** Monthly spend to alert at, in USD. */
  budgetUsd: number;
  api: lambda.Function;
  reminders: lambda.Function;
  authTriggers: lambda.Function[];
  httpApi: apigw.HttpApi;
}

/**
 * Everything that can go wrong quietly, made loud.
 *
 * The failure modes that matter for a school are the silent ones: a reminder
 * job that stops running, an email that bounces, a text that is accepted and
 * dropped. Each is turned into a CloudWatch alarm on one topic, so a problem
 * reaches a person before it reaches a parent.
 */
export class Monitoring extends Construct {
  readonly topic: sns.Topic;
  readonly sesConfigurationSet: ses.ConfigurationSet;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);
    const { stage } = props;

    this.topic = new sns.Topic(this, 'Alerts', {
      topicName: `bms-${stage}-alerts`,
      displayName: 'Snack Days alerts',
    });
    this.topic.addSubscription(new subs.EmailSubscription(props.alertEmail));

    const notify = new cwActions.SnsAction(this.topic);
    const alarm = (name: string, metric: cw.IMetric, opts: Partial<cw.AlarmProps> & { description: string }) => {
      const a = new cw.Alarm(this, name, {
        alarmName: `bms-${stage}-${name}`,
        metric,
        threshold: 0,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        ...opts,
        alarmDescription: opts.description,
      });
      a.addAlarmAction(notify);
      a.addOkAction(notify);
      return a;
    };

    /* ------------------------------------------ crashes in any function */
    const fns: [string, lambda.Function][] = [
      ['api', props.api],
      ['reminders', props.reminders],
      ...props.authTriggers.map((f, i) => [`auth-${i + 1}`, f] as [string, lambda.Function]),
    ];
    for (const [name, fn] of fns) {
      alarm(`${name}-errors`, fn.metricErrors({ period: cdk.Duration.minutes(5), statistic: 'Sum' }), {
        description: `The ${name} function threw an error. Check its CloudWatch log group for the stack trace.`,
      });
    }

    /* ------------------------------------------ the API returning 5xx */
    alarm('api-5xx', props.httpApi.metricServerError({ period: cdk.Duration.minutes(5), statistic: 'Sum' }), {
      description: 'The API returned a 5xx to a parent. Usually an unhandled error in the api function.',
    });

    /* ------------------------------------------ reminders stopped running */
    // The job runs hourly. Two consecutive hours with no invocation means the
    // schedule is broken, and nobody will be reminded tonight.
    alarm('reminders-not-running', props.reminders.metricInvocations({ period: cdk.Duration.hours(1), statistic: 'Sum' }), {
      threshold: 1,
      comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cw.TreatMissingData.BREACHING,
      description: 'The reminder job has not run for two hours. Check the EventBridge schedule and the reminders function.',
    });

    /* ------------------------------------------ deliveries that failed */
    // Delivery code never throws — one bad channel must not block the others —
    // so failures are logged, and the logs are what we watch.
    const deliveryFailures = (name: string, group: logs.ILogGroup, pattern: string, description: string) => {
      const mf = new logs.MetricFilter(this, `${name}Filter`, {
        logGroup: group,
        metricNamespace: 'SnackDays',
        metricName: name,
        filterPattern: logs.FilterPattern.anyTerm(...pattern.split('|')),
        metricValue: '1',
        defaultValue: 0,
      });
      alarm(name, mf.metric({ period: cdk.Duration.minutes(5), statistic: 'Sum' }), { description });
    };
    deliveryFailures('reminder-delivery-failed', props.reminders.logGroup,
      'SMS failed|Email failed|Push failed|Delivery threw|confirmation failed',
      'A reminder could not be delivered on at least one channel. The log line names the parent and the channel.');
    deliveryFailures('api-delivery-failed', props.api.logGroup,
      'SMS failed|Email failed|Push failed|confirmation failed|Unhandled API error',
      'A confirmation or in-app message failed to send from the API.');
    for (const [i, fn] of props.authTriggers.entries()) {
      deliveryFailures(`signin-code-failed-${i + 1}`, fn.logGroup,
        'Failed to send sign-in code|Could not read login channel',
        'A sign-in code could not be sent. The parent is stuck at the login screen.');
    }

    /* ------------------------------------------ email that bounced */
    // A bounce means the address on file is wrong; a complaint means a parent
    // marked us as spam. Both are worth knowing the same day.
    this.sesConfigurationSet = new ses.ConfigurationSet(this, 'SesConfig', {
      configurationSetName: `bms-${stage}`,
      reputationMetrics: true,
    });
    this.sesConfigurationSet.addEventDestination('Problems', {
      destination: ses.EventDestination.snsTopic(this.topic),
      events: [
        ses.EmailSendingEvent.BOUNCE,
        ses.EmailSendingEvent.COMPLAINT,
        ses.EmailSendingEvent.REJECT,
        ses.EmailSendingEvent.RENDERING_FAILURE,
        ses.EmailSendingEvent.DELIVERY_DELAY,
      ],
    });

    /* ------------------------------------------ texts that were dropped */
    // SNS accepts a text and reports nothing if it cannot be delivered. With
    // delivery-status logging on, every failure lands in a known log group,
    // which we then alarm on. Configured account-wide via a custom resource,
    // as CloudFormation has no resource for it.
    const smsLogRole = new iam.Role(this, 'SmsDeliveryLogRole', {
      assumedBy: new iam.ServicePrincipal('sns.amazonaws.com'),
      inlinePolicies: {
        logs: new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents',
              'logs:PutMetricFilter', 'logs:PutRetentionPolicy'],
            resources: ['*'],
          })],
        }),
      },
    });
    const smsAttrs = new cr.AwsCustomResource(this, 'SmsDeliveryStatus', {
      installLatestAwsSdk: false,
      onUpdate: {
        service: 'SNS',
        action: 'setSMSAttributes',
        parameters: {
          attributes: {
            DeliveryStatusIAMRole: smsLogRole.roleArn,
            DeliveryStatusSuccessSamplingRate: '100',
            DefaultSMSType: 'Transactional',
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of('bms-sms-delivery-status'),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({ actions: ['sns:SetSMSAttributes'], resources: ['*'] }),
        new iam.PolicyStatement({ actions: ['iam:PassRole'], resources: [smsLogRole.roleArn] }),
      ]),
    });
    smsAttrs.node.addDependency(smsLogRole);

    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;
    const smsFailures = new logs.LogGroup(this, 'SmsFailureLogs', {
      logGroupName: `sns/${region}/${account}/DirectPublishToPhoneNumber/Failure`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const smsFail = new logs.MetricFilter(this, 'SmsFailureFilter', {
      logGroup: smsFailures,
      metricNamespace: 'SnackDays',
      metricName: 'sms-delivery-failed',
      filterPattern: logs.FilterPattern.allEvents(),
      metricValue: '1',
      defaultValue: 0,
    });
    alarm('sms-delivery-failed', smsFail.metric({ period: cdk.Duration.minutes(5), statistic: 'Sum' }), {
      description: 'A text message was accepted by AWS but not delivered. The log entry names the number and the carrier reason.',
    });

    /* ------------------------------------------ the bill */
    new budgets.CfnBudget(this, 'Budget', {
      budget: {
        budgetName: `bms-${stage}-monthly`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.budgetUsd, unit: 'USD' },
        costFilters: { TagKeyValue: ['user:Project$SnackDays'] },
      },
      notificationsWithSubscribers: [80, 100].map((pct) => ({
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold: pct,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }],
      })),
    });

    new cdk.CfnOutput(this, 'AlertsTopic', { value: this.topic.topicArn });
  }
}
