import dns from 'node:dns';
import fs from 'node:fs';
import { Client, Databases, Users, Query, ID } from 'node-appwrite';

// Ensure IPv4 first on Node.js / Windows
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore
}

// Load .env.local: try dotenv first, fallback to native file parsing
function loadEnvFile(filePath = '.env.local') {
  if (typeof process.loadEnvFile === 'function') {
    try {
      if (fs.existsSync(filePath)) {
        process.loadEnvFile(filePath);
        return;
      }
    } catch {
      // Fallback below
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

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT ||
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
  'https://fra.cloud.appwrite.io/v1';

const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ||
  '6ad8e59a00154ed97543';

const DATABASE_ID =
  process.env.APPWRITE_DATABASE_ID ||
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ||
  'campusvoice';

const API_KEY =
  process.env.APPWRITE_API_KEY ||
  process.env.APPWRITE_FUNCTION_API_KEY ||
  '';

const VALID_DEPARTMENTS = {
  dept_civil: { name: 'Civil', is_academic: true, is_maintenance: true },
  dept_comp: { name: 'Computer', is_academic: true, is_maintenance: true },
  dept_elec: { name: 'Electrical', is_academic: true, is_maintenance: true },
  dept_mech: { name: 'Mechanical', is_academic: true, is_maintenance: true },
  dept_water: { name: 'Water', is_academic: false, is_maintenance: true },
  dept_sanit: { name: 'Sanitation', is_academic: false, is_maintenance: true },
};

function printUsage() {
  console.log(`
Usage:
  node scripts/assign-admin.mjs <email> <department_id> [scope] [apiKey]

Parameters:
  email          - Institutional email address of administrator (e.g. aditya@college.edu)
  department_id  - One of: dept_civil, dept_comp, dept_elec, dept_mech, dept_water, dept_sanit
  scope          - 'maintenance' (default) or 'academic'
  apiKey         - (Optional) Appwrite secret API key, or set APPWRITE_API_KEY in .env.local

Examples:
  node scripts/assign-admin.mjs aditya@college.edu dept_comp maintenance
  node scripts/assign-admin.mjs adityag2318p@gmail.com dept_comp maintenance
`);
}

async function resolveDepartmentAdminsCollection(databases, databaseId) {
  const customId = process.env.COLLECTION_DEPARTMENT_ADMINS;
  if (customId) {
    try {
      await databases.getCollection(databaseId, customId);
      return customId;
    } catch {}
  }

  // 1. Try 'department_admins'
  try {
    await databases.getCollection(databaseId, 'department_admins');
    return 'department_admins';
  } catch {}

  // 2. Try known cloud ID 'department_admins'
  try {
    await databases.getCollection(databaseId, 'department_admins');
    return 'department_admins';
  } catch {}

  return 'department_admins';
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    printUsage();
    process.exit(1);
  }

  const email = (args[0] || '').trim().toLowerCase();
  const departmentId = (args[1] || '').trim().toLowerCase();
  const scope = (args[2] || 'maintenance').trim().toLowerCase();
  const key = args[3] || API_KEY;

  if (!email.includes('@')) {
    console.error(`\x1b[31mError: Invalid email address '${email}'\x1b[0m`);
    process.exit(1);
  }

  const dept = VALID_DEPARTMENTS[departmentId];
  if (!dept) {
    console.error(`\x1b[31mError: Unknown department '${departmentId}'. Valid options:\x1b[0m`);
    Object.keys(VALID_DEPARTMENTS).forEach((d) => console.error(`  - ${d} (${VALID_DEPARTMENTS[d].name})`));
    process.exit(1);
  }

  if (scope !== 'academic' && scope !== 'maintenance') {
    console.error(`\x1b[31mError: Scope must be 'academic' or 'maintenance' (received '${scope}')\x1b[0m`);
    process.exit(1);
  }

  if (scope === 'academic' && !dept.is_academic) {
    console.error(`\x1b[31mError: Department '${departmentId}' (${dept.name}) is not an academic department.\x1b[0m`);
    process.exit(1);
  }

  console.log('====================================================');
  console.log('🏛️  CampusVoice — Department Admin Provisioning');
  console.log('====================================================');
  console.log(`Email:       ${email}`);
  console.log(`Department:  ${departmentId} (${dept.name})`);
  console.log(`Scope:       ${scope}`);
  console.log(`Endpoint:    ${ENDPOINT}`);
  console.log(`Project ID:  ${PROJECT_ID}`);
  console.log('====================================================');

  if (!key) {
    console.log('\x1b[33m[Dry-Run Mode] No API Key found in .env.local or arguments.\x1b[0m');
    console.log('To write to Appwrite, supply API key:');
    console.log(`  node scripts/assign-admin.mjs ${email} ${departmentId} ${scope} <API_KEY>`);
    return;
  }

  const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(key);

  const databases = new Databases(client);
  const users = new Users(client);

  try {
    // 1. Resolve collection ID and attributes
    const colId = await resolveDepartmentAdminsCollection(databases, DATABASE_ID);
    console.log(`ℹ Using collection: ${colId}`);

    let attributeKeys = new Set();
    try {
      const colInfo = await databases.getCollection(DATABASE_ID, colId);
      attributeKeys = new Set(colInfo.attributes.map((a) => a.key));
    } catch (colErr) {
      console.log(`ℹ Could not inspect collection attributes (${colErr.message}). Using safe schema.`);
    }

    // 2. Check if user already exists in Appwrite Auth
    let userId = 'pending_oauth';
    try {
      const userList = await users.list([Query.equal('email', email), Query.limit(1)]);
      if (userList.total > 0 && userList.users[0]) {
        userId = userList.users[0].$id;
        console.log(`✓ Located Appwrite Auth user ID: ${userId}`);
      } else {
        console.log(`ℹ Appwrite Auth user not found yet. Assignment will link upon first login.`);
      }
    } catch (userErr) {
      console.log(`ℹ Notice on users list: ${userErr.message}`);
    }

    // 3. Check if assignment record already exists
    const existing = await databases.listDocuments(
      DATABASE_ID,
      colId,
      [Query.equal('email', email), Query.limit(10)]
    );

    const now = new Date().toISOString();
    const matchingDoc = existing.documents.find(
      (doc) => doc.department_id === departmentId
    );

    if (matchingDoc) {
      const updateData = {
        is_active: true,
        department_id: departmentId,
      };

      if (userId !== 'pending_oauth') {
        updateData.user_id = userId;
      }
      if (attributeKeys.size === 0 || attributeKeys.has('department_name')) {
        updateData.department_name = dept.name;
      }
      if (attributeKeys.size === 0 || attributeKeys.has('scope')) {
        updateData.scope = scope;
      }
      if (attributeKeys.size === 0 || attributeKeys.has('academic_department_id')) {
        updateData.academic_department_id = scope === 'academic' ? departmentId : departmentId;
      }
      if (attributeKeys.size === 0 || attributeKeys.has('maintenance_department_id')) {
        updateData.maintenance_department_id = scope === 'maintenance' ? departmentId : departmentId;
      }

      await databases.updateDocument(
        DATABASE_ID,
        colId,
        matchingDoc.$id,
        updateData
      );
      console.log(`\x1b[32m✓ Updated existing assignment ${matchingDoc.$id} (is_active: true)\x1b[0m`);
    } else {
      const createData = {
        user_id: userId,
        email,
        department_id: departmentId,
        is_active: true,
      };

      if (attributeKeys.size === 0 || attributeKeys.has('department_name')) {
        createData.department_name = dept.name;
      }
      if (attributeKeys.size === 0 || attributeKeys.has('scope')) {
        createData.scope = scope;
      }
      if (attributeKeys.size === 0 || attributeKeys.has('academic_department_id')) {
        createData.academic_department_id = scope === 'academic' ? departmentId : departmentId;
      }
      if (attributeKeys.size === 0 || attributeKeys.has('maintenance_department_id')) {
        createData.maintenance_department_id = scope === 'maintenance' ? departmentId : departmentId;
      }
      if (attributeKeys.size === 0 || attributeKeys.has('assigned_by')) {
        createData.assigned_by = 'cli_admin';
      }
      if (attributeKeys.size === 0 || attributeKeys.has('created_at')) {
        createData.created_at = now;
      }

      const doc = await databases.createDocument(
        DATABASE_ID,
        colId,
        ID.unique(),
        createData,
        []
      );
      console.log(`\x1b[32m✓ Created new department_admins assignment: ${doc.$id}\x1b[0m`);
    }

    console.log('\n\x1b[32m✨ Admin assignment successfully registered with is_active: true!\x1b[0m\n');
  } catch (err) {
    console.error('\n\x1b[31m❌ Admin assignment failed:\x1b[0m', err.message);
    process.exit(1);
  }
}

main();
