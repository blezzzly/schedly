import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),
});

const step1Schema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name is too long")
    .regex(/^[a-zA-Z\s'-]+$/, "First name contains invalid characters"),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name is too long")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name contains invalid characters"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
});

const step2Schema = z.object({
  school: z.string().optional(),
  course: z.string().optional(),
  year: z.string().optional(),
});

const step3Schema = z
  .object({
    password: z
      .string()
      .min(1, "Password is required")
      .min(10, "Password must be at least 10 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=<>?/{}~|])/,
        "Password must contain uppercase, lowercase, number, and special character"
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const registerStep1Schema = step1Schema;
export const registerStep2Schema = step2Schema;
export const registerStep3Schema = step3Schema;

export const registerSchema = step1Schema.merge(step2Schema).merge(step3Schema);

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterStep1Input = z.infer<typeof step1Schema>;
export type RegisterStep2Input = z.infer<typeof step2Schema>;
export type RegisterStep3Input = z.infer<typeof step3Schema>;
export type RegisterInput = z.infer<typeof registerSchema>;
