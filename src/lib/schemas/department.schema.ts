import { z } from 'zod';

export const DepartmentScopesSchema = z
  .object({
    maintenance: z.boolean(),
    academic: z.boolean(),
  })
  .refine(
    (scopes) => scopes.maintenance || scopes.academic,
    'At least one scope (Maintenance or Academic) must be selected'
  );

export const CreateDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Department name must be at least 2 characters')
    .max(100, 'Department name cannot exceed 100 characters'),
  code: z
    .string()
    .trim()
    .min(2, 'Department code must be at least 2 characters')
    .max(10, 'Department code cannot exceed 10 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Department code must contain only uppercase letters, digits, underscores, or hyphens'),
  admin_email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please provide a valid administrator email address'),
  scopes: DepartmentScopesSchema,
});

export type CreateDepartmentSchemaInput = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = z.object({
  department_id: z.string().trim().min(1, 'Department ID is required'),
  name: z
    .string()
    .trim()
    .min(2, 'Department name must be at least 2 characters')
    .max(100, 'Department name cannot exceed 100 characters')
    .optional(),
  code: z
    .string()
    .trim()
    .min(2, 'Department code must be at least 2 characters')
    .max(10, 'Department code cannot exceed 10 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Department code must contain only uppercase letters, digits, underscores, or hyphens')
    .optional(),
  admin_email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please provide a valid administrator email address')
    .optional(),
  scopes: DepartmentScopesSchema.optional(),
});

export type UpdateDepartmentSchemaInput = z.infer<typeof UpdateDepartmentSchema>;
