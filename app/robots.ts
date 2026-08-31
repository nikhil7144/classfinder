import { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: `${BRAND.siteUrl}/sitemap.xml`,
  }
}
