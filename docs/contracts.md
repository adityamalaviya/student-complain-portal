# CampusVoice — Implementation Preparation & API Contracts

## 1. Approved Minimalist Frontend Screen to Route Mapping

All UI components adhere strictly to the approved minimalist, clean, Linear/Notion-inspired design system (`assets/537147777ed84fa4a56a00bebb1e6384`):

| Next.js Route | Screen Scope | Approved Stitch Screen ID | Key UI Components |
|---|---|---|---|
| `/sign-in` | Google OAuth Sign In | `f0c43763d7fc432a9d1707f25cb80860` | Centered institutional card, Google OAuth button, redirect handling. |
| `/onboarding` | First-Time Profile Setup | `88de13563aae4a9295c9b383e3c0be78` | Name, 12-digit enrollment number input, auto-derived department preview, verbatim one-time lock notice, Submit button. |
| `/dashboard` | Student Dashboard & Feed | `8b3edccce6094a8f820d740c2f9be10e` | Top bar (logo, dept badge, 'Raise Complaint' button, avatar), tabs (`Department Feed` / `Public Issues`), airy complaint cards with support counter. |
| `/complaints/new` | Raise Complaint Form | `f038ac8a691a4208b0a11c0e3293ce47` | Single-column form with prefilled read-only student credentials, title, location, description, priority pill selector, drag-and-drop attachment, Cancel & Submit. |
| `/complaints/[id]` | Complaint Detail & Support | `9ad544a4dbf94c039a533138fb02af99` | Clean reading layout, metadata header, description, one-click community support button, official department resolution card. |
| `/admin` | Zen Admin Dashboard | `c10fa303083e40fe9ef3c14625a4aabb` | Single-column complaint queue, quiet inline metrics (`14 pending · 98 resolved`), 28px+ row breathing room, centered resolution modal dialog. |
| `/*` (Global) | Feedback & Error States | `8b9ace28fb344ef992b3b58770d56b6e` | Skeleton loaders, empty queue illustrations, toast notifications, generic `404 Not Found` oracle protection. |

---

## 2. Shared TypeScript Types

```typescript
export type DepartmentCode = '06' | '07';

export type UserRole = 'student' | 'department_admin';

export type PriorityLevel = 'low' | 'medium' | 'high';

export type IssueType = 'department' | 'public';

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved';

export interface Department {
  $id: string;
  code: DepartmentCode;
  name: string;
  is_active: boolean;
}

export interface UserProfile {
  $id: string;
  user_id: string;
  name: string;
  enrollment_no: string;
  department_code: DepartmentCode;
  department_name: string;
  role: UserRole;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface Complaint {
  $id: string;
  student_user_id: string;
  student_name: string;
  student_enrollment_no: string;
  department_code: DepartmentCode;
  department_name: string;
  title: string;
  location: string;
  description: string;
  priority: PriorityLevel;
  issue_type: IssueType;
  status: ComplaintStatus;
  official_response?: string;
  resolved_at?: string;
  support_count: number;
  attachment_file_id?: string;
  attachment_url?: string;
  $createdAt: string;
  $updatedAt: string;
}

export interface ComplaintSupport {
  $id: string; // Deterministic 32-char SHA-256 hex: hash(`${complaintId}:${userId}`)
  complaint_id: string;
  user_id: string;
  supported_at: string;
}

export interface AdminMetrics {
  total_open: number;
  total_in_progress: number;
  total_resolved: number;
  department_code: DepartmentCode;
}
```

---

## 3. Appwrite Database Collections & Security

All collections use empty document-level permissions (`$permissions = []`) to guarantee that client-side SDK direct queries are denied. All data access occurs exclusively through the trusted server-side `campusvoice-api` Function using an Appwrite Server API key with `databases.write` and `users.read` scopes.

### Collections:
1. **`departments`**:
   - `code`: string (index, unique)
   - `name`: string
   - `is_active`: boolean
2. **`profiles`**:
   - `user_id`: string (index, unique)
   - `name`: string
   - `enrollment_no`: string (index, unique)
   - `department_code`: string
   - `department_name`: string
   - `role`: string ('student' | 'department_admin')
   - `is_locked`: boolean
   - `created_at`: string
   - `updated_at`: string
