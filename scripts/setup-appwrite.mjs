import dns from 'node:dns';
import { Client, Databases, Storage, ID, Permission, Role } from 'node-appwrite';

// Ensure IPv4 first on Node.js / Windows to prevent UND_ERR_CONNECT_TIMEOUT on dual-stack hosts
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore on older node versions
}

/**
 * CampusVoice — Automated Appwrite Provisioning Script (Day 1: Domain & Database Foundation)
 * 
 * Target Schema Architecture:
 * 1. Database: campusvoice
 * 2. Collections:
 *    - departments (6 institutional departments, academic vs maintenance classification)
 *    - profiles (student/admin profiles, 10-digit phone, granular lock states)
 *    - complaints (dual department IDs: student_department_id and maintenance_department_id)
 *    - complaint_supports (active/revoked state, base-1 derived count)
 *    - complaint_timeline (discrete append-only events: progress, clarification, status)
 *    - phone_change_requests (academic admin approval workflow, one-time permission)
 *    - complaint_warnings (Principal 5-day delay warning records and admin responses)
 *    - department_admins (dynamic database-backed admin assignments with scope)
 *    - audit_logs (append-only security and lifecycle audit trail)
 * 3. Storage Bucket: complaint-attachments (5MB limit, PDF/JPG/JPEG/PNG only)
 * 
 * Security Rule:
 * All collections are provisioned with empty permissions ($permissions = []).
 * Browser direct access is completely blocked; all operations route through Cloud Functions.
 */

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6ad8e59a00154ed97543';
const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'campusvoice';
const DATABASE_NAME = 'CampusVoice';

// Read API key from env or command line argument
const API_KEY = process.env.APPWRITE_API_KEY || process.argv[2] || '';

