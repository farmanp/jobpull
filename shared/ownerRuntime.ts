export type RuntimeBoardVisibility = "private" | "public";
export type MagicLinkDeliveryMode = "resend" | "console" | "disabled";

function normalizeFlag(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function isEnabledFlag(value?: string): boolean {
  const normalized = normalizeFlag(value);
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolveBoardVisibilityDefault(value?: string): RuntimeBoardVisibility {
  return normalizeFlag(value) === "public" ? "public" : "private";
}

export function resolveMagicLinkDeliveryMode(
  configuredValue: string | undefined,
  hasEmailDelivery: boolean
): MagicLinkDeliveryMode {
  const normalized = normalizeFlag(configuredValue);
  if (normalized === "resend") {
    return "resend";
  }
  if (normalized === "console") {
    return "console";
  }
  if (normalized === "disabled") {
    return "disabled";
  }
  return hasEmailDelivery ? "resend" : "disabled";
}

export function canBrowseBoard(params: {
  visibility: RuntimeBoardVisibility;
  claimed: boolean;
  isOwner: boolean;
  allowUnclaimedBrowse: boolean;
}): boolean {
  if (params.isOwner) {
    return true;
  }
  if (params.visibility === "public") {
    return true;
  }
  return !params.claimed && params.allowUnclaimedBrowse;
}

