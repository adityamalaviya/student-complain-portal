export interface AppwriteContext {
  req: {
    body: string | Record<string, unknown>;
    headers: Record<string, string>;
    method: string;
    url: string;
    path: string;
  };
  res: {
    json: (data: Record<string, unknown>, statusCode?: number) => unknown;
    empty: () => unknown;
  };
  log: (message: unknown) => void;
  error: (message: unknown) => void;
}

export default async function main(context: AppwriteContext): Promise<unknown> {
  const { req, res, log } = context;

  log(`[campusvoice-api] Incoming execution: ${req.method} ${req.path}`);

  // Parse payload safely
  let payload: Record<string, unknown> = {};
  if (typeof req.body === 'string') {
    try {
      payload = req.body.trim().length > 0 ? (JSON.parse(req.body) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
  } else if (req.body && typeof req.body === 'object') {
    payload = req.body;
  }

  const action = (payload.action as string) || (req.headers['x-action'] as string) || 'health';

  if (action === 'health') {
    return res.json(
      {
        success: true,
        service: 'campusvoice-api',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        active_departments: [
          { code: '06', name: 'Civil Department' },
          { code: '07', name: 'Computer Department' },
        ],
      },
      200
    );
  }

  return res.json(
    {
      success: false,
      error: `Action '${action}' is not yet implemented in Phase 1 setup scaffold.`,
      code: 'ACTION_NOT_IMPLEMENTED',
    },
    501
  );
}
