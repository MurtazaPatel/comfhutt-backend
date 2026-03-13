import { z } from "zod";

export const developerDetailsSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  address: z.string().min(5, "Address must be at least 5 characters"),
  // File uploads will be handled separately in the component state or as strings if already uploaded
});

// For the form input, we treat numbers as strings initially
export const propertyDetailsFormSchema = z.object({
  title: z.string().min(3, "Property title must be at least 3 characters"),
  type: z.enum(["Apartment", "Villa", "Commercial", "Land", "Other"]),
  location: z.string().min(3, "Location is required"),
  builtUpArea: z.string().min(1, "Built-up area is required"),
  carpetArea: z.string().min(1, "Carpet area is required"),
  expectedValuation: z.string().min(1, "Expected valuation is required"),
});

// For the API submission, we transform them
export const propertyDetailsSchema = propertyDetailsFormSchema.transform((data) => ({
  ...data,
  builtUpArea: Number(data.builtUpArea),
  carpetArea: Number(data.carpetArea),
  expectedValuation: Number(data.expectedValuation),
}));

// We'll combine these for the full form state
export const onboardingFormSchema = z.object({
  developer: developerDetailsSchema,
  property: propertyDetailsSchema,
  // Documents are managed via state/separately due to file handling complexities in pure zod forms without server actions immediately
});

export type DeveloperDetails = z.infer<typeof developerDetailsSchema>;
export type PropertyDetails = z.infer<typeof propertyDetailsFormSchema>;
export type PropertyDetailsTransformed = z.infer<typeof propertyDetailsSchema>;
