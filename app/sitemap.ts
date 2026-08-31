import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://mentbridge.com',
      lastModified: new Date(),
    }
  ]
}