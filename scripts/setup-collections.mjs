import dns from 'node:dns';
import fs from 'node:fs';
import { Client, Databases } from 'node-appwrite';

// Load .env.local: try dotenv first, fallback to native Node process.loadEnvFile / fs parser
function loadEnvFile(filePath = '.env.local') {
  if (typeof process.loadEnvFile === 'function') {
    try {
      if (fs.existsSync(filePath)) {
        process.loadEnvFile(filePath);
        return;
      }
    } catch {
      // Fallback to manual line parser below
    }
  }

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignore
  }
}

try {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
} catch {
  loadEnvFile('.env.local');
}

// Ensure IPv4 first on Node.js / Windows to prevent UND_ERR_CONNECT_TIMEOUT on dual-stack hosts
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore on older Node versions
}

// Environment Configuration
const ENDPOINT =
  process.env.APPWRITE_ENDPOINT ||
  process.env.APPWRITE_FUNCTION_ENDPOINT ||
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
  'https://fra.cloud.appwrite.io/v1';

const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_FUNCTION_PROJECT_ID ||
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ||
  '';

const API_KEY =
  process.env.APPWRITE_API_KEY ||
  process.argv[2] ||
  '';

const DATABASE_ID =
  process.env.APPWRITE_DATABASE_ID ||
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ||
  'campusvoice';

const DATABASE_NAME = 'campusvoice';

// Collection IDs with optional env overrides
const DEPARTMENTS_COLL_ID = process.env.COLLECTION_DEPARTMENTS || 'departments';
const PROFILES_COLL_ID = process.env.COLLECTION_PROFILES || 'profiles';
const COMPLAINTS_COLL_ID = process.env.COLLECTION_COMPLAINTS || 'complaints';
const SUPPORTS_COLL_ID = process.env.COLLECTION_SUPPORTS || 'complaint_supports';
const TIMELINE_COLL_ID = process.env.COLLECTION_TIMELINE || 'complaint_timeline';
const PHONE_CHANGE_COLL_ID = process.env.COLLECTION_PHONE_CHANGE_REQUESTS || 'phone_change_requests';
const WARNINGS_COLL_ID = process.env.COLLECTION_WARNINGS || 'complaint_warnings';
const AUDIT_LOGS_COLL_ID = process.env.COLLECTION_AUDIT_LOGS || 'audit_logs';

const summary = {
  collectionsCreated: 0,
  attributesAdded: 0,
  indexesCreated: 0,
  documentsSeeded: 0,
  errors: [],
};

if (!API_KEY) {
  console.error('❌ Error: APPWRITE_API_KEY is not set in .env.local or passed as an argument.');
  console.error('Please configure APPWRITE_API_KEY or run:');
  console.error('  node scripts/setup-collections.mjs <YOUR_API_KEY>\n');
  process.exit(1);
}

if (!PROJECT_ID) {
  console.error('❌ Error: APPWRITE_PROJECT_ID is not configured in .env.local.');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

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
        throw new Error(`Attribute '${key}' failed to create in collection '${collId}'`);
      }
    } catch (e) {
      if (!e.message?.includes('Attribute not found')) {
        throw e;
      }
    }
    await sleep(800);
    attempts++;
  }
  throw new Error(`Timeout waiting for attribute '${key}' in collection '${collId}' to become available`);
}

async function safeEnsureDatabase() {
  try {
    await withRetry(() => databases.get(DATABASE_ID));
    console.log(`ℹ️ database '${DATABASE_ID}' already exists, skipping`);
  } catch (err) {
    const isNotFound = err?.code === 404 || err?.message?.includes('not found') || err?.message?.includes('could not be found');
    if (isNotFound) {
      try {
        await withRetry(() => databases.create(DATABASE_ID, DATABASE_NAME, true));
        console.log(`✅ created: database '${DATABASE_ID}'`);
      } catch (createErr) {
        if (createErr?.code === 409 || createErr?.message?.includes('already exists')) {
          console.log(`ℹ️ database '${DATABASE_ID}' already exists, skipping`);
        } else {
          console.log(`❌ failed: database '${DATABASE_ID}' — ${createErr.message || String(createErr)}`);
          summary.errors.push(`Database ${DATABASE_ID}: ${createErr.message || String(createErr)}`);
        }
      }
    } else {
      console.log(`❌ failed: database check '${DATABASE_ID}' — ${err.message || String(err)}`);
      summary.errors.push(`Database check ${DATABASE_ID}: ${err.message || String(err)}`);
    }
  }
}

