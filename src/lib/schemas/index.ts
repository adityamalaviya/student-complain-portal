import { z } from 'zod';
import {
  extractAndMapEnrollment,
  isAcademicDepartment,
  isMaintenanceDepartment,
} from '../utils/department';

/**
 * CampusVoice — Authoritative Zod Schemas (Day 1: Domain & Database Foundation)
 * 
 * Strict runtime validation conforming to:
 * - 10-digit Indian mobile number format: /^[6-9]\d{9}$/
 * - 12-digit numeric enrollment with characters 8-9 zero-based slice [7:9]
 * - Dual department IDs (student_department_id and maintenance_department_id)
 * - Complete removal of public complaints (no issue_type)
 * - Timeline entries replacing direct complaint document mutation
 * - Phone change requests and Principal warnings
 * - Rejection of unconfirmed or guessed department codes
 * - Barring non-academic departments from academic administrative scope
 */

// ==========================================
// Primitives
// ==========================================

export const PhoneNumberSchema = z
  .string()
  .trim()
  .regex(
    /^[6-9]\d{9}$/,
    'Phone number must be exactly 10 digits and begin with 6, 7, 8, or 9'
  );

export const EnrollmentNumberSchema = z
  .string()
  .trim()
  .length(12, 'Enrollment number must be exactly 12 digits')
  .regex(/^\d{12}$/, 'Enrollment number must contain only numeric digits')
  .superRefine((val, ctx) => {
    const res = extractAndMapEnrollment(val);
    if (!res.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: res.error || 'Enrollment number department code is unmapped or invalid',
      });
    }
  });

// ==========================================
// Onboarding & Profiles
// ==========================================

export const OnboardingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .regex(/^[a-zA-Z\s.'-]+$/, 'Name contains invalid characters'),
  enrollment_no: EnrollmentNumberSchema,
  phone_number: PhoneNumberSchema,
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;

export const StrictOnboardingSchema = OnboardingSchema;

export type StrictOnboardingInput = z.infer<typeof StrictOnboardingSchema>;

// ==========================================
// Department Schemas
// ==========================================

export const DepartmentSchema = z.object({
  code: z.string().trim().min(1).max(10),
  name: z.string().trim().min(2).max(100),
  is_academic: z.boolean(),
  is_maintenance: z.boolean(),
  is_active: z.boolean().default(true),
});

export type DepartmentInput = z.infer<typeof DepartmentSchema>;

// ==========================================
// Complaints
// ==========================================

export const ComplaintCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Title must be at least 5 characters')
    .max(150, 'Title cannot exceed 150 characters'),
  maintenance_department_id: z
    .string()
    .trim()
    .min(1, 'Please select a maintenance department')
    .refine(
      (val) => isMaintenanceDepartment(val),
      'Please select a valid active maintenance department'
    ),
  location: z
    .string()
    .trim()
    .min(3, 'Location must be at least 3 characters')
    .max(100, 'Location cannot exceed 100 characters'),
  description: z
    .string()
    .trim()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description cannot exceed 2000 characters'),
  priority: z.enum(['low', 'medium', 'high']),
  attachment_file_id: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/, 'Invalid attachment file ID format')
    .optional(),
});

export type ComplaintCreateInput = z.infer<typeof ComplaintCreateSchema>;

export const StrictComplaintCreateSchema = ComplaintCreateSchema;
export type StrictComplaintCreateInput = z.infer<typeof StrictComplaintCreateSchema>;

// ==========================================
// Community Support
// ==========================================

export const ComplaintSupportSchema = z.object({
  complaint_id: z.string().trim().min(1, 'Complaint ID is required'),
});

export type ComplaintSupportInput = z.infer<typeof ComplaintSupportSchema>;

// ==========================================
// Complaint Timeline
// ==========================================

