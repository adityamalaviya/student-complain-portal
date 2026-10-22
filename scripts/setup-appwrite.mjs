import dns from 'node:dns';
import { Client, Databases, Storage, ID, Permission, Role } from 'node-appwrite';

// Ensure IPv4 first on Node.js / Windows to prevent UND_ERR_CONNECT_TIMEOUT on dual-stack hosts
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore on older node versions
}

/**
 * CampusVoice — Automated Appwrite Provisioning Script
 * 
 * Provisions:
 * 1. Database: campusvoice
 * 2. Collections:
 *    - departments (with seed data: 06 Civil, 07 Computer)
 *    - profiles (with strict index & field schema)
 *    - complaints (with status, priority, and indexes)
 *    - complaint_supports (for community support tracking)
 * 3. Storage Bucket: complaint-attachments (10MB limit, image & pdf support)
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6ad8e59a00154ed97543';
const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'campusvoice';
const DATABASE_NAME = 'CampusVoice';

// Read API key from env or command line argument
const API_KEY = process.env.APPWRITE_API_KEY || process.argv[2] || '';

if (!API_KEY) {
  console.error('\x1b[31m[Error] Appwrite API Key is required.\x1b[0m');
  console.log('\nPlease run:');
  console.log('  node scripts/setup-appwrite.mjs <YOUR_SECRET_API_KEY>');
  console.log('OR:');
  console.log('  $env:APPWRITE_API_KEY="<YOUR_SECRET_API_KEY>"; node scripts/setup-appwrite.mjs');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);
const storage = new Storage(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, retries = 5, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const errMsg = err?.message || String(err);
      const isTransient =
        err?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        errMsg.includes('fetch failed') ||
        errMsg.includes('Connect Timeout') ||
        errMsg.includes('ECONNRESET');

      if (isTransient && attempt < retries) {
        console.log(`    ⏳ Network timeout, retrying in ${delay / 1000}s (attempt ${attempt}/${retries})...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

async function waitForAttribute(dbId, collId, key) {
  let attempts = 0;
  while (attempts < 60) {
    try {
      const attr = await withRetry(() => databases.getAttribute(dbId, collId, key));
      if (attr.status === 'available') {
        return;
      }
      if (attr.status === 'failed') {
        throw new Error(`Attribute ${key} failed to create in collection ${collId}`);
      }
    } catch (e) {
      if (!e.message?.includes('Attribute not found')) {
        throw e;
      }
    }
    await sleep(800);
    attempts++;
  }
  throw new Error(`Timeout waiting for attribute ${key} to become available`);
}

async function safeCreateDatabase() {
  console.log(`\n📦 Checking database '${DATABASE_ID}'...`);
  try {
    await withRetry(() => databases.get(DATABASE_ID));
    console.log(`  ✓ Database '${DATABASE_ID}' already exists.`);
  } catch {
    console.log(`  → Creating database '${DATABASE_ID}'...`);
    await withRetry(() => databases.create(DATABASE_ID, DATABASE_NAME, true));
    console.log(`  ✓ Database '${DATABASE_ID}' created.`);
  }
}

async function safeCreateCollection(id, name, permissions = []) {
  console.log(`\n📂 Checking collection '${id}' (${name})...`);
  try {
    await withRetry(() => databases.getCollection(DATABASE_ID, id));
    console.log(`  ✓ Collection '${id}' already exists.`);
  } catch {
    console.log(`  → Creating collection '${id}'...`);
    await withRetry(() => databases.createCollection(DATABASE_ID, id, name, permissions, false, true));
    console.log(`  ✓ Collection '${id}' created.`);
  }
}

async function safeCreateStringAttribute(collId, key, size, required = false, defaultValue = null) {
  try {
    await withRetry(() => databases.getAttribute(DATABASE_ID, collId, key));
    console.log(`    • Attribute '${key}' exists.`);
  } catch {
    console.log(`    + Creating string attribute '${key}' (size: ${size}, required: ${required})...`);
    // Appwrite rule: Cannot set default value for required attribute
    const def = required ? undefined : (defaultValue === null ? undefined : defaultValue);
    await withRetry(() =>
      databases.createStringAttribute(
        DATABASE_ID,
        collId,
        key,
        size,
        required,
        def
      )
    );
    await waitForAttribute(DATABASE_ID, collId, key);
    console.log(`    ✓ Attribute '${key}' available.`);
  }
}

async function safeCreateBooleanAttribute(collId, key, required = false, defaultValue = null) {
  try {
    await withRetry(() => databases.getAttribute(DATABASE_ID, collId, key));
    console.log(`    • Attribute '${key}' exists.`);
  } catch {
    console.log(`    + Creating boolean attribute '${key}' (required: ${required})...`);
    // Appwrite rule: Cannot set default value for required attribute
    const def = required ? undefined : (defaultValue === null ? undefined : defaultValue);
    await withRetry(() =>
      databases.createBooleanAttribute(
        DATABASE_ID,
        collId,
        key,
        required,
        def
      )
    );
    await waitForAttribute(DATABASE_ID, collId, key);
    console.log(`    ✓ Attribute '${key}' available.`);
  }
}

async function safeCreateIntegerAttribute(collId, key, required = false, min = 0, max = null, defaultValue = null) {
  try {
    await withRetry(() => databases.getAttribute(DATABASE_ID, collId, key));
    console.log(`    • Attribute '${key}' exists.`);
  } catch {
    console.log(`    + Creating integer attribute '${key}' (required: ${required})...`);
    // Appwrite rule: Cannot set default value for required attribute
    const def = required ? undefined : (defaultValue === null ? undefined : defaultValue);
    await withRetry(() =>
      databases.createIntegerAttribute(
        DATABASE_ID,
        collId,
        key,
        required,
        min,
        max === null ? undefined : max,
        def
      )
    );
    await waitForAttribute(DATABASE_ID, collId, key);
    console.log(`    ✓ Attribute '${key}' available.`);
  }
}

async function safeCreateIndex(collId, key, type, attributes, orders = ['ASC']) {
  try {
    await withRetry(() => databases.getIndex(DATABASE_ID, collId, key));
    console.log(`    • Index '${key}' exists.`);
  } catch {
    console.log(`    + Creating index '${key}' (${type} on [${attributes.join(', ')}])...`);
    try {
      await withRetry(() => databases.createIndex(DATABASE_ID, collId, key, type, attributes, orders));
      console.log(`    ✓ Index '${key}' created.`);
    } catch (err) {
      console.warn(`    ! Notice for index '${key}': ${err.message}`);
    }
  }
}

async function provisionDepartments() {
  await safeCreateCollection('departments', 'Departments', []);
  await safeCreateStringAttribute('departments', 'code', 10, true);
  await safeCreateStringAttribute('departments', 'name', 100, true);
  await safeCreateBooleanAttribute('departments', 'is_active', false, true);
  await safeCreateIndex('departments', 'idx_code', 'unique', ['code']);

  // Seed Initial Departments
  console.log(`  🌱 Seeding departments...`);
  const initialDepts = [
    { code: '06', name: 'Civil Department', is_active: true },
    { code: '07', name: 'Computer Department', is_active: true },
  ];

  for (const dept of initialDepts) {
    try {
      await withRetry(() => databases.getDocument(DATABASE_ID, 'departments', dept.code));
      console.log(`    • Department '${dept.code}' (${dept.name}) exists.`);
    } catch {
      await withRetry(() => databases.createDocument(DATABASE_ID, 'departments', dept.code, dept, []));
      console.log(`    ✓ Seeded department '${dept.code}' (${dept.name})`);
    }
  }
}

async function provisionProfiles() {
  await safeCreateCollection('profiles', 'User Profiles', []);
  await safeCreateStringAttribute('profiles', 'user_id', 255, true);
  await safeCreateStringAttribute('profiles', 'auth_user_id', 255, false);
  await safeCreateStringAttribute('profiles', 'email', 255, false);
  await safeCreateStringAttribute('profiles', 'name', 255, false);
  await safeCreateStringAttribute('profiles', 'display_name', 255, false);
  await safeCreateStringAttribute('profiles', 'enrollment_no', 32, false);
  await safeCreateStringAttribute('profiles', 'department_code', 10, false);
  await safeCreateStringAttribute('profiles', 'department_name', 100, false);
  await safeCreateStringAttribute('profiles', 'role', 32, false, 'student');
  await safeCreateBooleanAttribute('profiles', 'is_locked', false, false);
  await safeCreateStringAttribute('profiles', 'profile_status', 32, false, 'incomplete');
  await safeCreateStringAttribute('profiles', 'created_at', 64, false);
  await safeCreateStringAttribute('profiles', 'updated_at', 64, false);

  await safeCreateIndex('profiles', 'idx_user_id', 'key', ['user_id']);
  await safeCreateIndex('profiles', 'idx_enrollment_no', 'key', ['enrollment_no']);
  await safeCreateIndex('profiles', 'idx_dept_code', 'key', ['department_code']);
}

async function provisionComplaints() {
  await safeCreateCollection('complaints', 'Complaints', []);
  await safeCreateStringAttribute('complaints', 'student_user_id', 255, true);
  await safeCreateStringAttribute('complaints', 'student_name', 255, true);
  await safeCreateStringAttribute('complaints', 'student_enrollment_no', 32, true);
  await safeCreateStringAttribute('complaints', 'department_code', 10, true);
  await safeCreateStringAttribute('complaints', 'department_name', 100, true);
  await safeCreateStringAttribute('complaints', 'title', 255, true);
  await safeCreateStringAttribute('complaints', 'location', 255, true);
  await safeCreateStringAttribute('complaints', 'description', 5000, true);
  await safeCreateStringAttribute('complaints', 'priority', 32, false, 'medium');
  await safeCreateStringAttribute('complaints', 'issue_type', 32, false, 'department');
  await safeCreateStringAttribute('complaints', 'status', 32, false, 'open');
  await safeCreateStringAttribute('complaints', 'official_response', 5000, false);
  await safeCreateStringAttribute('complaints', 'resolved_at', 64, false);
  await safeCreateIntegerAttribute('complaints', 'support_count', false, 0, null, 0);
  await safeCreateStringAttribute('complaints', 'attachment_file_id', 255, false);
  await safeCreateStringAttribute('complaints', 'created_at', 64, false);
  await safeCreateStringAttribute('complaints', 'updated_at', 64, false);

  await safeCreateIndex('complaints', 'idx_student_user_id', 'key', ['student_user_id']);
  await safeCreateIndex('complaints', 'idx_department_code', 'key', ['department_code']);
  await safeCreateIndex('complaints', 'idx_issue_type', 'key', ['issue_type']);
  await safeCreateIndex('complaints', 'idx_status', 'key', ['status']);
}

async function provisionSupports() {
  await safeCreateCollection('complaint_supports', 'Complaint Supports', []);
  await safeCreateStringAttribute('complaint_supports', 'complaint_id', 255, true);
  await safeCreateStringAttribute('complaint_supports', 'user_id', 255, true);
  await safeCreateStringAttribute('complaint_supports', 'supported_at', 64, true);

  await safeCreateIndex('complaint_supports', 'idx_support_complaint', 'key', ['complaint_id']);
  await safeCreateIndex('complaint_supports', 'idx_support_user', 'key', ['user_id']);
}

async function provisionStorageBucket() {
  const bucketId = 'complaint-attachments';
  console.log(`\n📁 Checking storage bucket '${bucketId}'...`);
  try {
    await withRetry(() => storage.getBucket(bucketId));
    console.log(`  ✓ Bucket '${bucketId}' already exists.`);
  } catch {
    console.log(`  → Creating bucket '${bucketId}'...`);
    try {
      await withRetry(() =>
        storage.createBucket(
          bucketId,
          'Complaint Attachments',
          [],
          false,
          true,
          10485760,
          ['jpg', 'jpeg', 'png', 'pdf', 'webp']
        )
      );
      console.log(`  ✓ Bucket '${bucketId}' created.`);
    } catch (err) {
      console.warn(`  ! Notice for bucket creation: ${err.message}`);
    }
  }
}

async function main() {
  console.log('====================================================');
  console.log('🏛️  CampusVoice — Appwrite Provisioning Script');
  console.log('====================================================');
  console.log(`Endpoint:    ${ENDPOINT}`);
  console.log(`Project ID:  ${PROJECT_ID}`);
  console.log(`Database:    ${DATABASE_ID}`);
  console.log('====================================================');

  try {
    await safeCreateDatabase();
    await provisionDepartments();
    await provisionProfiles();
    await provisionComplaints();
    await provisionSupports();
    await provisionStorageBucket();

    console.log('\n====================================================');
    console.log('\x1b[32m✨ All Appwrite collections & bucket provisioned successfully!\x1b[0m');
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n\x1b[31m❌ Provisioning failed:\x1b[0m', error);
    process.exit(1);
  }
}

main();