async function safeCreateCollection(id, name, permissions = []) {
  try {
    const existing = await withRetry(() => databases.getCollection(DATABASE_ID, id));
    if (existing) {
      console.log(`ℹ️ collection '${id}' already exists, skipping`);
      return { id, created: false };
    }
  } catch (err) {
    const isNotFound = err?.code === 404 || err?.message?.includes('not found') || err?.message?.includes('could not be found');
    if (!isNotFound) {
      console.log(`❌ failed: check collection '${id}' — ${err.message || String(err)}`);
      summary.errors.push(`Collection check ${id}: ${err.message || String(err)}`);
      return { id, created: false };
    }
  }

  try {
    await withRetry(() => databases.createCollection(DATABASE_ID, id, name, permissions, false, true));
    console.log(`✅ created: collection '${id}'`);
    summary.collectionsCreated++;
    return { id, created: true };
  } catch (err) {
    if (err?.code === 409 || err?.message?.includes('already exists')) {
      console.log(`ℹ️ collection '${id}' already exists, skipping`);
      return { id, created: false };
    }
    console.log(`❌ failed: create collection '${id}' — ${err.message || String(err)}`);
    summary.errors.push(`Collection create ${id}: ${err.message || String(err)}`);
    return { id, created: false };
  }
}

async function safeCreateStringAttribute(collId, key, size, required = false, defaultValue = null) {
  try {
    const existing = await withRetry(() => databases.getAttribute(DATABASE_ID, collId, key));
    if (existing) {
      console.log(`ℹ️ attribute '${key}' already exists, skipping`);
      return;
    }
  } catch {
    // Attribute not found, proceed to create
  }

  const def = required ? undefined : (defaultValue === null || defaultValue === undefined ? undefined : defaultValue);
  try {
    try {
      await withRetry(() =>
        databases.createStringAttribute(DATABASE_ID, collId, key, size, required, def)
      );
    } catch (createErr) {
      if (def !== undefined && createErr.message?.includes('default')) {
        await withRetry(() =>
          databases.createStringAttribute(DATABASE_ID, collId, key, size, required, undefined)
        );
      } else {
        throw createErr;
      }
    }
    await waitForAttribute(DATABASE_ID, collId, key);
    console.log(`✅ created: attribute '${key}' on '${collId}'`);
    summary.attributesAdded++;
  } catch (err) {
    if (err?.code === 409 || err?.message?.includes('already exists')) {
      console.log(`ℹ️ attribute '${key}' already exists, skipping`);
    } else {
      console.log(`❌ failed: attribute '${key}' on '${collId}' — ${err.message || String(err)}`);
      summary.errors.push(`Attribute ${collId}.${key}: ${err.message || String(err)}`);
    }
  }
}

async function safeCreateBooleanAttribute(collId, key, required = false, defaultValue = null) {
  try {
    const existing = await withRetry(() => databases.getAttribute(DATABASE_ID, collId, key));
    if (existing) {
      console.log(`ℹ️ attribute '${key}' already exists, skipping`);
      return;
    }
  } catch {
    // Attribute not found, proceed to create
  }

  const def = required ? undefined : (defaultValue === null || defaultValue === undefined ? undefined : defaultValue);
  try {
    try {
      await withRetry(() =>
        databases.createBooleanAttribute(DATABASE_ID, collId, key, required, def)
      );
    } catch (createErr) {
      if (def !== undefined && createErr.message?.includes('default')) {
        await withRetry(() =>
          databases.createBooleanAttribute(DATABASE_ID, collId, key, required, undefined)
        );
      } else {
        throw createErr;
      }
    }
    await waitForAttribute(DATABASE_ID, collId, key);
    console.log(`✅ created: attribute '${key}' on '${collId}'`);
    summary.attributesAdded++;
  } catch (err) {
    if (err?.code === 409 || err?.message?.includes('already exists')) {
      console.log(`ℹ️ attribute '${key}' already exists, skipping`);
    } else {
      console.log(`❌ failed: attribute '${key}' on '${collId}' — ${err.message || String(err)}`);
      summary.errors.push(`Attribute ${collId}.${key}: ${err.message || String(err)}`);
    }
  }
}

