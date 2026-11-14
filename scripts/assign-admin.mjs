import dns from 'node:dns';
import { Client, Databases, Users, Query, ID } from 'node-appwrite';

// Ensure IPv4 first on Node.js / Windows
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore
}

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6ad8e59a00154ed97543';
const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'campusvoice';
const API_KEY = process.env.APPWRITE_API_KEY || process.env.APPWRITE_FUNCTION_API_KEY || '';

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
  email          - Institutional email address of administrator (e.g. admin@college.edu)
  department_id  - One of: dept_civil, dept_comp, dept_elec, dept_mech, dept_water, dept_sanit
  scope          - 'maintenance' (default) or 'academic'
  apiKey         - (Optional) Appwrite secret API key, or set APPWRITE_API_KEY env var

Examples:
  node scripts/assign-admin.mjs admin@college.edu dept_comp maintenance
  node scripts/assign-admin.mjs hod_civil@college.edu dept_civil academic
`);
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
    console.log('\x1b[33m[Dry-Run Mode] No API Key provided.\x1b[0m');
    console.log('Validation passed. To write to Appwrite, supply API key:');
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
    // 1. Check if user already exists in Appwrite Auth
    let userId = 'pending_oauth';
    try {
      const userList = await users.list([Query.equal('email', email), Query.limit(1)]);
      if (userList.total > 0 && userList.users[0]) {
        userId = userList.users[0].$id;
        console.log(`✓ Located Appwrite Auth user ID: ${userId}`);
      } else {
        console.log(`ℹ Appwrite Auth user not found yet. Assignment will automatically link upon first OAuth login.`);
      }
    } catch (userErr) {
      console.log(`ℹ Could not query users list (${userErr.message}). Using placeholder for automatic linkage.`);
    }

    // 2. Check if assignment record already exists
    const existing = await databases.listDocuments(
      DATABASE_ID,
      'department_admins',
      [Query.equal('email', email), Query.limit(10)]
    );

    const now = new Date().toISOString();
    const matchingDoc = existing.documents.find(
      (doc) => doc.department_id === departmentId && doc.scope === scope
    );

    if (matchingDoc) {
      await databases.updateDocument(
        DATABASE_ID,
        'department_admins',
        matchingDoc.$id,
        {
          user_id: userId !== 'pending_oauth' ? userId : (matchingDoc.user_id || 'pending_oauth'),
          is_active: true,
        }
      );
      console.log(`\x1b[32m✓ Updated existing assignment ${matchingDoc.$id} (is_active: true)\x1b[0m`);
    } else {
      const doc = await databases.createDocument(
        DATABASE_ID,
        'department_admins',
        ID.unique(),
        {
          user_id: userId,
          email,
          department_id: departmentId,
          scope,
          is_active: true,
          assigned_by: 'cli_admin',
          created_at: now,
        },
        [] // Empty ACL enforcement
      );
      console.log(`\x1b[32m✓ Created new department_admins assignment: ${doc.$id}\x1b[0m`);
    }

    console.log('\n\x1b[32m✨ Admin assignment successfully registered!\x1b[0m\n');
  } catch (err) {
    console.error('\n\x1b[31m❌ Admin assignment failed:\x1b[0m', err.message);
    process.exit(1);
  }
}

main();

