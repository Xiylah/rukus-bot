/**
 * Custom-id namespaces for verification components. These mirror the CID
 * convention in @rukus/shared constants.ts (`${ns}:${action}`) but live here so
 * the feature ships without editing the shared constants file, exactly like
 * RR_CID does for reaction roles.
 *
 * Format:
 *   vrf:go            - the Verify button on the panel
 *   vrf:modal         - the captcha answer modal
 *   vrf:code          - the captcha text input inside that modal
 */
export const VERIFY_CID = {
  verify: "vrf:go",
  modal: "vrf:modal",
  codeInput: "vrf:code",
} as const;
