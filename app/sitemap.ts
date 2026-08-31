import { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BRAND.siteUrl, lastModified: new Date() },
    { url: `${BRAND.siteUrl}/signup/seeker`, lastModified: new Date() },
    { url: `${BRAND.siteUrl}/signup/provider`, lastModified: new Date() },
  ]
}