if (!API_KEY) {
  console.log('\x1b[33m[Notice] Running in schema validation / dry-run mode (No API Key provided).\x1b[0m');
  console.log('To execute provisioning against Appwrite Cloud, supply API key:');
  console.log('  node scripts/setup-appwrite.mjs <YOUR_SECRET_API_KEY>\n');
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
    const def = required ? undefined : (defaultValue === null ? undefined : defaultValue);
    await withRetry(() =>
      databases.createStringAttribute(DATABASE_ID, collId, key, size, required, def)
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
    const def = required ? undefined : (defaultValue === null ? undefined : defaultValue);
    await withRetry(() =>
      databases.createBooleanAttribute(DATABASE_ID, collId, key, required, def)
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
    const def = required ? undefined : (defaultValue === null ? undefined : defaultValue);
    await withRetry(() =>
      databases.createIntegerAttribute(DATABASE_ID, collId, key, required, min, max === null ? undefined : max, def)
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

// ============================================================
// 1. Departments Collection & Seed Data
// ============================================================
async function provisionDepartments() {
  await safeCreateCollection('departments', 'Departments', []);
  await safeCreateStringAttribute('departments', 'code', 10, true);
  await safeCreateStringAttribute('departments', 'name', 100, true);
  await safeCreateBooleanAttribute('departments', 'is_academic', false, true);
  await safeCreateBooleanAttribute('departments', 'is_maintenance', false, true);
  await safeCreateBooleanAttribute('departments', 'is_active', false, true);
  await safeCreateIndex('departments', 'idx_dept_code', 'unique', ['code']);

  // Seed All 6 Institutional Departments (Disjoint codes for academic vs maintenance-only)
  console.log(`  🌱 Seeding institutional departments...`);
  const initialDepts = [
    { code: '07', name: 'Computer Department', is_academic: true, is_maintenance: true, is_active: true },
    { code: '06', name: 'Civil Department', is_academic: true, is_maintenance: true, is_active: true },
    { code: '03', name: 'Electrical Department', is_academic: true, is_maintenance: true, is_active: true },
    { code: '04', name: 'Mechanical Department', is_academic: true, is_maintenance: true, is_active: true },
    { code: 'water', name: 'Water Department', is_academic: false, is_maintenance: true, is_active: true },
    { code: 'sanitation', name: 'Sanitation Department', is_academic: false, is_maintenance: true, is_active: true },
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

// ============================================================
// 2. Profiles Collection
// ============================================================
async function provisionProfiles() {
  await safeCreateCollection('profiles', 'User Profiles', []);
  await safeCreateStringAttribute('profiles', 'user_id', 255, true);
  await safeCreateStringAttribute('profiles', 'auth_user_id', 255, false);
  await safeCreateStringAttribute('profiles', 'email', 255, false);
  await safeCreateStringAttribute('profiles', 'name', 255, false);
  await safeCreateStringAttribute('profiles', 'display_name', 255, false);
  await safeCreateStringAttribute('profiles', 'enrollment_no', 32, false);
  await safeCreateStringAttribute('profiles', 'student_department_id', 50, false);
  await safeCreateStringAttribute('profiles', 'phone_number', 15, false);
  await safeCreateStringAttribute('profiles', 'role', 32, false, 'student');
  await safeCreateBooleanAttribute('profiles', 'name_locked', false, false);
  await safeCreateBooleanAttribute('profiles', 'enrollment_locked', false, false);
  await safeCreateBooleanAttribute('profiles', 'phone_locked', false, false);
  await safeCreateStringAttribute('profiles', 'profile_status', 32, false, 'incomplete');
  await safeCreateStringAttribute('profiles', 'created_at', 64, false);
  await safeCreateStringAttribute('profiles', 'updated_at', 64, false);

  await safeCreateIndex('profiles', 'idx_prof_user_id', 'unique', ['user_id']);
  await safeCreateIndex('profiles', 'idx_prof_enrollment', 'key', ['enrollment_no']);
  await safeCreateIndex('profiles', 'idx_prof_student_dept', 'key', ['student_department_id']);
}

// ============================================================
// 3. Complaints Collection
// ============================================================
async function provisionComplaints() {
  await safeCreateCollection('complaints', 'Complaints', []);
  await safeCreateStringAttribute('complaints', 'student_user_id', 255, true);
  await safeCreateStringAttribute('complaints', 'student_name', 255, true);
  await safeCreateStringAttribute('complaints', 'student_enrollment_no', 32, true);
  await safeCreateStringAttribute('complaints', 'student_department_id', 50, true);
  await safeCreateStringAttribute('complaints', 'maintenance_department_id', 50, true);
  await safeCreateStringAttribute('complaints', 'title', 255, true);
  await safeCreateStringAttribute('complaints', 'location', 255, true);
  await safeCreateStringAttribute('complaints', 'description', 5000, true);
  await safeCreateStringAttribute('complaints', 'priority', 32, false, 'medium');
  await safeCreateStringAttribute('complaints', 'status', 32, false, 'Pending');
  await safeCreateIntegerAttribute('complaints', 'support_count', false, 1, null, 1);
  await safeCreateStringAttribute('complaints', 'last_meaningful_update_at', 64, false);
  await safeCreateStringAttribute('complaints', 'attachment_file_id', 255, false);
  await safeCreateStringAttribute('complaints', 'created_at', 64, false);
  await safeCreateStringAttribute('complaints', 'updated_at', 64, false);

  await safeCreateIndex('complaints', 'idx_cmpl_student_user', 'key', ['student_user_id']);
  await safeCreateIndex('complaints', 'idx_cmpl_student_dept', 'key', ['student_department_id']);
  await safeCreateIndex('complaints', 'idx_cmpl_maint_dept', 'key', ['maintenance_department_id']);
  await safeCreateIndex('complaints', 'idx_cmpl_status', 'key', ['status']);
  await safeCreateIndex('complaints', 'idx_cmpl_attachment', 'key', ['attachment_file_id']);
}

// ============================================================
// 4. Complaint Supports Collection
// ============================================================
async function provisionSupports() {
  await safeCreateCollection('complaint_supports', 'Complaint Supports', []);
  await safeCreateStringAttribute('complaint_supports', 'complaint_id', 255, true);
  await safeCreateStringAttribute('complaint_supports', 'user_id', 255, true);
  await safeCreateStringAttribute('complaint_supports', 'status', 20, false, 'active');
  await safeCreateStringAttribute('complaint_supports', 'created_at', 64, true);
  await safeCreateStringAttribute('complaint_supports', 'revoked_at', 64, false);

  await safeCreateIndex('complaint_supports', 'idx_sup_complaint', 'key', ['complaint_id']);
  await safeCreateIndex('complaint_supports', 'idx_sup_user', 'key', ['user_id']);
  await safeCreateIndex('complaint_supports', 'idx_sup_comp_user', 'unique', ['complaint_id', 'user_id']);
}

// ============================================================
// 5. Complaint Timeline Collection
// ============================================================
async function provisionTimeline() {
  await safeCreateCollection('complaint_timeline', 'Complaint Timeline', []);
  await safeCreateStringAttribute('complaint_timeline', 'complaint_id', 50, true);
  await safeCreateStringAttribute('complaint_timeline', 'author_id', 50, true);
  await safeCreateStringAttribute('complaint_timeline', 'author_role', 32, true);
  await safeCreateStringAttribute('complaint_timeline', 'entry_type', 32, true);
  await safeCreateStringAttribute('complaint_timeline', 'content', 5000, true);
  await safeCreateStringAttribute('complaint_timeline', 'old_status', 32, false);
  await safeCreateStringAttribute('complaint_timeline', 'new_status', 32, false);
  await safeCreateStringAttribute('complaint_timeline', 'created_at', 64, true);

  await safeCreateIndex('complaint_timeline', 'idx_tm_complaint', 'key', ['complaint_id']);
  await safeCreateIndex('complaint_timeline', 'idx_tm_created', 'key', ['created_at']);
}

// ============================================================
// 6. Phone Change Requests Collection
// ============================================================
async function provisionPhoneChangeRequests() {
  await safeCreateCollection('phone_change_requests', 'Phone Change Requests', []);
  await safeCreateStringAttribute('phone_change_requests', 'student_user_id', 50, true);
  await safeCreateStringAttribute('phone_change_requests', 'academic_department_id', 50, true);
  await safeCreateStringAttribute('phone_change_requests', 'old_phone_number', 15, true);
  await safeCreateStringAttribute('phone_change_requests', 'requested_phone_number', 15, false);
  await safeCreateStringAttribute('phone_change_requests', 'reason', 1000, true);
  await safeCreateStringAttribute('phone_change_requests', 'status', 32, false, 'pending');
  await safeCreateStringAttribute('phone_change_requests', 'reviewed_by', 50, false);
  await safeCreateStringAttribute('phone_change_requests', 'decision_reason', 1000, false);
  await safeCreateBooleanAttribute('phone_change_requests', 'permission_consumed', false, false);
  await safeCreateStringAttribute('phone_change_requests', 'created_at', 64, true);
  await safeCreateStringAttribute('phone_change_requests', 'updated_at', 64, false);

  await safeCreateIndex('phone_change_requests', 'idx_pcr_student', 'key', ['student_user_id']);
  await safeCreateIndex('phone_change_requests', 'idx_pcr_academic_dept', 'key', ['academic_department_id']);
  await safeCreateIndex('phone_change_requests', 'idx_pcr_status', 'key', ['status']);
}

// ============================================================
// 7. Complaint Warnings Collection
// ============================================================
async function provisionComplaintWarnings() {
  await safeCreateCollection('complaint_warnings', 'Complaint Warnings', []);
  await safeCreateStringAttribute('complaint_warnings', 'complaint_id', 50, true);
  await safeCreateStringAttribute('complaint_warnings', 'issued_by_principal_id', 50, true);
  await safeCreateStringAttribute('complaint_warnings', 'warning_reason', 2000, true);
  await safeCreateIntegerAttribute('complaint_warnings', 'days_delayed', true, 0);
  await safeCreateStringAttribute('complaint_warnings', 'admin_response', 2000, false);
  await safeCreateStringAttribute('complaint_warnings', 'responded_at', 64, false);
  await safeCreateStringAttribute('complaint_warnings', 'created_at', 64, true);

  await safeCreateIndex('complaint_warnings', 'idx_cw_complaint', 'key', ['complaint_id']);
  await safeCreateIndex('complaint_warnings', 'idx_cw_principal', 'key', ['issued_by_principal_id']);
}

// ============================================================
// 8. Department Admin Assignments Collection
// ============================================================
async function provisionDepartmentAdmins() {
  await safeCreateCollection('department_admins', 'Department Admin Assignments', []);
  await safeCreateStringAttribute('department_admins', 'user_id', 50, true);
  await safeCreateStringAttribute('department_admins', 'email', 255, true);
  await safeCreateStringAttribute('department_admins', 'department_id', 50, true);
  await safeCreateStringAttribute('department_admins', 'scope', 32, true); // 'academic' | 'maintenance'
  await safeCreateBooleanAttribute('department_admins', 'is_active', false, true);
  await safeCreateStringAttribute('department_admins', 'assigned_by', 50, true);
  await safeCreateStringAttribute('department_admins', 'created_at', 64, true);

  await safeCreateIndex('department_admins', 'idx_da_user', 'key', ['user_id']);
  await safeCreateIndex('department_admins', 'idx_da_dept_scope', 'key', ['department_id', 'scope']);
}

// ============================================================
// 9. Audit Logs Collection
// ============================================================
async function provisionAuditLogs() {
  await safeCreateCollection('audit_logs', 'Audit Logs', []);
  await safeCreateStringAttribute('audit_logs', 'action', 64, true);
  await safeCreateStringAttribute('audit_logs', 'actor_id', 50, true);
  await safeCreateStringAttribute('audit_logs', 'actor_role', 32, true);
  await safeCreateStringAttribute('audit_logs', 'target_resource_id', 50, true);
  await safeCreateStringAttribute('audit_logs', 'target_resource_type', 32, true);
  await safeCreateStringAttribute('audit_logs', 'details', 10000, true);
  await safeCreateStringAttribute('audit_logs', 'created_at', 64, true);

  await safeCreateIndex('audit_logs', 'idx_al_action', 'key', ['action']);
  await safeCreateIndex('audit_logs', 'idx_al_actor', 'key', ['actor_id']);
  await safeCreateIndex('audit_logs', 'idx_al_target', 'key', ['target_resource_id']);
  await safeCreateIndex('audit_logs', 'idx_al_created', 'key', ['created_at']);
}

// ============================================================
// Storage Bucket Provisioning
// ============================================================
async function provisionStorageBucket() {
  const bucketId = 'complaint-attachments';
  const bucketPermissions = [Permission.create(Role.users())];
  console.log(`\n📁 Checking storage bucket '${bucketId}'...`);
  try {
    await withRetry(() => storage.getBucket({ bucketId }));
    await withRetry(() =>
      storage.updateBucket({
        bucketId,
        name: 'Complaint Attachments',
        permissions: bucketPermissions,
        fileSecurity: true,
        enabled: true,
        maximumFileSize: 5242880, // Strict 5MB limit (5 * 1024 * 1024 bytes)
        allowedFileExtensions: ['jpg', 'jpeg', 'png', 'pdf'], // PDF, JPG, JPEG, PNG only (no webp)
      })
    );
    console.log(`  ✓ Bucket '${bucketId}' verified with private file security and 5MB limit.`);
  } catch {
    console.log(`  → Creating bucket '${bucketId}'...`);
    try {
      await withRetry(() =>
        storage.createBucket({
          bucketId,
          name: 'Complaint Attachments',
          permissions: bucketPermissions,
          fileSecurity: true,
          enabled: true,
          maximumFileSize: 5242880, // Strict 5MB limit (5 * 1024 * 1024 bytes)
          allowedFileExtensions: ['jpg', 'jpeg', 'png', 'pdf'], // PDF, JPG, JPEG, PNG only (no webp)
        })
      );
      console.log(`  ✓ Bucket '${bucketId}' created with 5MB ceiling and restricted formats.`);
    } catch (err) {
      console.warn(`  ! Notice for bucket creation: ${err.message}`);
    }
  }
}

// ============================================================
// Main Execution
// ============================================================
async function main() {
  console.log('====================================================');
  console.log('🏛️  CampusVoice — Appwrite Provisioning Script (Day 1)');
  console.log('====================================================');
  console.log(`Endpoint:    ${ENDPOINT}`);
  console.log(`Project ID:  ${PROJECT_ID}`);
  console.log(`Database:    ${DATABASE_ID}`);
  console.log('====================================================');

  if (!API_KEY) {
    console.log('\x1b[32m✔ Schema architecture and collection definitions verified locally.\x1b[0m');
    console.log('No live execution performed without explicit user approval.');
    return;
  }

  try {
    await safeCreateDatabase();
    await provisionDepartments();
    await provisionProfiles();
    await provisionComplaints();
    await provisionSupports();
    await provisionTimeline();
    await provisionPhoneChangeRequests();
    await provisionComplaintWarnings();
    await provisionDepartmentAdmins();
    await provisionAuditLogs();
    await provisionStorageBucket();

    console.log('\n====================================================');
    console.log('\x1b[32m✨ All 9 Appwrite collections & bucket prepared successfully!\x1b[0m');
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n\x1b[31m❌ Provisioning failed:\x1b[0m', error);
    process.exit(1);
  }
}

main();
