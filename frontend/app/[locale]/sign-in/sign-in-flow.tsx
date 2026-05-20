"use client";

import { Descope } from "@descope/nextjs-sdk";
import { useRouter } from "@/i18n/navigation";

/**
 * The embedded Descope flow. `flowId` names a flow built in the Descope
 * console — configure that flow as invite-only (no open sign-up). On
 * success, send the family member to the wiki home.
 */
export function SignInFlow() {
  const router = useRouter();
  return (
    <Descope
      flowId="sign-up-or-in"
      onSuccess={() => router.push("/")}
      onError={(err) => console.error("descope flow error", err)}
    />
  );
}