3. **`complaints`**:
   - `student_user_id`: string (index)
   - `student_name`: string
   - `student_enrollment_no`: string
   - `department_code`: string (index)
   - `department_name`: string
   - `title`: string
   - `location`: string
   - `description`: string (long text)
   - `priority`: string ('low' | 'medium' | 'high')
   - `issue_type`: string ('department' | 'public', index)
   - `status`: string ('open' | 'in_progress' | 'resolved', index)
   - `official_response`: string (optional)
   - `resolved_at`: string (optional)
   - `support_count`: integer (default 0)
   - `attachment_file_id`: string (optional)
4. **`complaint_supports`**:
   - `$id`: string (32-character SHA-256 hex string)
   - `complaint_id`: string (index)
   - `user_id`: string (index)
   - `supported_at`: string

---

## 4. Single Router Appwrite Cloud Function: `campusvoice-api`

### Calling Convention:
- **Method:** `POST`
- **Headers:** `X-Appwrite-JWT: <jwt>` or session cookie, `Content-Type: application/json`
- **Payload Shape:**
  ```json
  {
    "action": "<operation_name>",
    "data": { ... }
  }
  ```
- **Standard Response Shape:**
  - Success: `{ "success": true, "data": ... }` with HTTP 200
  - Error: `{ "success": false, "error": "<message>", "code": "<ERROR_CODE>" }` with HTTP 400, 401, 403, 404, or 500.

---

## 5. Specification for All 11 Operations

### 1. `get-profile`
- **Access:** Authenticated user
- **Input:** `{}`
- **Logic:** Extracts caller `user_id` from validated JWT/session. Queries `profiles` collection for `user_id`.
- **Output:** `{ "profile": UserProfile | null, "is_onboarded": boolean }`

### 2. `complete-onboarding`
- **Access:** Authenticated user with incomplete profile
- **Input:**
  ```json
  {
    "name": "Aarav Sharma",
    "enrollment_no": "246510306054"
  }
  ```
- **Logic:**
  1. Validate `name` (trimmed, 2–100 chars).
  2. Validate `enrollment_no` (12 chars, digits only).
  3. Extract department code using zero-based slice: `enrollment_no.slice(7, 9)`.
  4. Validate department code against active codes (`06` -> Department 1: Information Technology, `07` -> Department 2: Computer Engineering). Reject any other code with `INVALID_DEPARTMENT_CODE`.
  5. Check if profile already exists or is locked. If locked, reject with `PROFILE_ALREADY_LOCKED`.
  6. Check if enrollment number is already registered by another user.
  7. Check if user email is in admin allowlist. If so, assign role `department_admin`; else `student`.
  8. Create document in `profiles` with `is_locked = true`.
- **Output:** `{ "profile": UserProfile }`

### 3. `list-departments`
- **Access:** Authenticated
- **Input:** `{}`
- **Logic:** Returns list of active departments.
- **Output:** `{ "departments": Department[] }`

### 4. `list-complaints`
- **Access:** Authenticated student with complete profile
- **Input:**
  ```json
  {
    "feed_type": "department" | "public",
    "search": "projector",
    "status": "open" | "in_progress" | "resolved",
    "page": 1,
    "limit": 20
  }
  ```
- **Logic:**
  1. If `feed_type === 'department'`, enforce query filter: `department_code == user.department_code`.
  2. If `feed_type === 'public'`, enforce query filter: `issue_type == 'public'`.
  3. Apply optional search and status filters. Apply pagination (max limit: 50).
- **Output:** `{ "complaints": Complaint[], "total": number, "page": number }`

### 5. `create-complaint`
- **Access:** Student with complete profile
- **Input:**
  ```json
  {
    "title": "GPU cluster overheats in Lab 4",
    "location": "IT Building, 3rd Floor, Lab 4",
    "description": "During practical sessions...",
    "priority": "high",
    "issue_type": "department" | "public",
    "attachment_file_id": "optional_file_id"
  }
  ```
