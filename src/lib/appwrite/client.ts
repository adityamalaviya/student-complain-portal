import { Client, Account, Databases, Storage, Functions } from 'appwrite';

const rawEndpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const endpoint = rawEndpoint || 'https://fra.cloud.appwrite.io/v1';

const rawProjectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const projectId = rawProjectId || '6ad8e59a00154ed97543';

export const client = new Client();

if (projectId) {
  client.setEndpoint(endpoint).setProject(projectId);
}

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);

// In Appwrite Cloud, function executions strictly require the 20-character Function ID
// instead of the human-readable function name ('campusvoice-api')
const rawFunctionId = process.env.NEXT_PUBLIC_APPWRITE_FUNCTION_ID;
const functionId =
  rawFunctionId && rawFunctionId !== 'campusvoice-api'
    ? rawFunctionId
    : '6ada7151003399e4bab7';

export const APPWRITE_CONFIG = {
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'campusvoice',
  functionId,
} as const;
