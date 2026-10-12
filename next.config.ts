import type { NextConfig } from "next";

/**
 * Remote images: Supabase Storage serves the originals. When the project has
 * Image Transformations enabled, `NEXT_PUBLIC_ML_IMAGE_TRANSFORMS=1` makes the
 * site request resized derivatives from the same host.
 */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The on-screen dev badge is noise in screenshots and demos; errors still show.
  devIndicators: false,
  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
            {
              // Supabase Image Transformations (paid): the same objects served
              // through the resize endpoint when NEXT_PUBLIC_ML_IMAGE_TRANSFORMS=1.
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/render/image/public/**",
            },
          ]
        : []),
    ],
    formats: ["image/avif", "image/webp"],
    // Optimized derivatives are content-addressed and immutable, so a long TTL
    // is safe and keeps the optimizer (a Lambda on Amplify) out of the hot path.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1600, 1920, 2560],
    imageSizes: [64, 96, 128, 200, 256, 384],
  },
  async headers() {
    return [
      {
        // Media lives in Supabase Storage; this only guards local /public art.
        source: "/:path*.(png|jpg|jpeg|webp|avif|mp4|webm)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default nextConfig;
