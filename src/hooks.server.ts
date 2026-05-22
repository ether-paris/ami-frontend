import { db } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { type Handle } from "@sveltejs/kit";
import { decode } from "jsonwebtoken";

export const handle: Handle = async ({ event, resolve }) => {
  const authHeader = event.request.headers.get("Authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    try {
      const payload = decode(token) as {
        google_id?: string;
        email?: string;
        name?: string;
      } | null;

      if (payload?.google_id) {
        const existingUser = await db.query.users.findFirst({
          where: eq(users.google_id, payload.google_id),
        });

        if (existingUser) {
          event.locals.user = existingUser;
        } else {
          const [newUser] = await db
            .insert(users)
            .values({
              id: crypto.randomUUID(),
              google_id: payload.google_id,
              email: payload.email || "",
              name: payload.name || "",
            })
            .returning();

          event.locals.user = newUser;
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
    }
  }

  return resolve(event);
};