async function safeCreateIntegerAttribute(collId, key, required = false, min = null, max = null, defaultValue = null) {
  try {
    const existing = await withRetry(() => databases.getAttribute(DATABASE_ID, collId, key));
    if (existing) {
      console.log(`ℹ️ attribute '${key}' already exists, skipping`);
      return;
    }
  } catch {
    // Attribute not found, proceed to create
  }

  const minVal = min === null || min === undefined ? undefined : min;
  const maxVal = max === null || max === undefined ? undefined : max;
  const def = required ? undefined : (defaultValue === null || defaultValue === undefined ? undefined : defaultValue);
  try {
    try {
      await withRetry(() =>
        databases.createIntegerAttribute(DATABASE_ID, collId, key, required, minVal, maxVal, def)
      );
    } catch (createErr) {
      if (def !== undefined && createErr.message?.includes('default')) {
        await withRetry(() =>
          databases.createIntegerAttribute(DATABASE_ID, collId, key, required, minVal, maxVal, undefined)
        );
      } else {
        throw createErr;
      }
    }
    await waitForAttribute(DATABASE_ID, collId, key);
    console.log(`✅ created: attribute '${key}' on '${collId}'`);
    summary.attributesAdded++;
  } catch (err) {
    if (err?.code === 409 || err?.message?.includes('already exists')) {
      console.log(`ℹ️ attribute '${key}' already exists, skipping`);
    } else {
      console.log(`❌ failed: attribute '${key}' on '${collId}' — ${err.message || String(err)}`);
      summary.errors.push(`Attribute ${collId}.${key}: ${err.message || String(err)}`);
    }
  }
}

async function safeCreateIndex(collId, key, type, attributes, orders = ['ASC']) {
  try {
    const existing = await withRetry(() => databases.getIndex(DATABASE_ID, collId, key));
    if (existing) {
      console.log(`ℹ️ index '${key}' already exists, skipping`);
      return;
    }
  } catch {
    // Index not found, proceed to create
  }

  try {
    await withRetry(() => databases.createIndex(DATABASE_ID, collId, key, type, attributes, orders));
    console.log(`✅ created: index '${key}' on '${collId}'`);
    summary.indexesCreated++;
  } catch (err) {
    if (err?.code === 409 || err?.message?.includes('already exists')) {
      console.log(`ℹ️ index '${key}' already exists, skipping`);
    } else {
      console.log(`❌ failed: index '${key}' on '${collId}' — ${err.message || String(err)}`);
      summary.errors.push(`Index ${collId}.${key}: ${err.message || String(err)}`);
    }
  }
}

// ============================================================
// STEP 1 — Create Missing Collections
// ============================================================

async function resolveDepartmentAdminsCollectionId() {
  const customId = process.env.COLLECTION_DEPARTMENT_ADMINS;
  if (customId) {
    return customId;
  }

  // Check if 'department_admins' collection already exists
  try {
    await withRetry(() => databases.getCollection(DATABASE_ID, 'department_admins'));
    return 'department_admins';
  } catch {
    // Not found under 'department_admins'
  }

  // Check if known existing collection ID 'department_admins' exists
  try {
    await withRetry(() => databases.getCollection(DATABASE_ID, 'department_admins'));
    console.log(`ℹ️ Detected existing department_admins collection under ID 'department_admins'`);
    return 'department_admins';
  } catch {
    // Neither exists
  }

  return 'department_admins';
}

