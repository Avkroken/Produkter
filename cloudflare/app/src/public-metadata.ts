/**
 * Returnerar URL:ens origin utan avslutande snedstreck. Kastar vid ogiltig URL
 * eller om den inte använder HTTPS eller innehåller annan sökväg än /, query eller fragment.
 */
export function configuredPublicOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_APP_URL måste vara ett HTTPS-origin utan path/query");
  }
  return url.origin;
}

/** Returnerar robots.txt som tillåter crawling och anger sitemap; origin ska sakna avslutande snedstreck. */
export function robotsText(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

/** Returnerar en sitemap med enbart startsidan; origin ska vara validerat och sakna avslutande snedstreck. */
export function sitemapText(origin: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${origin}/</loc></url>\n` +
    `</urlset>\n`
  );
}
