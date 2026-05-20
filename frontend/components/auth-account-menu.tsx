"use client";

import { useDescope, useSession, useUser, getJwtRoles } from "@descope/nextjs-sdk/client";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { initials } from "@/lib/initials";
import { relativeSignIn } from "@/lib/account-menu-format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Header-bar account menu for the signed-in family member. Renders only
 * with auth on (the parent gates it on AUTH_ENABLED, so <AuthProvider> is
 * present). Shows a skeleton while the session or user record resolves,
 * and nothing at all when there is no session (e.g. the public /sign-in page).
 */
export function AuthAccountMenu() {
  const t = useTranslations("Chrome.Account");
  const locale = useLocale();
  const router = useRouter();
  const sdk = useDescope();
  const { user, isUserLoading } = useUser();
  const { isAuthenticated, isSessionLoading, sessionToken, claims } = useSession();

  // Peripheral header widget — aria-hidden so screen readers aren't told
  // "loading" on every navigation. The trigger below carries the real label.
  const loadingSkeleton = <Skeleton className="h-8 w-28" aria-hidden />;

  if (isSessionLoading) return loadingSkeleton;
  if (!isAuthenticated) return null;
  // Authenticated, but the user record (name/email) is still loading —
  // keep the skeleton so the trigger doesn't flash an empty name. This
  // check comes after the !isAuthenticated guard so the public /sign-in
  // page still renders nothing rather than a skeleton.
  if (isUserLoading) return loadingSkeleton;

  const name = user?.name?.trim() || user?.email || "";
  const roles = sessionToken ? getJwtRoles(sessionToken) : [];
  const iat = typeof claims?.iat === "number" ? claims.iat : null;

  async function handleSignOut() {
    try {
      await sdk.logout();
    } catch (err) {
      // A stale client session is harmless — the proxy and requireSession()
      // re-validate the DS cookie server-side on the next request.
      console.error("descope logout failed", err);
    }
    router.push("/sign-in");
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("triggerLabel")}
        className="inline-flex items-center gap-2 rounded border border-foreground/20 ps-1 pe-2 py-1 text-sm"
      >
        <Avatar size="sm">
          {user?.picture ? <AvatarImage src={user.picture} alt="" /> : null}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <span>{name}</span>
        <ChevronDown className="size-4 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2 text-sm">
        <div>
          <p className="font-medium">{name}</p>
          {user?.email && user.email !== name ? (
            <p className="text-foreground/60">{user.email}</p>
          ) : null}
        </div>
        {(roles.length > 0 || iat !== null) && (
          <div className="flex flex-wrap items-center gap-2">
            {roles.map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
            {iat !== null && (
              <span className="text-foreground/60">
                {t("signedIn", { time: relativeSignIn(iat, Date.now(), locale) })}
              </span>
            )}
          </div>
        )}
        <Separator />
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          {t("signOut")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
