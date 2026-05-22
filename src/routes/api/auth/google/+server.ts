import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

// You'll need to install jsonwebtoken: npm install jsonwebtoken

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { token } = await request.json();

    if (!token) {
      return json({ error: "No token provided" }, { status: 400 });
    }

    // For development: create a mock user if GOOGLE_OAUTH_AUTH_SECRET is not set
    if (
      !process.env.GOOGLE_OAUTH_AUTH_SECRET ||
      process.env.GOOGLE_OAUTH_AUTH_SECRET ===
        "your_32_character_hex_secret_here"
    ) {
      console.warn(
        "Using development mock authentication - set GOOGLE_OAUTH_AUTH_SECRET in .env for production",
      );

      // Create a mock JWT token for development
      const mockToken = jwt.sign(
        {
          google_id: "dev-user-" + Math.random().toString(36).substring(2, 9),
          email: "dev@example.com",
          name: "Development User",
          picture: "https://www.gravatar.com/avatar/default?s=200&d=mp",
        },
        "dev-secret",
        { expiresIn: "7d" },
      );

      return json({
        token: mockToken,
        user: {
          name: "Development User",
          picture: "https://www.gravatar.com/avatar/default?s=200&d=mp",
        },
      });
    }

    // Production: Verify Google token and fetch user info
    const googleUserResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!googleUserResponse.ok) {
      console.error(
        "Google token verification failed:",
        await googleUserResponse.text(),
      );
      return json({ error: "Invalid Google token" }, { status: 401 });
    }

    const googleUser = await googleUserResponse.json();

    // Check if user exists in your database
    let user = await db.query.users.findFirst({
      where: eq(users.google_id, googleUser.sub),
    });

    // Create user if they don't exist
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          google_id: googleUser.sub,
          email: googleUser.email,
          name: googleUser.name || "",
        })
        .returning();
    }

    // Generate JWT token for your existing auth system
    const jwtToken = jwt.sign(
      {
        google_id: user.google_id,
        email: user.email,
        name: user.name,
        picture:
          googleUser.picture ||
          "https://www.gravatar.com/avatar/default?s=200&d=mp",
      },
      process.env.GOOGLE_OAUTH_AUTH_SECRET,
      { expiresIn: "7d" },
    );

    return json({
      token: jwtToken,
      user: {
        name: user.name,
        picture:
          googleUser.picture ||
          "https://www.gravatar.com/avatar/default?s=200&d=mp",
      },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    return json(
      { error: "Authentication failed: " + error.message },
      { status: 500 },
    );
  }
};
