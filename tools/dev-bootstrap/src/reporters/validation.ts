import { ZodError, ZodIssue } from "zod";

export interface ValidationMessage {
  path: string;
  message: string;
  guidance: string;
}

const formatPath = (segments: (string | number)[]): string => {
  if (segments.length === 0) {
    return "<root>";
  }

  return segments
    .reduce<string>((accumulator, segment) => {
      if (typeof segment === "number") {
        return `${accumulator}[${segment}]`;
      }

      if (accumulator.length === 0) {
        return segment;
      }

      return `${accumulator}.${segment}`;
    }, "");
};

interface GuidanceRule {
  predicate: (issue: ZodIssue, formattedPath: string) => boolean;
  guidance: string;
}

const GUIDANCE_RULES: GuidanceRule[] = [
  {
    predicate: (issue, path) =>
      issue.message.includes("service must provide either dockerfile or image") ||
      path.includes("dockerfile") ||
      path.includes("image"),
    guidance:
      "每个服务必须设置 dockerfile 或 image 二选一，若使用 dockerfile 请移除 image 字段。",
  },
  {
    predicate: (issue) =>
      issue.message.includes("dockerfile and image cannot both be specified"),
    guidance:
      "删除多余字段，只保留 dockerfile 或 image 中的一个来描述服务。",
  },
  {
    predicate: (issue) =>
      issue.message.includes("context is only allowed when dockerfile is provided"),
    guidance:
      "如果需要指定 context，请同时提供 dockerfile；否则删除 context 字段。",
  },
  {
    predicate: (issue) => issue.message.includes("duplicate service name"),
    guidance: "services[].name 必须唯一，可调整服务名称避免重复。",
  },
  {
    predicate: (issue) => issue.message.includes("host port"),
    guidance: "为冲突的 host 端口选择新的值，或移除重复的端口映射。",
  },
  {
    predicate: (issue) => issue.message.includes("profile references unknown service"),
    guidance:
      "确保 profiles[].services 仅引用已在 services 列表中声明的服务。",
  },
  {
    predicate: (issue) => issue.message.includes("service references unknown profile"),
    guidance:
      "在 profiles 区域先声明对应的 profile，再在服务中引用它。",
  },
  {
    predicate: (issue) => issue.message.includes("selective volume"),
    guidance:
      "确认 resetPolicy.selectiveVolumes 只包含 volumes 中的 name。",
  },
  {
    predicate: (issue) => issue.message.includes("ndjsonPath is required"),
    guidance:
      "当启用 JSON 输出或日志保留时，需要同时配置 logging.ndjsonPath。",
  },
  {
    predicate: (issue) => issue.message.includes("unsupported configuration version"),
    guidance: "使用模板支持的 version（例如 0.1.0），保持与 CLI 版本一致。",
  },
  {
    predicate: (issue) => issue.message.includes("selectiveVolumes may only be provided"),
    guidance: "仅在 resetPolicy.mode = selective 时填写 selectiveVolumes 字段。",
  },
];

const deriveGuidance = (issue: ZodIssue, formattedPath: string): string => {
  for (const rule of GUIDANCE_RULES) {
    if (rule.predicate(issue, formattedPath)) {
      return rule.guidance;
    }
  }

  switch (issue.code) {
    case "invalid_type": {
      return "字段类型不匹配，请与模板对照后重新填写。";
    }
    case "invalid_enum_value": {
      return "请选择枚举允许的值，可参考模板或文档说明。";
    }
    case "too_small":
    case "too_big": {
      return "当前值超出允许范围，请按照模板或文档给出的限制设置。";
    }
    case "invalid_string": {
      return "字符串格式不正确，请检查是否缺失必需内容。";
    }
    case "custom": {
      return "请根据提示修正字段值，使其符合配置约束。";
    }
    default: {
      if (issue.message === "Required") {
        return "该字段为必填项，请参考模板补充完整。";
      }

      if (issue.message.startsWith("Expected")) {
        return "字段类型不正确，请与模板保持一致。";
      }

      return "请对照模板检查该字段的值与结构是否正确。";
    }
  }
};

export const buildValidationMessagesFromZod = (
  error: ZodError,
): ValidationMessage[] =>
  error.issues.map((issue) => {
    const path = formatPath(issue.path);
    const message = issue.message;
    const guidance = deriveGuidance(issue, path);

    return {
      path,
      message,
      guidance,
    };
  });

export const renderValidationMessages = (
  messages: ValidationMessage[],
): string[] =>
  messages.map((message) => {
    const guidanceSuffix = message.guidance
      ? ` 建议：${message.guidance}`
      : "";
    return `${message.path}: ${message.message}${guidanceSuffix}`;
  });
