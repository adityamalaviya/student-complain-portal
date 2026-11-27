import dns from 'node:dns';
import { Client, Databases, Storage, Users } from 'node-appwrite';

// Ensure IPv4 resolution takes precedence on dual-stack hosts to avoid transient UND_ERR_CONNECT_TIMEOUT
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore on runtimes without setDefaultResultOrder
}

const TRANSIENT_NETWORK_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
]);

export function isTransientAppwriteError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }

  const record = err as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown };
  };

  if (typeof record.code === 'number') {
    if (record.code === 429 || record.code === 502 || record.code === 503 || record.code === 504) {
      return true;
    }
  }

  if (typeof record.code === 'string' && TRANSIENT_NETWORK_CODES.has(record.code)) {
    return true;
  }

  if (
    record.cause &&
    typeof record.cause.code === 'string' &&
    TRANSIENT_NETWORK_CODES.has(record.cause.code)
  ) {
    return true;
  }

  const msg = `${typeof record.message === 'string' ? record.message : ''} ${
    record.cause && typeof record.cause.message === 'string' ? record.cause.message : ''
  }`;
  return /fetch failed|socket hang up|connect timeout|econnreset|etimedout|too many requests|service unavailable|bad gateway|gateway timeout/i.test(
    msg
  );
}

export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 120
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isTransientAppwriteError(err)) {
        throw err;
      }
      const delayMs = baseDelayMs * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

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
    process.env.APPWRITE_FUNCTION_API_ENDPOINT ||
    process.env.APPWRITE_FUNCTION_ENDPOINT ||
    process.env.APPWRITE_ENDPOINT ||
    'https://fra.cloud.appwrite.io/v1';

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

export function getServerClient(apiKeyOverride?: string): {
  client: Client;
  databases: Databases;
  storage: Storage;
  users: Users;
} {
  const config = getAppwriteConfig();
  const effectiveApiKey = (apiKeyOverride || '').trim() || config.apiKey;
  const client = new Client();

  client.setEndpoint(config.endpoint);
  if (config.projectId) {
    client.setProject(config.projectId);
  }
  if (effectiveApiKey) {
    client.setKey(effectiveApiKey);
  }

  const databases = new Databases(client);
  const storage = new Storage(client);
  const users = new Users(client);

  return { client, databases, storage, users };
}
