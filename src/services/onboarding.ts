import { supabase } from "../lib/db";

export async function upsertOwner(
  owner: { name: string; email: string; phone: string; address: string },
) {
  const { data: ownerId, error } = await supabase.rpc("upsert_owner", {
    _name: owner.name,
    _email: owner.email,
    _phone: owner.phone,
    _address: owner.address,
  });

  if (error) {
    throw new Error(`Error creating owner: ${error.message}`);
  }

  if (!ownerId || typeof ownerId !== "string") {
    throw new Error("Upserted owner did not return a valid ID");
  }
  return ownerId;
}

export async function createProperty(
  ownerId: string,
  property: {
    title: string;
    type: string;
    location: string;
    built_up_area: number;
    carpet_area: number;
    expected_valuation: number;
  }
) {
  const { data: propertyId, error } = await supabase.rpc("create_property", {
    _owner_id: ownerId,
    _title: property.title,
    _type: property.type,
    _location: property.location,
    _built_up_area: property.built_up_area,
    _carpet_area: property.carpet_area,
    _expected_valuation: property.expected_valuation,
  });

  if (error) {
    throw new Error(`Error creating property: ${error.message}`);
  }

  if (!propertyId || typeof propertyId !== "string") {
    throw new Error("Created property did not return a valid ID");
  }
  return propertyId;
}

export async function createPropertyDocuments(
  propertyId: string,
  documents: Array<{ type: string; url: string }>
) {
  if (!documents || documents.length === 0) return;

  const { error } = await supabase.rpc("create_property_documents", {
    _property_id: propertyId,
    _documents: documents,
  });

  if (error) {
    throw new Error(`Error creating documents: ${error.message}`);
  }
}
