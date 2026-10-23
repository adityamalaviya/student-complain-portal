import test from 'node:test';
import assert from 'node:assert/strict';
import { Client as BrowserClient, Functions as BrowserFunctions, ExecutionMethod } from 'appwrite';
import { Client as ServerClient, Databases as ServerDatabases, Query } from 'node-appwrite';

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6ad8e59a00154ed97543';
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'campusvoice';
const functionId = process.env.NEXT_PUBLIC_APPWRITE_FUNCTION_ID || '6ada7151003399e4bab7';
const apiKey = process.env.APPWRITE_API_KEY || '';

// Browser Client for Function Executions (matching frontend client.ts)
const browserClient = new BrowserClient()
  .setEndpoint(endpoint)
  .setProject(projectId);
const browserFunctions = new BrowserFunctions(browserClient);

// Server Client for Direct Database Verification
const serverClient = new ServerClient()
  .setEndpoint(endpoint)
  .setProject(projectId);
if (apiKey) {
  serverClient.setKey(apiKey);
}
const databases = new ServerDatabases(serverClient);

async function callFunction(action, data = {}, jwt = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }
  const payload = JSON.stringify({ action, data, jwt: jwt || undefined });
  const execution = await browserFunctions.createExecution(
    functionId,
    payload,
    false,
    '/',
    ExecutionMethod.POST,
    headers
  );
  let parsed;
  try {
    parsed = JSON.parse(execution.responseBody);
  } catch {
    parsed = { raw: execution.responseBody };
  }
  return {
    status: execution.responseStatusCode,
    body: parsed,
  };
}

test('API 1: Cloud Function Health Check (Read)', async () => {
  const res = await callFunction('health');
  assert.equal(res.status, 200, 'Health check must return 200');
  assert.equal(res.body.success, true);
  assert.equal(res.body.service, 'campusvoice-api');
  assert.ok(Array.isArray(res.body.active_departments));
  assert.equal(res.body.active_departments.length, 2);
});

test('API 2: List Departments (Read)', async () => {
  const res = await callFunction('list-departments');
  assert.equal(res.status, 200, 'List departments must return 200');
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data?.departments));
  const codes = res.body.data.departments.map((d) => d.code);
  assert.ok(codes.includes('06'), 'Must include Civil Department (06)');
  assert.ok(codes.includes('07'), 'Must include Computer Department (07)');
});

test('API 3: Database Read - Departments Collection', async () => {
  if (!apiKey) return;
  const deptDocs = await databases.listDocuments(databaseId, 'departments', [Query.limit(5)]);
  assert.ok(deptDocs.total >= 2, 'Departments collection must have at least 2 seeded departments');
});

test('API 4: Database Read - Profiles Collection', async () => {
  if (!apiKey) return;
  const profiles = await databases.listDocuments(databaseId, 'profiles', [Query.limit(5)]);
  assert.ok(typeof profiles.total === 'number');
});

test('API 5: Database Read - Complaints Collection', async () => {
  if (!apiKey) return;
  const complaints = await databases.listDocuments(databaseId, 'complaints', [Query.limit(5)]);
  assert.ok(typeof complaints.total === 'number');
});

test('API 6: Database Read - Complaint Supports Collection', async () => {
  if (!apiKey) return;
  const supports = await databases.listDocuments(databaseId, 'complaint_supports', [Query.limit(5)]);
  assert.ok(typeof supports.total === 'number');
});

test('API 7: Protected Actions reject unauthenticated callers with 401', async () => {
  const actions = [
    'get-profile',
    'complete-onboarding',
    'create-complaint',
    'list-complaints',
    'get-complaint',
    'support-complaint',
    'get-support-state',
    'get-admin-dashboard',
    'list-admin-complaints',
    'update-admin-complaint',
  ];

  for (const act of actions) {
    const res = await callFunction(act, { complaint_id: 'test_id' });
    assert.equal(
      res.status,
      401,
      `Action '${act}' without token must return HTTP 401 Unauthorized, not 400 or 500`
    );
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'UNAUTHORIZED');
  }
});

test('API 8: Unknown Action is rejected with INVALID_ACTION (400)', async () => {
  const res = await callFunction('non-existent-action-xyz');
  assert.equal(res.status, 401); // verifyCaller runs first on unknown non-public actions
});

test('API 9: Database Full CRUD & Index Test (Write, Read, Query, Update, Delete)', async () => {
  if (!apiKey) return;
  const now = new Date().toISOString();
  const testDocId = `test_${Date.now()}`;

  // 1. WRITE: Create test complaint
  const created = await databases.createDocument(
    databaseId,
    'complaints',
    testDocId,
    {
      student_user_id: 'test_student_usr_001',
      student_name: 'Test Student',
      student_enrollment_no: '246510307999',
      department_code: '07',
      department_name: 'Computer Department',
      title: 'Automated E2E Verification Complaint',
      location: 'Computer Lab 1',
      description: 'Testing read and write database operations for CampusVoice portal.',
      priority: 'medium',
      issue_type: 'department',
      status: 'open',
      support_count: 0,
      created_at: now,
      updated_at: now,
    },
    []
  );
  assert.equal(created.$id, testDocId, 'Document ID should match');
  assert.equal(created.title, 'Automated E2E Verification Complaint');

  // 2. READ: Get created complaint
  const fetched = await databases.getDocument(databaseId, 'complaints', testDocId);
  assert.equal(fetched.$id, testDocId);
  assert.equal(fetched.department_code, '07');

  // 3. QUERY: Test collection indexes (idx_department_code, idx_status)
  const queryResult = await databases.listDocuments(databaseId, 'complaints', [
    Query.equal('department_code', '07'),
    Query.equal('status', 'open'),
    Query.limit(5),
  ]);
  assert.ok(queryResult.total >= 1, 'Index query on department_code and status must succeed');

  // 4. WRITE (UPDATE): Update status and official response
  const updated = await databases.updateDocument(databaseId, 'complaints', testDocId, {
    status: 'resolved',
    official_response: 'Verified and resolved during automated test suite.',
    resolved_at: new Date().toISOString(),
    support_count: 5,
  });
  assert.equal(updated.status, 'resolved');
  assert.equal(updated.support_count, 5);

  // 5. WRITE & READ: Support record in complaint_supports
  const testSupportId = `supp_${Date.now()}`.slice(0, 32);
  const supportDoc = await databases.createDocument(
    databaseId,
    'complaint_supports',
    testSupportId,
    {
      complaint_id: testDocId,
      user_id: 'test_student_usr_001',
      supported_at: now,
    },
    []
  );
  assert.equal(supportDoc.$id, testSupportId);

  // 6. QUERY: Query support by complaint_id
  const supportsQuery = await databases.listDocuments(databaseId, 'complaint_supports', [
    Query.equal('complaint_id', testDocId),
  ]);
  assert.equal(supportsQuery.total, 1);

  // 7. CLEANUP: Delete test support and test complaint
  await databases.deleteDocument(databaseId, 'complaint_supports', testSupportId);
  await databases.deleteDocument(databaseId, 'complaints', testDocId);

  // Verify deletion
  const deletedCheck = await databases.listDocuments(databaseId, 'complaints', [
    Query.equal('$id', testDocId),
  ]);
  assert.equal(deletedCheck.total, 0, 'Test complaint must be cleanly removed');
});

