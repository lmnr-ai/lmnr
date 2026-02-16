// ClickHouse function signatures with parameter information
// Based on ClickHouse documentation (2026)

export interface FunctionParameter {
  name: string;
  type: string;
  description: string;
  optional?: boolean;
}

export interface FunctionSignature {
  name: string;
  parameters: FunctionParameter[];
  returnType: string;
  description: string;
}

export const clickhouseFunctionSignatures: Record<string, FunctionSignature> = {
  // Array functions
  arrayMap: {
    name: "arrayMap",
    parameters: [
      { name: "func", type: "lambda", description: "Lambda function to apply to each element" },
      { name: "arr", type: "Array(T)", description: "Source array to process" },
    ],
    returnType: "Array(T)",
    description: "Applies a lambda function to each element of an array",
  },
  arrayFilter: {
    name: "arrayFilter",
    parameters: [
      { name: "func", type: "lambda", description: "Lambda function that returns true/false" },
      { name: "arr", type: "Array(T)", description: "Array to filter" },
    ],
    returnType: "Array(T)",
    description: "Returns array containing only elements where lambda returns true",
  },
  arrayExists: {
    name: "arrayExists",
    parameters: [
      { name: "func", type: "lambda", description: "Lambda function to test elements" },
      { name: "arr", type: "Array(T)", description: "Array to check" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if at least one element satisfies the lambda condition",
  },
  arrayAll: {
    name: "arrayAll",
    parameters: [
      { name: "func", type: "lambda", description: "Lambda function to test elements" },
      { name: "arr", type: "Array(T)", description: "Array to check" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if all elements satisfy the lambda condition",
  },
  arrayCount: {
    name: "arrayCount",
    parameters: [
      { name: "func", type: "lambda", description: "Lambda function to test elements", optional: true },
      { name: "arr", type: "Array(T)", description: "Array to count elements in" },
    ],
    returnType: "UInt32",
    description: "Counts elements where lambda returns true, or non-zero elements if no lambda",
  },
  arrayReduce: {
    name: "arrayReduce",
    parameters: [
      { name: "agg_func", type: "String", description: "Name of aggregate function (e.g., 'max', 'sum')" },
      { name: "arr", type: "Array(T)", description: "Array to reduce" },
    ],
    returnType: "T",
    description: "Applies an aggregate function to array elements",
  },
  arraySlice: {
    name: "arraySlice",
    parameters: [
      { name: "arr", type: "Array(T)", description: "Array to slice" },
      { name: "offset", type: "Int", description: "Starting position (1-based, negative counts from end)" },
      { name: "length", type: "Int", description: "Length of slice", optional: true },
    ],
    returnType: "Array(T)",
    description: "Returns a slice of the array",
  },
  has: {
    name: "has",
    parameters: [
      { name: "arr", type: "Array(T)", description: "Array to search in" },
      { name: "elem", type: "T", description: "Element to search for" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if array contains the element",
  },
  indexOf: {
    name: "indexOf",
    parameters: [
      { name: "arr", type: "Array(T)", description: "Array to search in" },
      { name: "elem", type: "T", description: "Element to find" },
    ],
    returnType: "UInt64",
    description: "Returns index of first occurrence (1-based), or 0 if not found",
  },

  // Tuple functions
  tupleElement: {
    name: "tupleElement",
    parameters: [
      { name: "tuple", type: "Tuple(T)", description: "Tuple or array of tuples" },
      { name: "index_or_name", type: "Int|String", description: "Element index (1-based) or name" },
      { name: "default_value", type: "Any", description: "Value to return if element doesn't exist", optional: true },
    ],
    returnType: "T",
    description: "Extracts an element from a tuple by index or name",
  },
  tuplePlus: {
    name: "tuplePlus",
    parameters: [
      { name: "t1", type: "Tuple", description: "First tuple" },
      { name: "t2", type: "Tuple", description: "Second tuple" },
    ],
    returnType: "Tuple",
    description: "Adds corresponding elements of two tuples",
  },
  tupleMinus: {
    name: "tupleMinus",
    parameters: [
      { name: "t1", type: "Tuple", description: "First tuple" },
      { name: "t2", type: "Tuple", description: "Second tuple to subtract" },
    ],
    returnType: "Tuple",
    description: "Subtracts corresponding elements of two tuples",
  },

  // String functions
  substring: {
    name: "substring",
    parameters: [
      { name: "s", type: "String", description: "String to extract from" },
      { name: "offset", type: "Int", description: "Starting position (1-based)" },
      { name: "length", type: "Int", description: "Number of characters to extract", optional: true },
    ],
    returnType: "String",
    description: "Returns a substring starting at offset",
  },
  concat: {
    name: "concat",
    parameters: [
      { name: "s1", type: "String", description: "First string" },
      { name: "...", type: "String", description: "Additional strings to concatenate" },
    ],
    returnType: "String",
    description: "Concatenates strings",
  },
  replace: {
    name: "replace",
    parameters: [
      { name: "haystack", type: "String", description: "String to search in" },
      { name: "pattern", type: "String", description: "Substring to find" },
      { name: "replacement", type: "String", description: "Replacement string" },
    ],
    returnType: "String",
    description: "Replaces all occurrences of pattern with replacement",
  },
  replaceRegexpAll: {
    name: "replaceRegexpAll",
    parameters: [
      { name: "haystack", type: "String", description: "String to search in" },
      { name: "pattern", type: "String", description: "Regular expression pattern" },
      { name: "replacement", type: "String", description: "Replacement string (supports \\0-\\9)" },
    ],
    returnType: "String",
    description: "Replaces all regex matches with replacement",
  },
  splitByChar: {
    name: "splitByChar",
    parameters: [
      { name: "separator", type: "String", description: "Single character to split by" },
      { name: "s", type: "String", description: "String to split" },
    ],
    returnType: "Array(String)",
    description: "Splits string by character into array",
  },

  // DateTime functions
  toDateTime: {
    name: "toDateTime",
    parameters: [
      { name: "expr", type: "String|Int|Date", description: "Value to convert" },
      { name: "timezone", type: "String", description: "Timezone (e.g., 'UTC', 'America/New_York')", optional: true },
    ],
    returnType: "DateTime",
    description: "Converts value to DateTime",
  },
  toDateTime64: {
    name: "toDateTime64",
    parameters: [
      { name: "expr", type: "String|Int|Date", description: "Value to convert" },
      { name: "scale", type: "UInt8", description: "Precision: 0-9 (e.g., 3 for milliseconds)" },
      { name: "timezone", type: "String", description: "Timezone", optional: true },
    ],
    returnType: "DateTime64",
    description: "Converts value to DateTime64 with subsecond precision",
  },
  formatDateTime: {
    name: "formatDateTime",
    parameters: [
      { name: "datetime", type: "DateTime", description: "Date or datetime to format" },
      { name: "format", type: "String", description: "Format string (MySQL style, e.g., '%Y-%m-%d')" },
      { name: "timezone", type: "String", description: "Timezone", optional: true },
    ],
    returnType: "String",
    description: "Formats datetime according to format string",
  },
  dateDiff: {
    name: "dateDiff",
    parameters: [
      { name: "unit", type: "String", description: "Unit: 'second', 'minute', 'hour', 'day', 'week', 'month', 'year'" },
      { name: "startdate", type: "DateTime", description: "Start date (subtrahend)" },
      { name: "enddate", type: "DateTime", description: "End date (minuend)" },
      { name: "timezone", type: "String", description: "Timezone", optional: true },
    ],
    returnType: "Int64",
    description: "Calculates difference between dates in specified units",
  },
  toStartOfInterval: {
    name: "toStartOfInterval",
    parameters: [
      { name: "value", type: "DateTime", description: "Date or datetime to round" },
      { name: "interval", type: "INTERVAL", description: "Interval (e.g., INTERVAL 15 MINUTE)" },
      { name: "timezone", type: "String", description: "Timezone", optional: true },
    ],
    returnType: "DateTime",
    description: "Rounds down to start of specified interval",
  },

  // Conditional functions
  if: {
    name: "if",
    parameters: [
      { name: "cond", type: "UInt8", description: "Condition to evaluate" },
      { name: "then", type: "T", description: "Value to return if condition is true" },
      { name: "else", type: "T", description: "Value to return if condition is false or NULL" },
    ],
    returnType: "T",
    description: "Returns then or else based on condition",
  },
  multiIf: {
    name: "multiIf",
    parameters: [
      { name: "cond_1", type: "UInt8", description: "First condition" },
      { name: "then_1", type: "T", description: "Value if first condition is true" },
      { name: "...", type: "...", description: "Additional condition-value pairs" },
      { name: "else", type: "T", description: "Default value if no conditions match" },
    ],
    returnType: "T",
    description: "Evaluates conditions sequentially and returns matching value",
  },
  coalesce: {
    name: "coalesce",
    parameters: [
      { name: "x", type: "Any", description: "First value to check" },
      { name: "...", type: "Any", description: "Additional values to check" },
    ],
    returnType: "T",
    description: "Returns first non-NULL value",
  },

  // Aggregation functions
  count: {
    name: "count",
    parameters: [
      { name: "expr", type: "Any", description: "Expression or column to count", optional: true },
    ],
    returnType: "UInt64",
    description: "Counts rows or non-NULL values",
  },
  sum: {
    name: "sum",
    parameters: [
      { name: "x", type: "Numeric", description: "Values to sum" },
    ],
    returnType: "Numeric",
    description: "Calculates sum of values",
  },
  avg: {
    name: "avg",
    parameters: [
      { name: "x", type: "Numeric", description: "Values to average" },
    ],
    returnType: "Float64",
    description: "Calculates arithmetic mean",
  },
  groupArray: {
    name: "groupArray",
    parameters: [
      { name: "x", type: "Any", description: "Values to collect into array" },
      { name: "max_size", type: "UInt", description: "Maximum array size", optional: true },
    ],
    returnType: "Array(T)",
    description: "Creates array of values from group",
  },
  uniq: {
    name: "uniq",
    parameters: [
      { name: "x", type: "Any", description: "Values to count unique occurrences of" },
    ],
    returnType: "UInt64",
    description: "Counts approximate number of unique values",
  },
  quantile: {
    name: "quantile",
    parameters: [
      { name: "level", type: "Float", description: "Quantile level (0 to 1, e.g., 0.5 for median)", optional: true },
      { name: "x", type: "Numeric", description: "Values to calculate quantile of" },
    ],
    returnType: "Float64",
    description: "Calculates approximate quantile",
  },

  // JSON functions
  JSONExtract: {
    name: "JSONExtract",
    parameters: [
      { name: "json", type: "String", description: "JSON string to parse" },
      { name: "path...", type: "String|Int", description: "Path elements (keys or indices)", optional: true },
      { name: "return_type", type: "String", description: "ClickHouse type to extract (e.g., 'String', 'Int64')" },
    ],
    returnType: "T",
    description: "Extracts value from JSON with specified type",
  },
  JSONExtractString: {
    name: "JSONExtractString",
    parameters: [
      { name: "json", type: "String", description: "JSON string to parse" },
      { name: "path...", type: "String|Int", description: "Path elements (keys or indices)", optional: true },
    ],
    returnType: "String",
    description: "Extracts string value from JSON",
  },
  JSONExtractInt: {
    name: "JSONExtractInt",
    parameters: [
      { name: "json", type: "String", description: "JSON string to parse" },
      { name: "path...", type: "String|Int", description: "Path elements (keys or indices)", optional: true },
    ],
    returnType: "Int64",
    description: "Extracts integer value from JSON",
  },
  JSONExtractFloat: {
    name: "JSONExtractFloat",
    parameters: [
      { name: "json", type: "String", description: "JSON string to parse" },
      { name: "path...", type: "String|Int", description: "Path elements (keys or indices)", optional: true },
    ],
    returnType: "Float64",
    description: "Extracts float value from JSON",
  },
  JSONExtractBool: {
    name: "JSONExtractBool",
    parameters: [
      { name: "json", type: "String", description: "JSON string to parse" },
      { name: "path...", type: "String|Int", description: "Path elements (keys or indices)", optional: true },
    ],
    returnType: "Bool",
    description: "Extracts boolean value from JSON",
  },
  JSONExtractArrayRaw: {
    name: "JSONExtractArrayRaw",
    parameters: [
      { name: "json", type: "String", description: "JSON string to parse" },
      { name: "path...", type: "String|Int", description: "Path elements (keys or indices)", optional: true },
    ],
    returnType: "Array(String)",
    description: "Extracts array as raw unparsed strings",
  },
  JSONExtractKeys: {
    name: "JSONExtractKeys",
    parameters: [
      { name: "json", type: "String", description: "JSON string to parse" },
      { name: "path...", type: "String|Int", description: "Path elements to navigate to object", optional: true },
    ],
    returnType: "Array(String)",
    description: "Extracts keys from JSON object",
  },
  JSONHas: {
    name: "JSONHas",
    parameters: [
      { name: "json", type: "String", description: "JSON string" },
      { name: "path...", type: "String|Int", description: "Path elements to check", optional: true },
    ],
    returnType: "UInt8",
    description: "Returns 1 if path exists in JSON",
  },
  JSONLength: {
    name: "JSONLength",
    parameters: [
      { name: "json", type: "String", description: "JSON string" },
      { name: "path...", type: "String|Int", description: "Path to array or object", optional: true },
    ],
    returnType: "UInt64",
    description: "Returns length of JSON array or number of keys in object",
  },
  JSONType: {
    name: "JSONType",
    parameters: [
      { name: "json", type: "String", description: "JSON string" },
      { name: "path...", type: "String|Int", description: "Path to element", optional: true },
    ],
    returnType: "String",
    description: "Returns type of JSON value ('Object', 'Array', 'String', 'Int', etc.)",
  },
  JSONExtractRaw: {
    name: "JSONExtractRaw",
    parameters: [
      { name: "json", type: "String", description: "JSON string to parse" },
      { name: "path...", type: "String|Int", description: "Path elements to navigate", optional: true },
    ],
    returnType: "String",
    description: "Extracts part of JSON as unparsed string",
  },
  simpleJSONExtractString: {
    name: "simpleJSONExtractString",
    parameters: [
      { name: "json", type: "String", description: "JSON string (simplified format)" },
      { name: "field_name", type: "String", description: "Field name to extract" },
    ],
    returnType: "String",
    description: "Fast extraction of string from JSON (with simplifying assumptions)",
  },
  simpleJSONExtractInt: {
    name: "simpleJSONExtractInt",
    parameters: [
      { name: "json", type: "String", description: "JSON string (simplified format)" },
      { name: "field_name", type: "String", description: "Field name to extract" },
    ],
    returnType: "Int64",
    description: "Fast extraction of integer from JSON (with simplifying assumptions)",
  },
  simpleJSONExtractFloat: {
    name: "simpleJSONExtractFloat",
    parameters: [
      { name: "json", type: "String", description: "JSON string (simplified format)" },
      { name: "field_name", type: "String", description: "Field name to extract" },
    ],
    returnType: "Float64",
    description: "Fast extraction of float from JSON (with simplifying assumptions)",
  },
  simpleJSONExtractBool: {
    name: "simpleJSONExtractBool",
    parameters: [
      { name: "json", type: "String", description: "JSON string (simplified format)" },
      { name: "field_name", type: "String", description: "Field name to extract" },
    ],
    returnType: "UInt8",
    description: "Fast extraction of boolean from JSON (with simplifying assumptions)",
  },
  simpleJSONExtractRaw: {
    name: "simpleJSONExtractRaw",
    parameters: [
      { name: "json", type: "String", description: "JSON string (simplified format)" },
      { name: "field_name", type: "String", description: "Field name to extract" },
    ],
    returnType: "String",
    description: "Fast extraction of raw JSON value (with simplifying assumptions)",
  },
  simpleJSONHas: {
    name: "simpleJSONHas",
    parameters: [
      { name: "json", type: "String", description: "JSON string" },
      { name: "field_name", type: "String", description: "Field name to check" },
    ],
    returnType: "UInt8",
    description: "Fast check if field exists (with simplifying assumptions)",
  },

  // Type conversion
  cast: {
    name: "cast",
    parameters: [
      { name: "x", type: "Any", description: "Value to convert" },
      { name: "type", type: "String", description: "Target type (e.g., 'Int32', 'String')" },
    ],
    returnType: "T",
    description: "Converts value to specified type",
  },
  toDate: {
    name: "toDate",
    parameters: [
      { name: "x", type: "String|Int|DateTime", description: "Value to convert to Date" },
    ],
    returnType: "Date",
    description: "Converts to Date type",
  },

  // Math functions
  round: {
    name: "round",
    parameters: [
      { name: "x", type: "Numeric", description: "Number to round" },
      { name: "n", type: "Int", description: "Number of decimal places", optional: true },
    ],
    returnType: "Numeric",
    description: "Rounds to nearest integer or specified decimal places",
  },
  pow: {
    name: "pow",
    parameters: [
      { name: "x", type: "Numeric", description: "Base" },
      { name: "y", type: "Numeric", description: "Exponent" },
    ],
    returnType: "Float64",
    description: "Returns x raised to the power of y",
  },
  greatest: {
    name: "greatest",
    parameters: [
      { name: "x1", type: "Any", description: "First value" },
      { name: "...", type: "Any", description: "Additional values to compare" },
    ],
    returnType: "T",
    description: "Returns the greatest value among arguments",
  },
  least: {
    name: "least",
    parameters: [
      { name: "x1", type: "Any", description: "First value" },
      { name: "...", type: "Any", description: "Additional values to compare" },
    ],
    returnType: "T",
    description: "Returns the smallest value among arguments",
  },

  // Window functions
  row_number: {
    name: "row_number",
    parameters: [],
    returnType: "UInt64",
    description: "Returns sequential row number within partition (requires OVER clause)",
  },
  rank: {
    name: "rank",
    parameters: [],
    returnType: "UInt64",
    description: "Returns rank with gaps for equal values (requires OVER clause)",
  },
  dense_rank: {
    name: "dense_rank",
    parameters: [],
    returnType: "UInt64",
    description: "Returns rank without gaps (requires OVER clause)",
  },
  lag: {
    name: "lag",
    parameters: [
      { name: "x", type: "Any", description: "Column to access" },
      { name: "offset", type: "UInt", description: "Number of rows back", optional: true },
      { name: "default", type: "Any", description: "Default value if out of bounds", optional: true },
    ],
    returnType: "T",
    description: "Accesses value from previous row (requires OVER clause)",
  },
  lead: {
    name: "lead",
    parameters: [
      { name: "x", type: "Any", description: "Column to access" },
      { name: "offset", type: "UInt", description: "Number of rows forward", optional: true },
      { name: "default", type: "Any", description: "Default value if out of bounds", optional: true },
    ],
    returnType: "T",
    description: "Accesses value from next row (requires OVER clause)",
  },
  first_value: {
    name: "first_value",
    parameters: [
      { name: "x", type: "Any", description: "Column to get first value from" },
    ],
    returnType: "T",
    description: "Returns first value in window frame (requires OVER clause)",
  },
  last_value: {
    name: "last_value",
    parameters: [
      { name: "x", type: "Any", description: "Column to get last value from" },
    ],
    returnType: "T",
    description: "Returns last value in window frame (requires OVER clause)",
  },

  // Other common functions
  isNull: {
    name: "isNull",
    parameters: [
      { name: "x", type: "Any", description: "Value to check" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if value is NULL",
  },
  ifNull: {
    name: "ifNull",
    parameters: [
      { name: "x", type: "Any", description: "Value to check for NULL" },
      { name: "alt", type: "T", description: "Alternative value to return if NULL" },
    ],
    returnType: "T",
    description: "Returns alternative value if first argument is NULL",
  },
  length: {
    name: "length",
    parameters: [
      { name: "x", type: "String|Array", description: "String or array to get length of" },
    ],
    returnType: "UInt64",
    description: "Returns number of bytes in string or elements in array",
  },

  // More string functions
  lower: {
    name: "lower",
    parameters: [
      { name: "s", type: "String", description: "String to convert to lowercase" },
    ],
    returnType: "String",
    description: "Converts string to lowercase",
  },
  upper: {
    name: "upper",
    parameters: [
      { name: "s", type: "String", description: "String to convert to uppercase" },
    ],
    returnType: "String",
    description: "Converts string to uppercase",
  },
  trim: {
    name: "trim",
    parameters: [
      { name: "s", type: "String", description: "String to trim" },
      { name: "trim_chars", type: "String", description: "Characters to remove", optional: true },
    ],
    returnType: "String",
    description: "Removes whitespace or specified characters from both ends",
  },
  position: {
    name: "position",
    parameters: [
      { name: "haystack", type: "String", description: "String to search in" },
      { name: "needle", type: "String", description: "Substring to find" },
    ],
    returnType: "UInt64",
    description: "Returns position of substring (1-based), or 0 if not found",
  },
  startsWith: {
    name: "startsWith",
    parameters: [
      { name: "s", type: "String", description: "String to check" },
      { name: "prefix", type: "String", description: "Prefix to check for" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if string starts with prefix",
  },
  endsWith: {
    name: "endsWith",
    parameters: [
      { name: "s", type: "String", description: "String to check" },
      { name: "suffix", type: "String", description: "Suffix to check for" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if string ends with suffix",
  },

  // More datetime functions
  now: {
    name: "now",
    parameters: [
      { name: "timezone", type: "String", description: "Timezone", optional: true },
    ],
    returnType: "DateTime",
    description: "Returns current date and time",
  },
  toStartOfDay: {
    name: "toStartOfDay",
    parameters: [
      { name: "datetime", type: "DateTime", description: "Date or datetime to round" },
    ],
    returnType: "DateTime",
    description: "Rounds down to start of day (midnight)",
  },
  toStartOfHour: {
    name: "toStartOfHour",
    parameters: [
      { name: "datetime", type: "DateTime", description: "Datetime to round" },
    ],
    returnType: "DateTime",
    description: "Rounds down to start of hour",
  },
  toStartOfMonth: {
    name: "toStartOfMonth",
    parameters: [
      { name: "date", type: "Date|DateTime", description: "Date to round" },
    ],
    returnType: "Date",
    description: "Rounds down to first day of month",
  },
  toYear: {
    name: "toYear",
    parameters: [
      { name: "date", type: "Date|DateTime", description: "Date to extract year from" },
    ],
    returnType: "UInt16",
    description: "Extracts year component",
  },
  toMonth: {
    name: "toMonth",
    parameters: [
      { name: "date", type: "Date|DateTime", description: "Date to extract month from" },
    ],
    returnType: "UInt8",
    description: "Extracts month component (1-12)",
  },
  toHour: {
    name: "toHour",
    parameters: [
      { name: "datetime", type: "DateTime", description: "Datetime to extract hour from" },
    ],
    returnType: "UInt8",
    description: "Extracts hour component (0-23)",
  },
  addDays: {
    name: "addDays",
    parameters: [
      { name: "datetime", type: "Date|DateTime", description: "Date or datetime to add to" },
      { name: "num", type: "Int", description: "Number of days to add" },
    ],
    returnType: "Date|DateTime",
    description: "Adds specified number of days",
  },
  addHours: {
    name: "addHours",
    parameters: [
      { name: "datetime", type: "DateTime", description: "Datetime to add to" },
      { name: "num", type: "Int", description: "Number of hours to add" },
    ],
    returnType: "DateTime",
    description: "Adds specified number of hours",
  },

  // More array functions
  arrayConcat: {
    name: "arrayConcat",
    parameters: [
      { name: "arr1", type: "Array(T)", description: "First array" },
      { name: "...", type: "Array(T)", description: "Additional arrays to concatenate" },
    ],
    returnType: "Array(T)",
    description: "Concatenates multiple arrays",
  },
  arrayElement: {
    name: "arrayElement",
    parameters: [
      { name: "arr", type: "Array(T)", description: "Array to access" },
      { name: "n", type: "Int", description: "Index (1-based, negative counts from end)" },
    ],
    returnType: "T",
    description: "Returns element at index",
  },
  range: {
    name: "range",
    parameters: [
      { name: "start", type: "Int", description: "Starting value", optional: true },
      { name: "end", type: "Int", description: "Ending value (exclusive)" },
      { name: "step", type: "Int", description: "Step size", optional: true },
    ],
    returnType: "Array(UInt)",
    description: "Creates array of numbers from start to end-1",
  },
  arraySort: {
    name: "arraySort",
    parameters: [
      { name: "func", type: "lambda", description: "Optional lambda for custom sorting", optional: true },
      { name: "arr", type: "Array(T)", description: "Array to sort" },
    ],
    returnType: "Array(T)",
    description: "Sorts array in ascending order",
  },
  arrayDistinct: {
    name: "arrayDistinct",
    parameters: [
      { name: "arr", type: "Array(T)", description: "Array to get unique elements from" },
    ],
    returnType: "Array(T)",
    description: "Returns array of unique elements",
  },
  arrayUniq: {
    name: "arrayUniq",
    parameters: [
      { name: "arr", type: "Array(T)", description: "Array to count unique elements in" },
    ],
    returnType: "UInt64",
    description: "Counts number of unique elements",
  },
  hasAll: {
    name: "hasAll",
    parameters: [
      { name: "set", type: "Array(T)", description: "Array to check" },
      { name: "subset", type: "Array(T)", description: "Elements to look for" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if array contains all specified elements",
  },
  hasAny: {
    name: "hasAny",
    parameters: [
      { name: "arr1", type: "Array(T)", description: "First array" },
      { name: "arr2", type: "Array(T)", description: "Second array" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if arrays have any common elements",
  },

  // More aggregate functions
  min: {
    name: "min",
    parameters: [
      { name: "x", type: "Any", description: "Values to find minimum of" },
    ],
    returnType: "T",
    description: "Returns minimum value",
  },
  max: {
    name: "max",
    parameters: [
      { name: "x", type: "Any", description: "Values to find maximum of" },
    ],
    returnType: "T",
    description: "Returns maximum value",
  },
  any: {
    name: "any",
    parameters: [
      { name: "x", type: "Any", description: "Column to select from" },
    ],
    returnType: "T",
    description: "Selects first encountered value",
  },
  groupConcat: {
    name: "groupConcat",
    parameters: [
      { name: "x", type: "String", description: "Strings to concatenate" },
      { name: "separator", type: "String", description: "Separator string", optional: true },
    ],
    returnType: "String",
    description: "Concatenates strings from group with optional separator",
  },

  // Math functions
  abs: {
    name: "abs",
    parameters: [
      { name: "x", type: "Numeric", description: "Number to get absolute value of" },
    ],
    returnType: "Numeric",
    description: "Returns absolute value",
  },
  sqrt: {
    name: "sqrt",
    parameters: [
      { name: "x", type: "Numeric", description: "Number to get square root of" },
    ],
    returnType: "Float64",
    description: "Returns square root",
  },
  floor: {
    name: "floor",
    parameters: [
      { name: "x", type: "Numeric", description: "Number to round down" },
    ],
    returnType: "Numeric",
    description: "Rounds down to nearest integer",
  },
  ceil: {
    name: "ceil",
    parameters: [
      { name: "x", type: "Numeric", description: "Number to round up" },
    ],
    returnType: "Numeric",
    description: "Rounds up to nearest integer",
  },
  exp: {
    name: "exp",
    parameters: [
      { name: "x", type: "Numeric", description: "Exponent" },
    ],
    returnType: "Float64",
    description: "Returns e raised to the power of x",
  },
  log: {
    name: "log",
    parameters: [
      { name: "x", type: "Numeric", description: "Number to get natural logarithm of" },
    ],
    returnType: "Float64",
    description: "Returns natural logarithm",
  },
  sin: {
    name: "sin",
    parameters: [
      { name: "x", type: "Numeric", description: "Angle in radians" },
    ],
    returnType: "Float64",
    description: "Returns sine of angle",
  },
  cos: {
    name: "cos",
    parameters: [
      { name: "x", type: "Numeric", description: "Angle in radians" },
    ],
    returnType: "Float64",
    description: "Returns cosine of angle",
  },

  // Null handling
  isNotNull: {
    name: "isNotNull",
    parameters: [
      { name: "x", type: "Any", description: "Value to check" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if value is not NULL",
  },
  assumeNotNull: {
    name: "assumeNotNull",
    parameters: [
      { name: "x", type: "Nullable(T)", description: "Nullable value" },
    ],
    returnType: "T",
    description: "Converts Nullable to non-Nullable (undefined if NULL)",
  },
  nullIf: {
    name: "nullIf",
    parameters: [
      { name: "x", type: "T", description: "First value" },
      { name: "y", type: "T", description: "Second value to compare" },
    ],
    returnType: "Nullable(T)",
    description: "Returns NULL if both values are equal, otherwise first value",
  },

  // Type conversions
  toString: {
    name: "toString",
    parameters: [
      { name: "x", type: "Any", description: "Value to convert to string" },
      { name: "timezone", type: "String", description: "Timezone (for DateTime)", optional: true },
    ],
    returnType: "String",
    description: "Converts value to string representation",
  },
  toInt32: {
    name: "toInt32",
    parameters: [
      { name: "x", type: "Any", description: "Value to convert" },
    ],
    returnType: "Int32",
    description: "Converts to Int32 (throws on error)",
  },
  toInt64: {
    name: "toInt64",
    parameters: [
      { name: "x", type: "Any", description: "Value to convert" },
    ],
    returnType: "Int64",
    description: "Converts to Int64 (throws on error)",
  },
  toFloat64: {
    name: "toFloat64",
    parameters: [
      { name: "x", type: "Any", description: "Value to convert" },
    ],
    returnType: "Float64",
    description: "Converts to Float64 (throws on error)",
  },
  toUInt32: {
    name: "toUInt32",
    parameters: [
      { name: "x", type: "Any", description: "Value to convert" },
    ],
    returnType: "UInt32",
    description: "Converts to UInt32 (throws on error)",
  },
  toUInt64: {
    name: "toUInt64",
    parameters: [
      { name: "x", type: "Any", description: "Value to convert" },
    ],
    returnType: "UInt64",
    description: "Converts to UInt64 (throws on error)",
  },

  // Hash functions
  MD5: {
    name: "MD5",
    parameters: [
      { name: "s", type: "String", description: "String to hash" },
    ],
    returnType: "FixedString(16)",
    description: "Calculates MD5 hash",
  },
  SHA256: {
    name: "SHA256",
    parameters: [
      { name: "s", type: "String", description: "String to hash" },
    ],
    returnType: "FixedString(32)",
    description: "Calculates SHA256 hash",
  },
  cityHash64: {
    name: "cityHash64",
    parameters: [
      { name: "x", type: "Any", description: "Value to hash" },
    ],
    returnType: "UInt64",
    description: "Calculates 64-bit CityHash",
  },

  // Encryption
  encrypt: {
    name: "encrypt",
    parameters: [
      { name: "mode", type: "String", description: "Encryption mode (e.g., 'aes-256-gcm')" },
      { name: "plaintext", type: "String", description: "Text to encrypt" },
      { name: "key", type: "String", description: "Encryption key" },
      { name: "iv", type: "String", description: "Initialization vector", optional: true },
      { name: "aad", type: "String", description: "Additional authenticated data (GCM modes)", optional: true },
    ],
    returnType: "String",
    description: "Encrypts plaintext using AES",
  },
  decrypt: {
    name: "decrypt",
    parameters: [
      { name: "mode", type: "String", description: "Decryption mode (e.g., 'aes-256-gcm')" },
      { name: "ciphertext", type: "String", description: "Encrypted text to decrypt" },
      { name: "key", type: "String", description: "Decryption key" },
      { name: "iv", type: "String", description: "Initialization vector", optional: true },
      { name: "aad", type: "String", description: "Additional authenticated data (GCM modes)", optional: true },
    ],
    returnType: "String",
    description: "Decrypts ciphertext using AES",
  },

  // More array operations
  arrayFirst: {
    name: "arrayFirst",
    parameters: [
      { name: "func", type: "lambda", description: "Lambda function to test elements" },
      { name: "arr", type: "Array(T)", description: "Array to search" },
    ],
    returnType: "T",
    description: "Returns first element where lambda returns true",
  },
  arrayFirstIndex: {
    name: "arrayFirstIndex",
    parameters: [
      { name: "func", type: "lambda", description: "Lambda function to test elements" },
      { name: "arr", type: "Array(T)", description: "Array to search" },
    ],
    returnType: "UInt32",
    description: "Returns index of first element where lambda returns true",
  },
  arrayReverse: {
    name: "arrayReverse",
    parameters: [
      { name: "arr", type: "Array(T)", description: "Array to reverse" },
    ],
    returnType: "Array(T)",
    description: "Reverses array element order",
  },
  arrayFlatten: {
    name: "arrayFlatten",
    parameters: [
      { name: "arr", type: "Array(Array(T))", description: "Nested array to flatten" },
    ],
    returnType: "Array(T)",
    description: "Flattens nested arrays into single array",
  },
  arrayZip: {
    name: "arrayZip",
    parameters: [
      { name: "arr1", type: "Array(T)", description: "First array" },
      { name: "...", type: "Array(U)", description: "Additional arrays" },
    ],
    returnType: "Array(Tuple)",
    description: "Combines arrays into array of tuples",
  },
  arrayIntersect: {
    name: "arrayIntersect",
    parameters: [
      { name: "arr1", type: "Array(T)", description: "First array" },
      { name: "...", type: "Array(T)", description: "Additional arrays" },
    ],
    returnType: "Array(T)",
    description: "Returns intersection of all arrays",
  },
  countEqual: {
    name: "countEqual",
    parameters: [
      { name: "arr", type: "Array(T)", description: "Array to search" },
      { name: "value", type: "T", description: "Value to count" },
    ],
    returnType: "UInt64",
    description: "Counts occurrences of value in array",
  },
  empty: {
    name: "empty",
    parameters: [
      { name: "arr", type: "Array|String", description: "Array or string to check" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if array/string is empty",
  },
  notEmpty: {
    name: "notEmpty",
    parameters: [
      { name: "arr", type: "Array|String", description: "Array or string to check" },
    ],
    returnType: "UInt8",
    description: "Returns 1 if array/string is not empty",
  },

  // Arithmetic
  plus: {
    name: "plus",
    parameters: [
      { name: "x", type: "Numeric", description: "First number" },
      { name: "y", type: "Numeric", description: "Second number" },
    ],
    returnType: "Numeric",
    description: "Adds two numbers",
  },
  minus: {
    name: "minus",
    parameters: [
      { name: "x", type: "Numeric", description: "Minuend" },
      { name: "y", type: "Numeric", description: "Subtrahend" },
    ],
    returnType: "Numeric",
    description: "Subtracts second number from first",
  },
  multiply: {
    name: "multiply",
    parameters: [
      { name: "x", type: "Numeric", description: "First factor" },
      { name: "y", type: "Numeric", description: "Second factor" },
    ],
    returnType: "Numeric",
    description: "Multiplies two numbers",
  },
  divide: {
    name: "divide",
    parameters: [
      { name: "x", type: "Numeric", description: "Dividend" },
      { name: "y", type: "Numeric", description: "Divisor" },
    ],
    returnType: "Float64",
    description: "Divides first number by second (returns Float64)",
  },
  intDiv: {
    name: "intDiv",
    parameters: [
      { name: "x", type: "Int", description: "Dividend" },
      { name: "y", type: "Int", description: "Divisor" },
    ],
    returnType: "Int",
    description: "Integer division (rounds toward zero)",
  },
  modulo: {
    name: "modulo",
    parameters: [
      { name: "x", type: "Numeric", description: "Dividend" },
      { name: "y", type: "Numeric", description: "Divisor (modulus)" },
    ],
    returnType: "Numeric",
    description: "Returns remainder of division",
  },
  negate: {
    name: "negate",
    parameters: [
      { name: "x", type: "Numeric", description: "Number to negate" },
    ],
    returnType: "Numeric",
    description: "Returns negative of number",
  },
  gcd: {
    name: "gcd",
    parameters: [
      { name: "x", type: "Int", description: "First integer" },
      { name: "y", type: "Int", description: "Second integer" },
    ],
    returnType: "Int",
    description: "Returns greatest common divisor",
  },
  lcm: {
    name: "lcm",
    parameters: [
      { name: "x", type: "Int", description: "First integer" },
      { name: "y", type: "Int", description: "Second integer" },
    ],
    returnType: "Int",
    description: "Returns least common multiple",
  },
};

// Get signature for a function name (case-insensitive)
export function getFunctionSignature(functionName: string): FunctionSignature | undefined {
  const normalized = functionName.toLowerCase();
  const key = Object.keys(clickhouseFunctionSignatures).find((k) => k.toLowerCase() === normalized);
  return key ? clickhouseFunctionSignatures[key] : undefined;
}