- **Logic:**
  1. Resolve `student_name`, `student_enrollment_no`, `department_code`, and `department_name` exclusively from the trusted caller's server profile.
  2. Validate required fields (`title`: 5–150 chars, `location`: 3–100 chars, `description`: 10–2000 chars, `priority`: 'low' | 'medium' | 'high').
  3. Create document in `complaints` with `status: 'open'`, `support_count: 0`.
- **Output:** `{ "complaint": Complaint }`

### 6. `get-complaint`
- **Access:** Authenticated user
- **Input:** `{ "complaint_id": "..." }`
- **Logic:**
  1. Fetch complaint by ID. If not found, return HTTP 404.
  2. If `complaint.issue_type === 'department'` and caller is a student: verify `complaint.department_code === caller.department_code`. If mismatch, **return generic HTTP 404 Not Found** (oracle elimination).
  3. If caller is an admin: verify `complaint.department_code === admin.department_code` or `issue_type === 'public'`. If mismatch, **return generic HTTP 404 Not Found**.
- **Output:** `{ "complaint": Complaint, "has_supported": boolean }`

### 7. `support-complaint`
- **Access:** Eligible student with complete profile
- **Input:** `{ "complaint_id": "..." }`
- **Logic:**
  1. Verify complaint exists and is visible to student (same department or public). If not visible, return HTTP 404.
  2. Check if student is attempting to support their own complaint: allow or handle per policy.
  3. Compute deterministic document ID:
     `docId = crypto.createHash('sha256').update(complaintId + ':' + userId).digest('hex').slice(0, 32)`
  4. Attempt atomic creation of document in `complaint_supports` with `$id = docId`.
  5. If creation succeeds: atomically increment `support_count` on `complaints` document by 1.
  6. If document with `docId` already exists (HTTP 409 Conflict): return `{ "success": false, "code": "ALREADY_SUPPORTED", "message": "You have already supported this complaint." }`.
- **Output:** `{ "success": true, "support_count": number, "has_supported": true }`

### 8. `get-support-state`
- **Access:** Authenticated user
- **Input:** `{ "complaint_id": "..." }`
- **Logic:**
  1. Check if complaint is visible to caller. If not, return HTTP 404.
  2. Check existence of support record with `docId = sha256(complaintId + ':' + userId).slice(0, 32)`.
- **Output:** `{ "support_count": number, "has_supported": boolean }`

### 9. `get-admin-dashboard`
- **Access:** Authorized Department Administrator
- **Input:** `{}`
- **Logic:**
  1. Verify caller has `role === 'department_admin'`.
  2. Compute counts for admin's department: Open, In Progress, Resolved.
- **Output:** `{ "metrics": AdminMetrics }`

### 10. `list-admin-complaints`
- **Access:** Authorized Department Administrator
- **Input:**
  ```json
  {
    "status": "open" | "in_progress" | "resolved",
    "page": 1,
    "limit": 20
  }
  ```
- **Logic:**
  1. Enforce department isolation: Query complaints where `department_code == admin.department_code`.
  2. Admin cannot access Department B complaints under any circumstances.
- **Output:** `{ "complaints": Complaint[], "total": number }`

### 11. `update-admin-complaint`
- **Access:** Authorized Department Administrator within department scope
- **Input:**
  ```json
  {
    "complaint_id": "...",
    "status": "in_progress" | "resolved",
    "official_response": "Maintenance team dispatched to Lab 4. Replacement switch ordered."
  }
  ```
- **Logic:**
  1. Fetch complaint by ID.
  2. Verify complaint belongs to admin's assigned department (`complaint.department_code === admin.department_code`). If not, **return HTTP 404 Not Found**.
  3. Update `status`, `official_response`, and set `resolved_at` if status is 'resolved'.
- **Output:** `{ "complaint": Complaint }`

---

## 6. Implementation Readiness Checklist

- [x] All 7 screens approved in Stitch MCP with minimalist, clean design.
- [x] Route mapping defined for Next.js App Router.
- [x] Full TypeScript interfaces and domain models defined.
- [x] Database schemas and empty-ACL security architecture specified.
- [x] All 11 Appwrite Function operations strictly defined with request/response contracts and oracle elimination.
- [x] Ready to commence **Phase 1: Project Setup**.
