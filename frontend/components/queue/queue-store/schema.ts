export interface TargetField {
  key: string;
  type: "number" | "enum" | "boolean" | "string";
  description?: string;
  options?: string[] | { min?: number; max?: number };
}

/**
 * Parse a JSON Schema-like annotation definition into a flat list of `TargetField`s
 * the annotation interface can render. Capped at 9 fields so the 1-9 hotkey
 * shortcuts in `annotation-interface.tsx` never collide.
 */
export const parseAnnotationSchema = (schema: Record<string, unknown> | null): TargetField[] => {
  if (!schema || typeof schema !== "object" || !schema.properties) {
    return [];
  }

  const properties = schema.properties as Record<string, any>;
  const fields: TargetField[] = [];

  for (const [key, property] of Object.entries(properties)) {
    if (typeof property !== "object") continue;

    const description = property.description;
    const type = property.type;

    if (property.enum && Array.isArray(property.enum)) {
      fields.push({
        key,
        type: "enum",
        description,
        options: property.enum.map((v: any) => String(v)),
      });
    } else if (!type) {
      continue;
    } else if (type === "string") {
      fields.push({ key, type: "string", description });
    } else if (type === "number" || type === "integer") {
      const min = property.minimum ?? 1;
      const max = property.maximum ?? 5;
      fields.push({ key, type: "number", description, options: { min, max } });
    } else if (type === "boolean") {
      fields.push({ key, type: "boolean", description });
    }
  }

  return fields.slice(0, 9);
};
