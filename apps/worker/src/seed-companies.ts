import { prisma, Platform } from "@searchexperience/core";

/**
 * M1 seed — the 20 Greenhouse-hosted companies from
 * plans/m1-seed-companies.md. Idempotent: upserts by slug, so it is safe to
 * re-run. Add/disable companies here or later via the /admin screens (M4).
 */
const SEED: Array<{ slug: string; name: string; token: string }> = [
  { slug: "stripe", name: "Stripe", token: "stripe" },
  { slug: "figma", name: "Figma", token: "figma" },
  { slug: "discord", name: "Discord", token: "discord" },
  { slug: "gusto", name: "Gusto", token: "gusto" },
  { slug: "lyft", name: "Lyft", token: "lyft" },
  { slug: "pinterest", name: "Pinterest", token: "pinterest" },
  { slug: "fivetran", name: "Fivetran", token: "fivetran" },
  { slug: "doordash", name: "DoorDash", token: "doordashusa" },
  { slug: "coinbase", name: "Coinbase", token: "coinbase" },
  { slug: "dropbox", name: "Dropbox", token: "dropbox" },
  { slug: "reddit", name: "Reddit", token: "reddit" },
  { slug: "robinhood", name: "Robinhood", token: "robinhood" },
  { slug: "instacart", name: "Instacart", token: "instacart" },
  { slug: "airbnb", name: "Airbnb", token: "airbnb" },
  { slug: "asana", name: "Asana", token: "asana" },
  { slug: "duolingo", name: "Duolingo", token: "duolingo" },
  { slug: "roblox", name: "Roblox", token: "roblox" },
  { slug: "brex", name: "Brex", token: "brex" },
  { slug: "chime", name: "Chime", token: "chime" },
  { slug: "samsara", name: "Samsara", token: "samsara" },
];

async function main() {
  for (const c of SEED) {
    await prisma.company.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        name: c.name,
        platform: Platform.GREENHOUSE,
        platformId: c.token,
        careersUrl: `https://job-boards.greenhouse.io/${c.token}`,
      },
      update: {
        name: c.name,
        platform: Platform.GREENHOUSE,
        platformId: c.token,
      },
    });
    console.log(`[seed] upserted ${c.slug} (${c.token})`);
  }
  const total = await prisma.company.count();
  console.log(`[seed] done — ${total} companies in the index`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[seed] failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
