import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

export const registerSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .regex(/[A-Z]/, { message: "One uppercase letter required" })
    .regex(/[a-z]/, { message: "One lowercase letter required" })
    .regex(/[0-9]/, { message: "One number required" })
    .regex(/[^A-Za-z0-9]/, { message: "One special character required" }),
});

export const waitlistSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  name: z.string().optional(),
});
