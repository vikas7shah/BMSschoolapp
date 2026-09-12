import { RemovalPolicy } from 'aws-cdk-lib';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

const S = ddb.AttributeType.STRING;

export interface TablesProps {
  /** Family data is retained on stack deletion unless explicitly opted out. */
  retainData: boolean;
}

/** Every table is on-demand, so an idle school costs nothing to keep online. */
export class Tables extends Construct {
  readonly users: ddb.Table;
  readonly children: ddb.Table;
  readonly guardianships: ddb.Table;
  readonly classrooms: ddb.Table;
  readonly slots: ddb.Table;
  readonly schools: ddb.Table;
  readonly notifications: ddb.Table;
  readonly push: ddb.Table;
  readonly dedupe: ddb.Table;
  readonly rateLimit: ddb.Table;
  readonly loginChannels: ddb.Table;

  constructor(scope: Construct, id: string, props: TablesProps) {
    super(scope, id);

    const durable = {
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: ddb.TableEncryption.AWS_MANAGED,
      removalPolicy: props.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    } as const;

    // Ephemeral tables hold only counters and idempotency markers.
    const ephemeral = {
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      encryption: ddb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    } as const;

    this.schools = new ddb.Table(this, 'Schools', {
      ...durable,
      partitionKey: { name: 'schoolId', type: S },
    });

    this.users = new ddb.Table(this, 'Users', {
      ...durable,
      partitionKey: { name: 'userId', type: S },
    });
    // Sign-in looks a parent up by the number they typed.
    this.users.addGlobalSecondaryIndex({
      indexName: 'byPhone',
      partitionKey: { name: 'phone', type: S },
    });
    this.users.addGlobalSecondaryIndex({
      indexName: 'bySchool',
      partitionKey: { name: 'schoolId', type: S },
      sortKey: { name: 'userId', type: S },
    });
    // Sparse: only parents who gave an email appear here. Lets them sign in
    // with an address as well as a number.
    this.users.addGlobalSecondaryIndex({
      indexName: 'byEmail',
      partitionKey: { name: 'email', type: S },
    });

    this.children = new ddb.Table(this, 'Children', {
      ...durable,
      partitionKey: { name: 'childId', type: S },
    });
    this.children.addGlobalSecondaryIndex({
      indexName: 'bySchool',
      partitionKey: { name: 'schoolId', type: S },
      sortKey: { name: 'childId', type: S },
    });

    // A child can have two guardians and a guardian several children.
    this.guardianships = new ddb.Table(this, 'Guardianships', {
      ...durable,
      partitionKey: { name: 'userId', type: S },
      sortKey: { name: 'childId', type: S },
    });
    this.guardianships.addGlobalSecondaryIndex({
      indexName: 'byChild',
      partitionKey: { name: 'childId', type: S },
      sortKey: { name: 'userId', type: S },
    });

    this.classrooms = new ddb.Table(this, 'Classrooms', {
      ...durable,
      partitionKey: { name: 'classroomId', type: S },
    });
    this.classrooms.addGlobalSecondaryIndex({
      indexName: 'bySchool',
      partitionKey: { name: 'schoolId', type: S },
      sortKey: { name: 'classroomId', type: S },
    });

    // The whiteboard itself: one item per classroom/date/slot type.
    this.slots = new ddb.Table(this, 'SnackSlots', {
      ...durable,
      partitionKey: { name: 'classroomId', type: S },
      sortKey: { name: 'sk', type: S }, // "YYYY-MM-DD#DRY"
    });
    // Reminder sweeps read the whole school for a date window.
    this.slots.addGlobalSecondaryIndex({
      indexName: 'bySchoolDate',
      partitionKey: { name: 'schoolId', type: S },
      sortKey: { name: 'date', type: S },
    });
    // Sparse: only claimed slots carry claimedByUserId, so this index is
    // exactly "the days this family has committed to".
    this.slots.addGlobalSecondaryIndex({
      indexName: 'byClaimant',
      partitionKey: { name: 'claimedByUserId', type: S },
      sortKey: { name: 'date', type: S },
    });

    this.notifications = new ddb.Table(this, 'Notifications', {
      ...durable,
      partitionKey: { name: 'userId', type: S },
      sortKey: { name: 'sk', type: S },
      timeToLiveAttribute: 'ttl',
    });

    this.push = new ddb.Table(this, 'PushSubscriptions', {
      ...durable,
      partitionKey: { name: 'userId', type: S },
      sortKey: { name: 'endpointId', type: S },
    });

    // Guarantees a parent is never sent the same reminder twice.
    this.dedupe = new ddb.Table(this, 'NotificationDedupe', {
      ...ephemeral,
      partitionKey: { name: 'dedupeKey', type: S },
    });

    this.rateLimit = new ddb.Table(this, 'RateLimits', {
      ...ephemeral,
      partitionKey: { name: 'rlKey', type: S },
    });

    // Carries "send this code by email, to this address" from the API to the
    // Cognito challenge trigger. Cognito only forwards ClientMetadata on
    // RespondToAuthChallenge, never on the InitiateAuth that creates the
    // challenge, so the intent has to travel out of band. Entries expire in
    // minutes.
    this.loginChannels = new ddb.Table(this, 'LoginChannels', {
      ...ephemeral,
      partitionKey: { name: 'username', type: S },
    });
  }

  /** Environment variables every backend function needs. */
  get env(): Record<string, string> {
    return {
      TABLE_USERS: this.users.tableName,
      TABLE_CHILDREN: this.children.tableName,
      TABLE_GUARDIANSHIPS: this.guardianships.tableName,
      TABLE_CLASSROOMS: this.classrooms.tableName,
      TABLE_SLOTS: this.slots.tableName,
      TABLE_SCHOOLS: this.schools.tableName,
      TABLE_NOTIFICATIONS: this.notifications.tableName,
      TABLE_PUSH: this.push.tableName,
      TABLE_DEDUPE: this.dedupe.tableName,
      TABLE_RATELIMIT: this.rateLimit.tableName,
      TABLE_LOGIN_CHANNEL: this.loginChannels.tableName,
    };
  }

  get all(): ddb.Table[] {
    return [
      this.users, this.children, this.guardianships, this.classrooms, this.slots,
      this.schools, this.notifications, this.push, this.dedupe, this.rateLimit,
      this.loginChannels,
    ];
  }
}
