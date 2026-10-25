/** @type {import('next').NextConfig} */

// On Vercel the game server runs elsewhere (Render, Railway, Fly), so the
// build must be told where. Without it the site would try localhost.
if (process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error(
    "Set NEXT_PUBLIC_API_URL in the Vercel project to your game server's address, e.g. https://matik.onrender.com",
  );
}

const nextConfig = {
  transpilePackages: ["@matik/shared"],
};

export default nextConfig;
