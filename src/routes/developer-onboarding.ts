import { Router, Request, Response } from "express";
import { developerDetailsSchema, propertyDetailsSchema } from "../validations/developer-onboarding";
import { upsertOwner, createProperty, createPropertyDocuments } from "../services/onboarding";

const router = Router();

/**
 * POST /api/developer-onboarding
 * Matches the Next.js route response shape.
 * Note: The Next.js route had optional auth via FEATURES.AUTH_REQUIRED + session.
 * For the Express backend, auth will be handled by a separate middleware in a later step.
 * For now, this route accepts anonymous submissions (MVP requirement from original).
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // 1. Validate Owner Details
    const ownerValidation = developerDetailsSchema.safeParse(body.owner);
    if (!ownerValidation.success) {
      const { fieldErrors, formErrors } = ownerValidation.error.flatten();
      res.status(400).json({
        error: "Invalid owner details",
        details: { fieldErrors, formErrors },
      });
      return;
    }

    // 2. Validate Property Details (transforming numbers)
    const propertyValidation = propertyDetailsSchema.safeParse(body.property);
    if (!propertyValidation.success) {
      const { fieldErrors, formErrors } = propertyValidation.error.flatten();
      res.status(400).json({
        error: "Invalid property details",
        details: { fieldErrors, formErrors },
      });
      return;
    }

    const { owner, documents } = body;
    const validatedProperty = propertyValidation.data;

    // 3. Database Operations
    let ownerId;
    try {
      ownerId = await upsertOwner({
        name: owner.name,
        email: owner.email,
        phone: owner.phone,
        address: owner.address,
      });
    } catch (error) {
      console.error("Error creating owner:", error);
      res.status(500).json({
        error: "Could not process owner details. Please try again.",
      });
      return;
    }

    let propertyId;
    try {
      propertyId = await createProperty(ownerId, {
        title: validatedProperty.title,
        type: validatedProperty.type,
        location: validatedProperty.location,
        built_up_area: validatedProperty.builtUpArea,
        carpet_area: validatedProperty.carpetArea,
        expected_valuation: validatedProperty.expectedValuation,
      });
    } catch (error) {
      console.error("Error creating property:", error);
      res.status(500).json({
        error: "Could not process property details. Please try again.",
      });
      return;
    }

    if (documents && Array.isArray(documents) && documents.length > 0) {
      try {
        await createPropertyDocuments(propertyId, documents);
      } catch (error) {
        console.error("Error creating documents:", error);
        res.status(500).json({
          error: "Could not save documents. Please try again.",
        });
        return;
      }
    }

    res.status(201).json({
      message: "Application submitted successfully",
      propertyId: propertyId,
    });
  } catch (error) {
    console.error("Owner Onboarding Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
