/** Session cookies: HttpOnly so page scripts can never read them, SameSite=Lax against CSRF. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
