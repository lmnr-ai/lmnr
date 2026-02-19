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

export interface FunctionCallContext {
  functionName: string;
  parameterIndex: number;
  start: number;
  end: number;
}