async function step1CreateMissingCollections() {
  console.log('\n============================================================');
  console.log('📌 STEP 1: Creating missing collections');
  console.log('============================================================');

  // 1. department_admins
  const daId = await resolveDepartmentAdminsCollectionId();
  await safeCreateCollection(daId, 'department_admins', []);
  await safeCreateStringAttribute(daId, 'user_id', 36, true);
  await safeCreateStringAttribute(daId, 'email', 255, true);
  await safeCreateStringAttribute(daId, 'department_id', 50, true);
  await safeCreateStringAttribute(daId, 'department_name', 100, true);
  await safeCreateBooleanAttribute(daId, 'is_active', true, true);
  await safeCreateStringAttribute(daId, 'academic_department_id', 50, false);
  await safeCreateStringAttribute(daId, 'maintenance_department_id', 50, false);
  await safeCreateStringAttribute(daId, 'assigned_by', 36, false);
  await safeCreateStringAttribute(daId, 'created_at', 64, true);
  await safeCreateStringAttribute(daId, 'revoked_at', 64, false);

  await safeCreateIndex(daId, 'idx_da_user_id', 'key', ['user_id'], ['ASC']);
  await safeCreateIndex(daId, 'idx_da_email', 'key', ['email'], ['ASC']);
  await safeCreateIndex(daId, 'idx_da_active', 'key', ['is_active'], ['ASC']);

  // 2. phone_change_requests
  await safeCreateCollection(PHONE_CHANGE_COLL_ID, 'phone_change_requests', []);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'student_user_id', 36, true);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'academic_department_id', 50, true);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'old_phone_number', 10, true);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'requested_phone_number', 10, false);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'reason', 500, false);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'status', 20, true);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'reviewed_by', 36, false);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'decision_reason', 500, false);
  await safeCreateBooleanAttribute(PHONE_CHANGE_COLL_ID, 'permission_consumed', true, false);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'requested_at', 64, true);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'reviewed_at', 64, false);
  await safeCreateStringAttribute(PHONE_CHANGE_COLL_ID, 'completed_at', 64, false);

  await safeCreateIndex(PHONE_CHANGE_COLL_ID, 'idx_pcr_student', 'key', ['student_user_id'], ['ASC']);
  await safeCreateIndex(PHONE_CHANGE_COLL_ID, 'idx_pcr_status', 'key', ['status'], ['ASC']);

  // 3. complaint_warnings
  await safeCreateCollection(WARNINGS_COLL_ID, 'complaint_warnings', []);
  await safeCreateStringAttribute(WARNINGS_COLL_ID, 'complaint_id', 36, true);
  await safeCreateStringAttribute(WARNINGS_COLL_ID, 'issued_by_principal_id', 36, true);
  await safeCreateStringAttribute(WARNINGS_COLL_ID, 'warning_reason', 1000, true);
  await safeCreateIntegerAttribute(WARNINGS_COLL_ID, 'days_delayed', true, 0);
  await safeCreateStringAttribute(WARNINGS_COLL_ID, 'admin_response', 2000, false);
  await safeCreateStringAttribute(WARNINGS_COLL_ID, 'responded_at', 64, false);
  await safeCreateStringAttribute(WARNINGS_COLL_ID, 'created_at', 64, true);

  await safeCreateIndex(WARNINGS_COLL_ID, 'idx_cw_complaint', 'key', ['complaint_id'], ['ASC']);
  await safeCreateIndex(WARNINGS_COLL_ID, 'idx_cw_created', 'key', ['created_at'], ['ASC']);

  // 4. audit_logs
  await safeCreateCollection(AUDIT_LOGS_COLL_ID, 'audit_logs', []);
  await safeCreateStringAttribute(AUDIT_LOGS_COLL_ID, 'action', 100, true);
  await safeCreateStringAttribute(AUDIT_LOGS_COLL_ID, 'actor_id', 36, true);
  await safeCreateStringAttribute(AUDIT_LOGS_COLL_ID, 'actor_role', 50, true);
  await safeCreateStringAttribute(AUDIT_LOGS_COLL_ID, 'target_id', 36, false);
  await safeCreateStringAttribute(AUDIT_LOGS_COLL_ID, 'target_type', 50, false);
  await safeCreateStringAttribute(AUDIT_LOGS_COLL_ID, 'metadata', 4000, false);
  await safeCreateStringAttribute(AUDIT_LOGS_COLL_ID, 'created_at', 64, true);

  await safeCreateIndex(AUDIT_LOGS_COLL_ID, 'idx_al_actor', 'key', ['actor_id'], ['ASC']);
  await safeCreateIndex(AUDIT_LOGS_COLL_ID, 'idx_al_target', 'key', ['target_id'], ['ASC']);
  await safeCreateIndex(AUDIT_LOGS_COLL_ID, 'idx_al_created', 'key', ['created_at'], ['ASC']);
}

