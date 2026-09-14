import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwInt from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { Tables } from './tables';
import { Monitoring } from './monitoring';

const ROOT = path.join(__dirname, '..', '..');

export interface BmsStackProps extends cdk.StackProps {
  stage: string;
  schoolName: string;
  timezone: string;
  reminderHour: number;
  fromEmail?: string;
  /** Where a parent's reply lands. Sending is from a send-only subdomain. */
  replyTo?: string;
  smsSenderId?: string;
  smsEnabled: boolean;
  alertEmail: string;
  budgetUsd: number;
  retainData: boolean;
  /**
   * A fixed test code that signs in as a stand-alone "Test Admin" account, for
   * building and checking the app without a real parent's mailbox. The code is
   * kept in Secrets Manager, never in the repository; every use raises an
   * alert. Set false and deploy to remove the route and the secret together.
   */
  devLogin: boolean;
}

export class BmsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BmsStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const tables = new Tables(this, 'Tables', { retainData: props.retainData });

    /* ------------------------------------------------------------ secrets */

    const sessionSecret = new secrets.Secret(this, 'SessionSecret', {
      description: 'HMAC key for BMS session cookies',
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
      removalPolicy: props.retainData ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const vapidSecret = new secrets.Secret(this, 'VapidSecret', {
      description: 'Web push VAPID key pair',
      secretStringValue: cdk.SecretValue.unsafePlainText('{}'), // filled in below
      removalPolicy: props.retainData ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const devLoginSecret = props.devLogin ? new secrets.Secret(this, 'DevLoginSecret', {
      secretName: `bms-${stage}-dev-login`,
      description: 'Fixed code for the Test Admin sign-in. Removed by setting devLogin false.',
      generateSecretString: {
        passwordLength: 8, excludePunctuation: true, excludeLowercase: true, excludeUppercase: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    }) : undefined;

    /* ------------------------------------- the app URL, published for later */

    const appUrlParamName = `/bms/${stage}/appUrl`;

    /* ---------------------------------------------- shared lambda settings */

    // Explicit log groups (rather than the deprecated logRetention prop) keep
    // retention set without deploying a helper Lambda per function.
    const logGroupFor = (name: string) => new logs.LogGroup(this, `${name}Logs`, {
      logGroupName: `/aws/lambda/bms-${stage}-${name}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const commonBundling = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64, // cheaper and faster than x86
      bundling: { minify: true, sourceMap: true, target: 'node22' },
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        STAGE: stage,
      },
    };

    const backendEnv: Record<string, string> = {
      ...tables.env,
      SESSION_SECRET_ARN: sessionSecret.secretArn,
      VAPID_SECRET_ARN: vapidSecret.secretArn,
      APP_URL_PARAM: appUrlParamName,
      SCHOOL_ID: 'school',
      SCHOOL_NAME: props.schoolName,
      FROM_EMAIL: props.fromEmail ?? '',
      REPLY_TO: props.replyTo ?? '',
      SMS_SENDER_ID: props.smsSenderId ?? '',
      SMS_ENABLED: props.smsEnabled ? 'true' : 'false',
    };

    /* ------------------------------------------------- cognito (SMS codes) */

    const defineChallenge = new NodejsFunction(this, 'DefineAuthChallenge', {
      ...commonBundling,
      entry: path.join(ROOT, 'services/auth-triggers/src/define.ts'),
      timeout: cdk.Duration.seconds(10),
      logGroup: logGroupFor('define-auth'),
    });

    const createChallenge = new NodejsFunction(this, 'CreateAuthChallenge', {
      ...commonBundling,
      entry: path.join(ROOT, 'services/auth-triggers/src/create.ts'),
      timeout: cdk.Duration.seconds(15),
      logGroup: logGroupFor('create-auth'),
      environment: {
        ...commonBundling.environment,
        SCHOOL_NAME: props.schoolName,
        SMS_SENDER_ID: props.smsSenderId ?? '',
        FROM_EMAIL: props.fromEmail ?? '',
        REPLY_TO: props.replyTo ?? '',
        SES_CONFIG_SET: `bms-${stage}`,
        TABLE_LOGIN_CHANNEL: tables.loginChannels.tableName,
      },
    });
    tables.loginChannels.grantReadData(createChallenge);
    // Sign-in codes go out by text or by email, whichever the parent used.
    createChallenge.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: ['*'],
    }));
    // Publishing straight to a phone number has no topic ARN to scope to, and
    // the sns:Protocol condition key does not apply to it — adding one silently
    // grants nothing, which is why this must be an unconditioned "*".
    createChallenge.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sns:Publish'],
      resources: ['*'],
    }));
    createChallenge.addToRolePolicy(new iam.PolicyStatement({
      actions: ['sns:SetSMSAttributes', 'sns:GetSMSAttributes'],
      resources: ['*'],
    }));

    const verifyChallenge = new NodejsFunction(this, 'VerifyAuthChallenge', {
      ...commonBundling,
      entry: path.join(ROOT, 'services/auth-triggers/src/verify.ts'),
      timeout: cdk.Duration.seconds(10),
      logGroup: logGroupFor('verify-auth'),
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `bms-${stage}`,
      selfSignUpEnabled: false, // parents are invited by the school, never self-serve
      signInCaseSensitive: false,
      // NOTE: a user pool's attribute schema is immutable after creation —
      // Cognito rejects any change with "Invalid AttributeDataType". This must
      // stay exactly as it was first deployed.
      standardAttributes: { phoneNumber: { required: true, mutable: true } },
      customAttributes: { userId: new cognito.StringAttribute({ mutable: true }) },
      accountRecovery: cognito.AccountRecovery.NONE,
      lambdaTriggers: {
        defineAuthChallenge: defineChallenge,
        createAuthChallenge: createChallenge,
        verifyAuthChallengeResponse: verifyChallenge,
      },
      removalPolicy: props.retainData ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('ApiClient', {
      authFlows: { custom: true },
      generateSecret: false, // only ever called from our own Lambda
      preventUserExistenceErrors: true,
      // Must match the "expires in 5 minutes" wording in the sign-in text.
      authSessionValidity: cdk.Duration.minutes(5),
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    /* ---------------------------------------------------------- api lambda */

    const apiFn = new NodejsFunction(this, 'ApiFunction', {
      ...commonBundling,
      entry: path.join(ROOT, 'services/api/src/index.ts'),
      // Headroom for a roster import, which creates a Cognito user per family.
      timeout: cdk.Duration.seconds(45),
      memorySize: 512,
      logGroup: logGroupFor('api'),
      environment: {
        ...commonBundling.environment,
        ...backendEnv,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        ...(devLoginSecret ? { DEV_LOGIN_SECRET_ARN: devLoginSecret.secretArn } : {}),
      },
    });
    devLoginSecret?.grantRead(apiFn);

    /* ----------------------------------------------------- reminders lambda */

    const remindersFn = new NodejsFunction(this, 'RemindersFunction', {
      ...commonBundling,
      entry: path.join(ROOT, 'services/reminders/src/index.ts'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      logGroup: logGroupFor('reminders'),
      environment: {
        ...commonBundling.environment,
        ...backendEnv,
        // The reminder job never touches Cognito, but shares the env module.
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    // The office's "remind now" runs the reminder job on demand from the API.
    remindersFn.grantInvoke(apiFn);
    apiFn.addEnvironment('REMINDERS_FUNCTION', remindersFn.functionName);

    for (const fn of [apiFn, remindersFn]) {
      for (const table of tables.all) table.grantReadWriteData(fn);
      sessionSecret.grantRead(fn);
      vapidSecret.grantRead(fn);
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [cdk.Arn.format(
          { service: 'ssm', resource: 'parameter', resourceName: appUrlParamName.slice(1) },
          this,
        )],
      }));
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['sns:Publish'],
        resources: ['*'],
      }));
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: ['*'],
      }));
    }

    // Only the API manages the roster.
    apiFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser', 'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminGetUser',
      ],
      resources: [userPool.userPoolArn],
    }));

    /* -------------------------------------------------- hourly reminder run */

    // Runs every hour; the function itself checks the school's local clock, so
    // changing the send time in the app needs no redeploy.
    new events.Rule(this, 'ReminderSchedule', {
      description: 'Hourly check for snack reminders due in the school timezone',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [new targets.LambdaFunction(remindersFn, {
        event: events.RuleTargetInput.fromObject({ source: 'schedule' }),
      })],
    });

    /* ------------------------------------------------------------- http api */

    const httpApi = new apigw.HttpApi(this, 'HttpApi', {
      apiName: `bms-${stage}`,
      createDefaultStage: true,
      defaultIntegration: new apigwInt.HttpLambdaIntegration('ApiIntegration', apiFn),
    });

    /* -------------------------------------------------- static site + cdn */

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // static assets are rebuilt from source
    });

    // Static export writes /snacks/index.html; map pretty URLs onto those files.
    //
    // Unknown pages are resolved to 404.html *here* rather than through the
    // distribution's custom error responses, because those apply to every
    // behaviour — including /api/* — and would replace the API's own JSON 403
    // and 404 bodies with an HTML page the client cannot parse.
    const rewriteFn = new cloudfront.Function(this, 'RewriteFunction', {
      code: cloudfront.FunctionCode.fromInline(`
var ROUTES = ['/', '/login/', '/snacks/', '/me/', '/admin/', '/what-to-bring/', '/calendar/'];

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.indexOf('/_next/') === 0) return request;

  var last = uri.split('/').pop();
  if (last.indexOf('.') !== -1) return request; // a real file

  if (uri.charAt(uri.length - 1) !== '/') uri = uri + '/';

  if (ROUTES.indexOf(uri) === -1) {
    request.uri = '/404.html';
    return request;
  }

  request.uri = uri + 'index.html';
  return request;
}`),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      customHeadersBehavior: {
        customHeaders: [
          // Pages, the service worker, the manifest: always revalidate, so a
          // parent's phone picks up a new deploy on its next open. ETags make
          // the check a cheap 304 when nothing changed.
          { header: 'Cache-Control', value: 'no-cache', override: true },
        ],
      },
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "connect-src 'self'",
            "font-src 'self' data:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
        },
        strictTransportSecurity: {
          override: true,
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { override: true, frameOption: cloudfront.HeadersFrameOption.DENY },
        referrerPolicy: {
          override: true,
          referrerPolicy: cloudfront.HeadersReferrerPolicy.SAME_ORIGIN,
        },
      },
    });

    // Browser caching is set here rather than on the S3 objects, so the two
    // kinds of file get the right rule without two deployments fighting over
    // pruning. CloudFront's own cache is separate and is invalidated on deploy.
    const assetHeaders = new cloudfront.ResponseHeadersPolicy(this, 'AssetHeaders', {
      customHeadersBehavior: {
        customHeaders: [
          // Next.js puts a content hash in every asset filename, so a file at
          // a given URL never changes and can be cached indefinitely.
          { header: 'Cache-Control', value: 'public, max-age=31536000, immutable', override: true },
        ],
      },
    });

    const siteOrigin = origins.S3BucketOrigin.withOriginAccessControl(siteBucket);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `BMS ${stage}`,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: siteOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [{
          function: rewriteFn,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
      },
      additionalBehaviors: {
        '/_next/static/*': {
          origin: siteOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: assetHeaders,
        },
        // Same origin as the site, so the session cookie is first-party.
        '/api/*': {
          origin: new origins.HttpOrigin(
            cdk.Fn.select(2, cdk.Fn.split('/', httpApi.apiEndpoint)),
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    new s3deploy.BucketDeployment(this, 'SiteDeployment', {
      sources: [s3deploy.Source.asset(path.join(ROOT, 'apps/web/out'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    /* --------------------------------------- publish the URL for the lambdas */

    new ssm.StringParameter(this, 'AppUrlParameter', {
      parameterName: appUrlParamName,
      stringValue: `https://${distribution.distributionDomainName}`,
      description: 'Public URL of the BMS app, read at runtime by the backend',
    });

    /* --------------------------------------------- one-time VAPID key setup */

    const vapidFn = new NodejsFunction(this, 'VapidBootstrap', {
      ...commonBundling,
      entry: path.join(ROOT, 'infra/lambda/vapid-bootstrap.ts'),
      timeout: cdk.Duration.seconds(30),
      logGroup: logGroupFor('vapid-bootstrap'),
    });
    vapidSecret.grantRead(vapidFn);
    vapidSecret.grantWrite(vapidFn);

    const vapidProvider = new cr.Provider(this, 'VapidProvider', { onEventHandler: vapidFn });
    new cdk.CustomResource(this, 'VapidKeys', {
      serviceToken: vapidProvider.serviceToken,
      properties: { SecretArn: vapidSecret.secretArn },
    });

    /* ------------------------------------------------------ email identity */

    // Deliberately not managed here. An SES identity is account-scoped and
    // frequently already verified for other uses, so a stack that owned it
    // would fail to deploy against an existing one — and would un-verify it on
    // teardown. Use `npm run verify-sender` instead.

    /* ---------------------------------------------------------- monitoring */

    new Monitoring(this, 'Monitoring', {
      stage,
      alertEmail: props.alertEmail,
      budgetUsd: props.budgetUsd,
      api: apiFn,
      reminders: remindersFn,
      authTriggers: [defineChallenge, createChallenge, verifyChallenge],
      httpApi,
    });

    /* ------------------------------------------------------------- outputs */

    new cdk.CfnOutput(this, 'AppUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Open this to use the app',
    });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    // The setup scripts read this function's environment to find every table
    // name, so the stack only needs to publish one handle.
    new cdk.CfnOutput(this, 'ApiFunctionName', { value: apiFn.functionName });
    new cdk.CfnOutput(this, 'SchoolsTable', { value: tables.schools.tableName });
    new cdk.CfnOutput(this, 'UsersTable', { value: tables.users.tableName });
    new cdk.CfnOutput(this, 'ClassroomsTable', { value: tables.classrooms.tableName });
    new cdk.CfnOutput(this, 'RemindersFunctionName', { value: remindersFn.functionName });
    new cdk.CfnOutput(this, 'CreateAuthChallengeLogGroup', {
      // The function writes to the explicit log group created above, not to the
      // /aws/lambda/<functionName> default.
      value: createChallenge.logGroup.logGroupName,
      description: 'Sign-in codes appear here while SNS is in sandbox mode',
    });
  }
}
