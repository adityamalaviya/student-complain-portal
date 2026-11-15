import { Client, Databases, Storage, Users } from 'node-appwrite';

export function getAppwriteConfig(): {
  endpoint: string;
  projectId: string;
  apiKey: string;
  databaseId: string;
  profilesCollectionId: string;
  departmentsCollectionId: string;
  complaintsCollectionId: string;
  supportsCollectionId: string;
  timelineCollectionId: string;
  departmentAdminsCollectionId: string;
  phoneChangeRequestsCollectionId: string;
  warningsCollectionId: string;
  auditLogsCollectionId: string;
  storageBucketId: string;
  adminCivilEmail: string;
  adminComputerEmail: string;
} {
  const endpoint =
    process.env.APPWRITE_FUNCTION_ENDPOINT ||
    process.env.APPWRITE_ENDPOINT ||
    'https://cloud.appwrite.io/v1';

  const projectId =
    process.env.APPWRITE_FUNCTION_PROJECT_ID ||
    process.env.APPWRITE_PROJECT_ID ||
    '';

  const apiKey =
    process.env.APPWRITE_FUNCTION_API_KEY ||
    process.env.APPWRITE_API_KEY ||
    '';

  const databaseId = process.env.APPWRITE_DATABASE_ID || 'campusvoice';
  const profilesCollectionId = process.env.COLLECTION_PROFILES || 'profiles';
  const departmentsCollectionId = process.env.COLLECTION_DEPARTMENTS || 'departments';
  const complaintsCollectionId = process.env.COLLECTION_COMPLAINTS || 'complaints';
  const supportsCollectionId = process.env.COLLECTION_SUPPORTS || 'complaint_supports';
  const timelineCollectionId = process.env.COLLECTION_TIMELINE || 'complaint_timeline';
  const departmentAdminsCollectionId =
    process.env.COLLECTION_DEPARTMENT_ADMINS ||
    process.env.DEPARTMENT_ADMINS ||
    'department_admins';
  const phoneChangeRequestsCollectionId =
    process.env.COLLECTION_PHONE_CHANGE_REQUESTS || 'phone_change_requests';
  const warningsCollectionId =
    process.env.COLLECTION_WARNINGS || 'complaint_warnings';
  const auditLogsCollectionId =
    process.env.COLLECTION_AUDIT_LOGS || 'audit_logs';
  const storageBucketId =
    process.env.APPWRITE_STORAGE_BUCKET_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_ATTACHMENTS_BUCKET_ID ||
    'complaint-attachments';

  const adminCivilEmail = (process.env.ADMIN_ALLOWLIST_06 || '').trim().toLowerCase();
  const adminComputerEmail = (process.env.ADMIN_ALLOWLIST_07 || '').trim().toLowerCase();

  return {
    endpoint,
    projectId,
    apiKey,
    databaseId,
    profilesCollectionId,
    departmentsCollectionId,
    complaintsCollectionId,
    supportsCollectionId,
    timelineCollectionId,
    departmentAdminsCollectionId,
    phoneChangeRequestsCollectionId,
    warningsCollectionId,
    auditLogsCollectionId,
    storageBucketId,
    adminCivilEmail,
    adminComputerEmail,
  };
}

export function getServerClient(): {
  client: Client;
  databases: Databases;
  storage: Storage;
  users: Users;
} {
  const config = getAppwriteConfig();
  const client = new Client();

  client.setEndpoint(config.endpoint);
  if (config.projectId) {
    client.setProject(config.projectId);
  }
  if (config.apiKey) {
    client.setKey(config.apiKey);
  }

  const databases = new Databases(client);
  const storage = new Storage(client);
  const users = new Users(client);

  return { client, databases, storage, users };
}
