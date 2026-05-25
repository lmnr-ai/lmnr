import { z } from "zod/v4";

export const SchemaFieldTypeSchema = z.enum(["string", "number", "boolean", "enum"]);
export type SchemaFieldType = z.infer<typeof SchemaFieldTypeSchema>;

export const SchemaFieldSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: SchemaFieldTypeSchema,
  enumValues: z.array(z.string()).optional(),
});
export type SchemaField = z.infer<typeof SchemaFieldSchema>;

export const SCHEMA_FIELD_TYPES: { value: SchemaFieldType; label: string }[] = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "enum", label: "Enum" },
];

const JsonSchemaPropertySchema = z.object({
  type: z.string().optional(),
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
});

const JsonSchemaSchema = z.object({
  type: z.literal("object").optional(),
  properties: z.record(z.string(), JsonSchemaPropertySchema).optional(),
  required: z.array(z.string()).optional(),
});

export const schemaFieldsToJsonSchema = (fields: SchemaField[]): Record<string, unknown> => {
  const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
  const required: string[] = [];

  for (const field of fields) {
    if (field.name.trim()) {
      const prop: { type: string; description: string; enum?: string[] } = {
        type: field.type === "enum" ? "string" : field.type,
        description: field.description,
      };

      // Add enum values if type is enum
      if (field.type === "enum" && field.enumValues && field.enumValues.length > 0) {
        prop.enum = field.enumValues;
      }

      properties[field.name] = prop;
      required.push(field.name);
    }
  }

  return {
    type: "object",
    properties,
    required,
  };
};

export const jsonSchemaToSchemaFields = (schema: unknown): SchemaField[] => {
  const parsed = JsonSchemaSchema.safeParse(schema);

  if (!parsed.success || !parsed.data.properties) {
    return [{ name: "", description: "", type: "string" }];
  }

  const fields: SchemaField[] = [];

  for (const [name, prop] of Object.entries(parsed.data.properties)) {
    const hasEnum = prop.enum && prop.enum.length > 0;

    // If it has enum values, treat it as enum type
    if (hasEnum) {
      fields.push({
        name,
        description: prop.description || "",
        type: "enum",
        enumValues: prop.enum,
      });
    } else {
      const type = prop.type || "string";
      const validType = SchemaFieldTypeSchema.safeParse(type);

      fields.push({
        name,
        description: prop.description || "",
        type: validType.success ? validType.data : "string",
      });
    }
  }

  return fields.length > 0 ? fields : [{ name: "", description: "", type: "string" }];
};

export const getDefaultSchemaFields = (): SchemaField[] => [{ name: "", description: "", type: "string" }];
