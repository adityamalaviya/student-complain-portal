#!/usr/bin/env node

/**
 * CampusVoice — Create Admin Profile Script
 * 
 * Uses the Appwrite CLI to look up an administrator's user ID from Appwrite Auth,
 * verifies their department assignment from `department_admins`, and creates (or updates)
 * their profile in the `profiles` table so they can access the admin panel.
 * 
 * Usage:
 *   node scripts/create-admin-profile.mjs [admin_email]
 * 
 * If no email is provided, it syncs profiles for all active administrators.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'campusvoice';
const PROFILES_TABLE_ID = process.env.COLLECTION_PROFILES || 'profiles';
const DEPT_ADMINS_TABLE_ID = process.env.COLLECTION_DEPARTMENT_ADMINS || 'department_admins';

// Canonical department mappings
const DEPT_CODE_MAP = {
  dept_civil: { code: '06', name: 'Civil' },
  '06': { code: '06', name: 'Civil' },
  civil: { code: '06', name: 'Civil' },
  dept_comp: { code: '07', name: 'Computer' },
  '07': { code: '07', name: 'Computer' },
  comp: { code: '07', name: 'Computer' },
  computer: { code: '07', name: 'Computer' },
  dept_elec: { code: '09', name: 'Electrical' },
  '09': { code: '09', name: 'Electrical' },
  elec: { code: '09', name: 'Electrical' },
  electrical: { code: '09', name: 'Electrical' },
  dept_mech: { code: '19', name: 'Mechanical' },
  '19': { code: '19', name: 'Mechanical' },
  mech: { code: '19', name: 'Mechanical' },
  mechanical: { code: '19', name: 'Mechanical' },
  dept_water: { code: 'water', name: 'Water' },
  water: { code: 'water', name: 'Water' },
  dept_sanit: { code: 'sanit', name: 'Sanitation' },
  sanit: { code: 'sanit', name: 'Sanitation' },
  sanitation: { code: 'sanit', name: 'Sanitation' },
};

/**
 * Locate appwrite CLI executable or run.js
 */
function getAppwriteCliCommand() {
  const npmGlobalRunJs = path.join(
    os.homedir(),
    'AppData',
    'Roaming',
    'npm',
    'node_modules',
    'appwrite-cli',
    'run.js'
  );

  return {
    cmd: process.execPath,
    args: [npmGlobalRunJs],
  };
}

/**
 * Run an Appwrite CLI command and return parsed JSON
 */
