// config/passport.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient();

// Only configure Google Strategy if environment variables are present
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists with this Google ID
          let existingUser = await prisma.user.findUnique({
            where: { googleId: profile.id },
            select: {
              id: true,
              googleId: true,
              username: true,
              email: true,
              createdAt: true,
              profile: {
                select: {
                  avatarUrl: true,
                },
              },
            },
          });

          if (existingUser) {
            return done(null, existingUser);
          }

          // Check if user exists with this email
          existingUser = await prisma.user.findUnique({
            where: { email: profile.emails[0].value },
            select: {
              id: true,
              googleId: true,
              username: true,
              email: true,
              createdAt: true,
              profile: {
                select: {
                  avatarUrl: true,
                },
              },
            },
          });

          if (existingUser) {
            // Update existing user with Google ID
            const updatedUser = await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                googleId: profile.id,
                profile: {
                  upsert: {
                    create: {
                      fullName: profile.displayName || existingUser.username,
                      avatarUrl: profile.photos[0]?.value || null,
                    },
                    update: {
                      avatarUrl:
                        profile.photos[0]?.value ||
                        existingUser.profile?.avatarUrl,
                    },
                  },
                },
              },
              select: {
                id: true,
                googleId: true,
                username: true,
                email: true,
                createdAt: true,
                profile: {
                  select: {
                    avatarUrl: true,
                  },
                },
              },
            });
            return done(null, updatedUser);
          }

          // Create new user with UUID and clean username
          const baseUsername = profile.emails[0].value
            .split("@")[0]
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 20); // Limit to 20 characters
          const newUser = await prisma.user.create({
            data: {
              googleId: profile.id,
              username: baseUsername,
              email: profile.emails[0].value,
              role: "client",
              profile: {
                create: {
                  fullName: profile.displayName || baseUsername,
                  avatarUrl: profile.photos[0]?.value || null,
                },
              },
            },
            select: {
              id: true,
              googleId: true,
              username: true,
              email: true,
              createdAt: true,
              profile: {
                select: {
                  avatarUrl: true,
                },
              },
            },
          });

          return done(null, newUser);
        } catch (error) {
          console.error("Error in Google Strategy:", error);
          return done(error, null);
        }
      }
    )
  );
} else {
  console.warn(
    "⚠️  Google OAuth credentials not found. Google authentication will be disabled."
  );
  console.warn(
    "   Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables to enable Google OAuth."
  );
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (userId, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        googleId: true,
        username: true,
        email: true,
        createdAt: true,
        role: true,
        profile: {
          select: {
            avatarUrl: true,
          },
        },
      },
    });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
