/**
 * Catalog / workbook import archive safety.
 * Routine imports must never archive live inventory unless the clean-restart
 * flow explicitly opts in and confirms.
 */

export type ImportArchiveFlagsInput = {
  archiveExisting?: boolean;
  archiveExistingConfirmed?: boolean;
};

export type ImportArchiveRpcFlags = {
  archive_existing: boolean;
  archive_existing_confirmed: boolean;
};

/** Default is false — only true when callers explicitly request archival. */
export function archiveExistingRequested(input: ImportArchiveFlagsInput): boolean {
  return input.archiveExisting === true;
}

/** Archival only proceeds when requested and explicitly confirmed. */
export function archiveExistingAllowed(input: ImportArchiveFlagsInput): boolean {
  return input.archiveExisting === true && input.archiveExistingConfirmed === true;
}

/** Payload flags for commit_inventory_* RPCs (defaults never archive). */
export function buildImportArchiveRpcFlags(input: ImportArchiveFlagsInput): ImportArchiveRpcFlags {
  const requested = archiveExistingRequested(input);
  const confirmed = input.archiveExistingConfirmed === true;
  return {
    archive_existing: requested,
    archive_existing_confirmed: requested && confirmed,
  };
}

export type ImportArchiveValidation =
  | { ok: true; flags: ImportArchiveRpcFlags }
  | { ok: false; error: "archive_existing_confirmation_required" };

export function validateImportArchiveFlags(input: ImportArchiveFlagsInput): ImportArchiveValidation {
  const flags = buildImportArchiveRpcFlags(input);
  if (flags.archive_existing && !flags.archive_existing_confirmed) {
    return { ok: false, error: "archive_existing_confirmation_required" };
  }
  return { ok: true, flags };
}
