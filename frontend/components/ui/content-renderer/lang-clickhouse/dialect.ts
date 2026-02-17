import { SQLDialect } from "@codemirror/lang-sql";

import { clickhouseFunctions } from "./function-signatures";

const clickhouseFunctionNames = clickhouseFunctions.map((fn) => fn.name).join(" ");

export const ClickHouseDialect = SQLDialect.define({
  builtin: clickhouseFunctionNames,
  types:
    "Int8 Int16 Int32 Int64 Int128 Int256 UInt8 UInt16 UInt32 UInt64 UInt128 UInt256 " +
    "Float32 Float64 Decimal Decimal32 Decimal64 Decimal128 Decimal256 " +
    "String FixedString UUID " +
    "Date Date32 DateTime DateTime64 " +
    "Array Tuple Map Nested " +
    "Enum Enum8 Enum16 " +
    "IPv4 IPv6 " +
    "LowCardinality Nullable AggregateFunction SimpleAggregateFunction",
  backslashEscapes: true,
  doubleQuotedStrings: false,
  hashComments: false,
});