export const TimelineEntryCreateSchema = z
  .object({
    complaint_id: z.string().trim().min(1, 'Complaint ID is required'),
    entry_type: z.enum([
      'status_change',
      'progress_update',
      'clarification_request',
      'clarification_reply',
      'admin_response',
    ]),
    content: z
      .string()
      .trim()
      .min(5, 'Timeline entry content must be at least 5 characters')
      .max(2000, 'Timeline entry content cannot exceed 2000 characters'),
    new_status: z
      .enum(['Pending', 'In Progress', 'Resolved', 'pending', 'in_progress', 'resolved'])
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.entry_type === 'status_change' && !val.new_status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "new_status is required when entry_type is 'status_change'",
        path: ['new_status'],
      });
    }
  });

export type TimelineEntryCreateInput = z.infer<typeof TimelineEntryCreateSchema>;

// ==========================================
// Phone Change Request
// ==========================================

export const PhoneChangeRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Reason must be at least 10 characters')
    .max(1000, 'Reason cannot exceed 1000 characters'),
  requested_phone_number: PhoneNumberSchema.optional(),
});

export type PhoneChangeRequestInput = z.infer<typeof PhoneChangeRequestSchema>;

export const PhoneChangeReviewSchema = z.object({
  request_id: z.string().trim().min(1, 'Request ID is required'),
  decision: z.enum(['approved', 'rejected']),
  decision_reason: z
    .string()
    .trim()
    .min(5, 'Decision reason must be at least 5 characters')
    .max(1000, 'Decision reason cannot exceed 1000 characters'),
});

export type PhoneChangeReviewInput = z.infer<typeof PhoneChangeReviewSchema>;

export const PhoneChangeCompleteSchema = z.object({
  new_phone_number: PhoneNumberSchema,
});

export type PhoneChangeCompleteInput = z.infer<typeof PhoneChangeCompleteSchema>;

// ==========================================
// Principal Warnings
// ==========================================

export const WarningCreateSchema = z.object({
  complaint_id: z.string().trim().min(1, 'Complaint ID is required'),
  warning_reason: z
    .string()
    .trim()
    .min(10, 'Warning reason must be at least 10 characters')
    .max(2000, 'Warning reason cannot exceed 2000 characters'),
});

export type WarningCreateInput = z.infer<typeof WarningCreateSchema>;

export const WarningResponseSchema = z.object({
  warning_id: z.string().trim().min(1, 'Warning ID is required'),
  admin_response: z
    .string()
    .trim()
    .min(10, 'Admin response must be at least 10 characters')
    .max(2000, 'Admin response cannot exceed 2000 characters'),
});

export type WarningResponseInput = z.infer<typeof WarningResponseSchema>;

// ==========================================
// Department Admin Assignments & Audit
// ==========================================

export const AdminAssignmentSchema = z
  .object({
    user_id: z.string().trim().min(1, 'User ID is required'),
    email: z.string().trim().email('Must be a valid email'),
    department_id: z.string().trim().min(1, 'Department ID is required'),
    scope: z.enum(['academic', 'maintenance']),
  })
  .superRefine((val, ctx) => {
    if (val.scope === 'academic' && !isAcademicDepartment(val.department_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Academic scope cannot be assigned to maintenance-only departments (Water or Sanitation)',
        path: ['scope'],
      });
    }
  });

export type AdminAssignmentInput = z.infer<typeof AdminAssignmentSchema>;

export const AuditLogSchema = z.object({
  action: z.string().trim().min(1),
  actor_id: z.string().trim().min(1),
  actor_role: z.enum(['student', 'department_admin', 'principal', 'system']),
  target_resource_id: z.string().trim().min(1),
  target_resource_type: z.string().trim().min(1),
  details: z.string(),
});

export type AuditLogInput = z.infer<typeof AuditLogSchema>;

// ==========================================
// Legacy Compatibility
// ==========================================

export const AdminResolutionSchema = z.object({
  status: z.enum(['Pending', 'In Progress', 'Resolved', 'open', 'in_progress', 'resolved']),
  official_response: z
    .string()
    .trim()
    .min(5, 'Official response must be at least 5 characters')
    .max(1000, 'Official response cannot exceed 1000 characters'),
});

export type AdminResolutionInput = z.infer<typeof AdminResolutionSchema>;