// ============================================================
// STEP 2 — Verify Existing Collections & Attributes
// ============================================================

async function step2VerifyExistingCollections() {
  console.log('\n============================================================');
  console.log('📌 STEP 2: Verifying existing collections and attributes');
  console.log('============================================================');

  // Verify departments collection
  await safeCreateCollection(DEPARTMENTS_COLL_ID, 'departments', []);
  await safeCreateStringAttribute(DEPARTMENTS_COLL_ID, 'name', 100, true);
  await safeCreateBooleanAttribute(DEPARTMENTS_COLL_ID, 'is_academic', true);
  await safeCreateBooleanAttribute(DEPARTMENTS_COLL_ID, 'is_maintenance', true);
  await safeCreateBooleanAttribute(DEPARTMENTS_COLL_ID, 'is_active', true);

  // Verify profiles collection
  await safeCreateCollection(PROFILES_COLL_ID, 'profiles', []);
  await safeCreateStringAttribute(PROFILES_COLL_ID, 'user_id', 36, true);
  await safeCreateStringAttribute(PROFILES_COLL_ID, 'email', 255, true);
  await safeCreateStringAttribute(PROFILES_COLL_ID, 'name', 100, false);
  await safeCreateStringAttribute(PROFILES_COLL_ID, 'enrollment_no', 12, false);
  await safeCreateStringAttribute(PROFILES_COLL_ID, 'student_department_id', 50, false);
  await safeCreateStringAttribute(PROFILES_COLL_ID, 'phone_number', 10, false);
  await safeCreateBooleanAttribute(PROFILES_COLL_ID, 'phone_locked', false);
  await safeCreateBooleanAttribute(PROFILES_COLL_ID, 'name_locked', false);
  await safeCreateBooleanAttribute(PROFILES_COLL_ID, 'enrollment_locked', false);
  await safeCreateStringAttribute(PROFILES_COLL_ID, 'role', 50, false);
  await safeCreateBooleanAttribute(PROFILES_COLL_ID, 'is_locked', false);
  await safeCreateStringAttribute(PROFILES_COLL_ID, 'created_at', 64, false);
  await safeCreateStringAttribute(PROFILES_COLL_ID, 'updated_at', 64, false);

  // Verify complaints, complaint_supports, complaint_timeline exist
  await safeCreateCollection(COMPLAINTS_COLL_ID, 'complaints', []);
  await safeCreateCollection(SUPPORTS_COLL_ID, 'complaint_supports', []);
  await safeCreateCollection(TIMELINE_COLL_ID, 'complaint_timeline', []);
}

// ============================================================
// STEP 3 — Seed Departments Collection
// ============================================================

