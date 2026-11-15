import { ID } from 'node-appwrite';
/**
 * Appends an audit event to the append-only audit_logs collection.
 * Only creates new documents, never exposes update or delete operations.
 * Never throws to the caller to avoid breaking core business flows on secondary logging issues.
 */
export async function appendAuditLog(db, databaseId, collectionId, entry, logFn) {
    try {
        const targetResourceId = entry.target_resource_id || entry.target_id || '';
        const rawDetails = entry.details ?? entry.metadata ?? {};
        const detailsString = typeof rawDetails === 'string'
            ? rawDetails.slice(0, 5000)
            : JSON.stringify(rawDetails).slice(0, 5000);
        const timestamp = entry.timestamp || new Date().toISOString();
        await db.createDocument(databaseId, collectionId, ID.unique(), {
            action: String(entry.action || '').slice(0, 100),
            actor_id: String(entry.actor_id || '').slice(0, 50),
            actor_role: String(entry.actor_role || '').slice(0, 32),
            target_resource_id: targetResourceId.slice(0, 50),
            target_resource_type: (entry.target_resource_type || 'resource').slice(0, 50),
            details: detailsString,
            created_at: timestamp,
        }, [] // Strictly empty permissions ($permissions = [])
        );
    }
    catch (err) {
        if (logFn) {
            logFn(`[audit] Non-fatal failure appending audit log: ${String(err)}`);
        }
        else {
            console.error(`[audit] Non-fatal failure appending audit log: ${String(err)}`);
        }
    }
}
