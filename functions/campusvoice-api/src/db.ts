import { Client, Databases, Users } from 'node-appwrite';

export function getAppwriteConfig(): {
  endpoint: string;
  projectId: string;
  apiKey: string;
  databaseId: string;
  profilesCollectionId: string;
  departmentsCollectionId: string;
  complaintsCollectionId: string;
  supportsCollectionId: string;
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

  const apiKey = process.env.APPWRITE_API_KEY || '';

  const databaseId = process.env.APPWRITE_DATABASE_ID || 'campusvoice';
  const profilesCollectionId = process.env.COLLECTION_PROFILES || 'profiles';
  const departmentsCollectionId = process.env.COLLECTION_DEPARTMENTS || 'departments';
  const complaintsCollectionId = process.env.COLLECTION_COMPLAINTS || 'complaints';
  const supportsCollectionId = process.env.COLLECTION_SUPPORTS || 'complaint_supports';

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
    adminCivilEmail,
    adminComputerEmail,
  };
}

export function getServerClient(): {
  client: Client;
  databases: Databases;
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
  const users = new Users(client);

  return { client, databases, users };
}
