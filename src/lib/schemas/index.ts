import { z } from 'zod';

export const EnrollmentNumberSchema = z
  .string()
  .trim()
  .length(12, 'Enrollment number must be exactly 12 digits')
  .regex(/^\d{12}$/, 'Enrollment number must contain only numeric digits')
  .refine(
    (val) => {
      const code = val.slice(7, 9);
      return code === '06' || code === '07';
    },
    {
      message: 'Department code in enrollment number must be 06 (Civil) or 07 (Computer)',
    }
  );

export const OnboardingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  enrollment_no: EnrollmentNumberSchema,
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;

export const ComplaintCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Title must be at least 5 characters')
    .max(150, 'Title cannot exceed 150 characters'),
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
  issue_type: z.enum(['department', 'public']),
  attachment_file_id: z.string().optional(),
});

export type ComplaintCreateInput = z.infer<typeof ComplaintCreateSchema>;

export const AdminResolutionSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']),
  official_response: z
    .string()
    .trim()
    .min(5, 'Official response must be at least 5 characters')
    .max(1000, 'Official response cannot exceed 1000 characters'),
});

export type AdminResolutionInput = z.infer<typeof AdminResolutionSchema>;