function runCli(cliArgs) {
  const { cmd, args } = getAppwriteCliCommand();
  const allArgs = [...args, ...cliArgs, '--json'];

  const res = spawnSync(cmd, allArgs, {
    encoding: 'utf-8',
    env: process.env,
  });

  if (res.error) {
    throw new Error(`Failed to execute CLI: ${res.error.message}`);
  }

  if (res.status !== 0) {
    const errText = (res.stderr || res.stdout || '').trim();
    throw new Error(`CLI command failed (exit code ${res.status}): ${errText}`);
  }

  const raw = (res.stdout || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * List all users from Appwrite Auth
 */
function getAuthUsers() {
  const result = runCli(['users', 'list', '--limit', '100']);
  return result?.users || [];
}

/**
 * List department admins from department_admins table
 */
function getDepartmentAdmins() {
  const result = runCli([
    'tablesdb',
    'list-rows',
    '--database-id',
    DATABASE_ID,
    '--table-id',
    DEPT_ADMINS_TABLE_ID,
    '--limit',
    '100',
  ]);
  return result?.rows || [];
}

/**
 * Check if a row exists in profiles table
 */
function getExistingProfile(rowId) {
  try {
    return runCli([
      'tablesdb',
      'get-row',
      '--database-id',
      DATABASE_ID,
      '--table-id',
      PROFILES_TABLE_ID,
      '--row-id',
      rowId,
    ]);
  } catch {
    return null;
  }
}

/**
 * Create or update admin profile
 */
function saveAdminProfile(profileData) {
  const existing = getExistingProfile(profileData.user_id);
  const now = new Date().toISOString();

  const payload = {
    user_id: profileData.user_id,
    auth_user_id: profileData.user_id,
    email: profileData.email,
    name: profileData.name || 'Department Admin',
    display_name: profileData.name || 'Department Admin',
    role: 'department_admin',
    department_code: profileData.department_code,
    department_name: profileData.department_name,
    profile_status: 'complete',
    is_locked: true,
    name_locked: true,
    enrollment_locked: true,
    phone_locked: true,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  if (existing) {
    console.log(`ℹ Profile already exists for ${profileData.email} (ID: ${profileData.user_id}). Updating...`);
    const updateRes = runCli([
      'tablesdb',
      'update-row',
      '--database-id',
      DATABASE_ID,
      '--table-id',
      PROFILES_TABLE_ID,
      '--row-id',
      profileData.user_id,
      '--data',
      JSON.stringify(payload),
    ]);
    console.log(`✔ Updated profile for ${profileData.email}`);
    return updateRes;
  } else {
    console.log(`ℹ Creating new profile for ${profileData.email} (ID: ${profileData.user_id})...`);
    const createRes = runCli([
      'tablesdb',
      'create-row',
      '--database-id',
      DATABASE_ID,
      '--table-id',
      PROFILES_TABLE_ID,
      '--row-id',
      profileData.user_id,
      '--data',
      JSON.stringify(payload),
    ]);
    console.log(`✔ Successfully created admin profile for ${profileData.email}`);
    return createRes;
  }
}

async function main() {
  const targetEmail = (process.argv[2] || '').trim().toLowerCase();

  console.log('====================================================');
  console.log('🏛️  CampusVoice — Provision Admin User Profile');
  console.log('====================================================');

  console.log('1. Fetching Appwrite Auth users...');
  const authUsers = getAuthUsers();
  console.log(`   Found ${authUsers.length} user(s) in Auth.`);

  console.log('2. Fetching active department assignments...');
  const adminRows = getDepartmentAdmins();
  console.log(`   Found ${adminRows.length} assignment(s) in '${DEPT_ADMINS_TABLE_ID}'.`);

  // Build lookup maps
  const authByEmail = new Map();
  for (const u of authUsers) {
    if (u.email) {
      authByEmail.set(u.email.toLowerCase(), u);
    }
  }

  const activeAdmins = adminRows.filter((r) => r.is_active === true);

  if (targetEmail) {
    console.log(`\n🔍 Looking up admin: ${targetEmail}`);
    const user = authByEmail.get(targetEmail);
    if (!user) {
      console.error(`\x1b[31m✗ Error: No Auth user found with email '${targetEmail}'.\x1b[0m`);
      console.log('Available Auth emails:');
      for (const u of authUsers) {
        console.log(`  - ${u.email} (ID: ${u.$id})`);
      }
      process.exit(1);
    }

    const assignment = activeAdmins.find(
      (a) =>
        (a.email && a.email.toLowerCase() === targetEmail) ||
        (a.user_id && a.user_id === user.$id)
    );

    const deptId = assignment?.department_id || 'dept_comp';
    const deptInfo = DEPT_CODE_MAP[deptId] || {
      code: '07',
      name: assignment?.department_name || 'Computer',
    };

    saveAdminProfile({
      user_id: user.$id,
      email: user.email,
      name: user.name || 'Department Admin',
      department_code: deptInfo.code,
      department_name: assignment?.department_name || deptInfo.name,
    });
  } else {
    console.log('\n🔍 No specific email provided. Provisioning profiles for all active department admins...');
    let processed = 0;

    for (const admin of activeAdmins) {
      const email = (admin.email || '').toLowerCase();
      // Match by user_id first, then email
      let user = authUsers.find((u) => u.$id === admin.user_id);
      if (!user && email) {
        user = authByEmail.get(email);
      }

      if (!user) {
        console.warn(`\x1b[33m⚠ Warning: Admin assignment for '${email}' (user_id: '${admin.user_id}') has no matching Auth user.\x1b[0m`);
        continue;
      }

      const deptId = admin.department_id || 'dept_comp';
      const deptInfo = DEPT_CODE_MAP[deptId] || {
        code: '07',
        name: admin.department_name || 'Computer',
      };

      saveAdminProfile({
        user_id: user.$id,
        email: user.email,
        name: user.name || 'Department Admin',
        department_code: deptInfo.code,
        department_name: admin.department_name || deptInfo.name,
      });
      processed++;
    }

    console.log(`\n🎉 Completed provisioning ${processed} admin profile(s).`);
  }

  console.log('\n✅ Done! You can now sign in with your admin account to access the admin panel (/admin).');
}

main().catch((err) => {
  console.error('\x1b[31mFatal error:\x1b[0m', err.message);
  process.exit(1);
});
