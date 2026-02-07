export interface ProjectIdentity {
  displayName: string;
  slug: string;
  npmPackageName: string;
  defaultDataDirName: string;
  extensionCustomType: string;
}

export interface ProjectIdentityOverrides {
  displayName?: string;
  slug?: string;
  npmPackageName?: string;
  defaultDataDirName?: string;
  extensionCustomType?: string;
}

export const DEFAULT_PROJECT_IDENTITY: ProjectIdentity = Object.freeze({
  displayName: "Happy Paths",
  slug: "happy-paths",
  npmPackageName: "@continua-ai/happy-paths",
  defaultDataDirName: ".happy-paths",
  extensionCustomType: "happy_paths",
});

export function resolveProjectIdentity(
  overrides: ProjectIdentityOverrides = {},
): ProjectIdentity {
  return {
    displayName: overrides.displayName ?? DEFAULT_PROJECT_IDENTITY.displayName,
    slug: overrides.slug ?? DEFAULT_PROJECT_IDENTITY.slug,
    npmPackageName: overrides.npmPackageName ?? DEFAULT_PROJECT_IDENTITY.npmPackageName,
    defaultDataDirName:
      overrides.defaultDataDirName ?? DEFAULT_PROJECT_IDENTITY.defaultDataDirName,
    extensionCustomType:
      overrides.extensionCustomType ?? DEFAULT_PROJECT_IDENTITY.extensionCustomType,
  };
}