async function step3SeedDepartments() {
  console.log('\n============================================================');
  console.log('📌 STEP 3: Seeding canonical departments');
  console.log('============================================================');

  // Check if collection has a legacy 'code' attribute (e.g. from earlier schema)
  let hasCodeAttribute = false;
  try {
    const codeAttr = await withRetry(() => databases.getAttribute(DATABASE_ID, DEPARTMENTS_COLL_ID, 'code'));
    if (codeAttr) {
      hasCodeAttribute = true;
      if (codeAttr.required) {
        try {
          await withRetry(() => databases.updateStringAttribute(DATABASE_ID, DEPARTMENTS_COLL_ID, 'code', false, null));
          console.log(`ℹ️ Updated legacy attribute 'code' on '${DEPARTMENTS_COLL_ID}' to optional`);
        } catch {
          // If Appwrite rejects update, we provide dept.code in the payload anyway
        }
      }
    }
  } catch {
    // 'code' attribute does not exist on collection
  }

  const canonicalDepartments = [
    { $id: 'dept_civil', name: 'Civil', code: '06', is_academic: true, is_maintenance: true, is_active: true },
    { $id: 'dept_comp', name: 'Computer', code: '07', is_academic: true, is_maintenance: true, is_active: true },
    { $id: 'dept_elec', name: 'Electrical', code: '09', is_academic: true, is_maintenance: true, is_active: true },
    { $id: 'dept_mech', name: 'Mechanical', code: '19', is_academic: true, is_maintenance: true, is_active: true },
    { $id: 'dept_water', name: 'Water', code: 'water', is_academic: false, is_maintenance: true, is_active: true },
    { $id: 'dept_sanit', name: 'Sanitation', code: 'sanit', is_academic: false, is_maintenance: true, is_active: true },
  ];

  for (const dept of canonicalDepartments) {
    try {
      await withRetry(() => databases.getDocument(DATABASE_ID, DEPARTMENTS_COLL_ID, dept.$id));
      console.log(`ℹ️ document '${dept.$id}' already exists, skipping`);
    } catch (err) {
      const isNotFound = err?.code === 404 || err?.message?.includes('not found') || err?.message?.includes('could not be found');
      if (isNotFound) {
        try {
          const docPayload = {
            name: dept.name,
            is_academic: dept.is_academic,
            is_maintenance: dept.is_maintenance,
            is_active: dept.is_active,
          };
          if (hasCodeAttribute && dept.code) {
            docPayload.code = dept.code;
          }

          await withRetry(() =>
            databases.createDocument(
              DATABASE_ID,
              DEPARTMENTS_COLL_ID,
              dept.$id,
              docPayload,
              []
            )
          );
          console.log(`✅ created: document '${dept.$id}' (${dept.name})`);
          summary.documentsSeeded++;
        } catch (createErr) {
          if (createErr?.code === 409 || createErr?.message?.includes('already exists')) {
            console.log(`ℹ️ document '${dept.$id}' already exists, skipping`);
          } else {
            console.log(`❌ failed: document '${dept.$id}' — ${createErr.message || String(createErr)}`);
            summary.errors.push(`Document ${DEPARTMENTS_COLL_ID}.${dept.$id}: ${createErr.message || String(createErr)}`);
          }
        }
      } else {
        console.log(`❌ failed: check document '${dept.$id}' — ${err.message || String(err)}`);
        summary.errors.push(`Document check ${DEPARTMENTS_COLL_ID}.${dept.$id}: ${err.message || String(err)}`);
      }
    }
  }
}

// ============================================================
// Main Execution
// ============================================================

async function main() {
  console.log('============================================================');
  console.log('🏛️  CampusVoice — Database & Collection Setup');
  console.log('============================================================');
  console.log(`Endpoint:    ${ENDPOINT}`);
  console.log(`Project ID:  ${PROJECT_ID}`);
  console.log(`Database ID: ${DATABASE_ID}`);
  console.log('============================================================');

  try {
    await safeEnsureDatabase();
    await step1CreateMissingCollections();
    await step2VerifyExistingCollections();
    await step3SeedDepartments();

    console.log('\n========================================');
    console.log('📊 Setup Summary');
    console.log('========================================');
    console.log(`Collections created: ${summary.collectionsCreated}`);
    console.log(`Attributes added:    ${summary.attributesAdded}`);
    console.log(`Documents seeded:    ${summary.documentsSeeded}`);
    console.log(`Errors:              ${summary.errors.length}`);
    if (summary.errors.length > 0) {
      console.log('\nList of Errors:');
      summary.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    }
    console.log('========================================\n');
  } catch (error) {
    console.error('\n❌ Unexpected fatal setup error:', error);
    process.exit(1);
  }
}

main();
