import { z } from "zod";

const SUPPORTED_SCHEMA_VERSIONS = ["0.1.0"] as const;

const trimmedString = z.string().trim().min(1, "value cannot be empty");
const optionalDescription = trimmedString.max(512).optional();

const portMappingSchema = z
  .object({
    host: z.number().int().min(1).max(65535),
    container: z.number().int().min(1).max(65535),
    protocol: z.enum(["tcp", "udp"]).default("tcp"),
  })
  .strict();

const portCheckSchema = z
  .object({
    port: z.number().int().min(1).max(65535),
    description: optionalDescription,
  })
  .strict();

const healthcheckDefinitionSchema = z
  .object({
    test: trimmedString.optional(),
    interval: trimmedString.optional(),
    timeout: trimmedString.optional(),
    retries: z.number().int().min(0).optional(),
  })
  .strict();

const commandSchema = z.union([
  trimmedString,
  z.array(trimmedString).nonempty(),
]);

const serviceDefinitionSchema = z
  .object({
    name: trimmedString,
    dockerfile: trimmedString.optional(),
    context: trimmedString.optional(),
    image: trimmedString.optional(),
    command: commandSchema.optional(),
    ports: z.array(portMappingSchema).optional().default([]),
    environment: z.record(trimmedString).optional().default({}),
    dependsOn: z.array(trimmedString).optional().default([]),
    profiles: z.array(trimmedString).optional().default([]),
    healthcheck: healthcheckDefinitionSchema.optional(),
    volumes: z.array(trimmedString).optional().default([]),
  })
  .strict()
  .superRefine((service, ctx) => {
    const hasDockerfile = Boolean(service.dockerfile);
    const hasImage = Boolean(service.image);

    if (!hasDockerfile && !hasImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "service must provide either dockerfile or image",
        path: ["dockerfile"],
      });
    }

    if (hasDockerfile && hasImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dockerfile and image cannot both be specified",
        path: ["image"],
      });
    }

    if (service.context && !hasDockerfile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "context is only allowed when dockerfile is provided",
        path: ["context"],
      });
    }
  });

const profileToggleSchema = z
  .object({
    key: trimmedString,
    description: optionalDescription,
    defaultEnabled: z.boolean().optional().default(false),
    services: z.array(trimmedString).nonempty("profile must reference services"),
  })
  .strict();

const volumeRuleSchema = z
  .object({
    name: trimmedString,
    path: trimmedString.optional(),
    preserveOnReset: z.boolean().optional().default(false),
    description: optionalDescription,
  })
  .strict();

const prerequisiteChecklistSchema = z
  .object({
    dockerVersion: trimmedString.optional(),
    composeVersion: trimmedString.optional(),
    cpuCores: z.number().int().positive().optional(),
    memoryGb: z.number().positive().optional(),
    portsInUse: z.array(portCheckSchema).optional().default([]),
  })
  .strict();

const loggingPreferencesSchema = z
  .object({
    format: z.enum(["table", "json", "both"]).optional().default("table"),
    ndjsonPath: trimmedString.optional(),
    retainComposeLogs: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((logging, ctx) => {
    const requiresStream =
      logging.format === "json" ||
      logging.format === "both" ||
      logging.retainComposeLogs;

    if (requiresStream && !logging.ndjsonPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ndjsonPath is required when JSON output or log retention is enabled",
        path: ["ndjsonPath"],
      });
    }
  });

const resetPolicySchema = z
  .object({
    mode: z.enum(["preserve", "selective", "full"]).optional().default("preserve"),
    selectiveVolumes: z.array(trimmedString).optional().default([]),
  })
  .strict()
  .superRefine((policy, ctx) => {
    if (policy.selectiveVolumes.length > 0 && policy.mode !== "selective") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "selectiveVolumes may only be provided when mode is selective",
        path: ["selectiveVolumes"],
      });
    }
  });

export const devEnvironmentConfigSchema = z
  .object({
    version: z
      .string()
      .refine(
        (value) => SUPPORTED_SCHEMA_VERSIONS.includes(value as (typeof SUPPORTED_SCHEMA_VERSIONS)[number]),
        "unsupported configuration version",
      ),
    projectName: trimmedString,
    services: z.array(serviceDefinitionSchema).min(1, "at least one service is required"),
    profiles: z.array(profileToggleSchema).optional().default([]),
    volumes: z.array(volumeRuleSchema).optional().default([]),
    envFiles: z.array(trimmedString).optional().default([]),
    prerequisites: prerequisiteChecklistSchema.optional(),
    logging: loggingPreferencesSchema.optional(),
    resetPolicy: resetPolicySchema.optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const serviceNames = new Set<string>();
    const hostBindings = new Map<string, string>();

    config.services.forEach((service, index) => {
      if (serviceNames.has(service.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate service name "${service.name}" detected`,
          path: ["services", index, "name"],
        });
      } else {
        serviceNames.add(service.name);
      }

      service.ports.forEach((port, portIndex) => {
        const protocol = port.protocol ?? "tcp";
        const bindingKey = `${protocol}:${port.host}`;
        const existing = hostBindings.get(bindingKey);

        if (existing && existing !== service.name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `host port ${port.host}/${protocol} already used by service "${existing}"`,
            path: ["services", index, "ports", portIndex, "host"],
          });
        } else {
          hostBindings.set(bindingKey, service.name);
        }
      });
    });

    const profileKeys = new Set<string>();
    config.profiles.forEach((profile, index) => {
      if (profileKeys.has(profile.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate profile key "${profile.key}" detected`,
          path: ["profiles", index, "key"],
        });
      } else {
        profileKeys.add(profile.key);
      }

      profile.services.forEach((serviceName, serviceIndex) => {
        if (!serviceNames.has(serviceName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `profile references unknown service "${serviceName}"`,
            path: ["profiles", index, "services", serviceIndex],
          });
        }
      });
    });

    config.services.forEach((service, index) => {
      service.profiles.forEach((profileKey, profileIndex) => {
        if (!profileKeys.has(profileKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `service references unknown profile "${profileKey}"`,
            path: ["services", index, "profiles", profileIndex],
          });
        }
      });
    });

    if (config.resetPolicy) {
      const declaredVolumes = new Set(config.volumes.map((volume) => volume.name));
      config.resetPolicy.selectiveVolumes.forEach((volumeName, volumeIndex) => {
        if (!declaredVolumes.has(volumeName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `selective volume "${volumeName}" is not declared in volumes`,
            path: ["resetPolicy", "selectiveVolumes", volumeIndex],
          });
        }
      });
    }
  });

export type PortMapping = z.infer<typeof portMappingSchema>;
export type ServiceDefinition = z.infer<typeof serviceDefinitionSchema>;
export type ProfileToggle = z.infer<typeof profileToggleSchema>;
export type VolumeRule = z.infer<typeof volumeRuleSchema>;
export type PrerequisiteChecklist = z.infer<typeof prerequisiteChecklistSchema>;
export type LoggingPreferences = z.infer<typeof loggingPreferencesSchema>;
export type ResetPolicy = z.infer<typeof resetPolicySchema>;
export type DevEnvironmentConfig = z.infer<typeof devEnvironmentConfigSchema>;

export { SUPPORTED_SCHEMA_VERSIONS };
