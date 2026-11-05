import type { MetadataRoute } from "next";

// Public indexing is enabled only as part of the reviewed launch, never by NODE_ENV.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] } };
}
