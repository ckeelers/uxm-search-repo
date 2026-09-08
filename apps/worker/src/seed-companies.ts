import { prisma, Platform } from "@searchexperience/core";

/**
 * Seed list — companies from plans/m1-seed-companies.md plus the M4a
 * expansion. Idempotent: upserts by slug, safe to re-run. Add / disable
 * companies here or later via the /admin screens.
 *
 * `token` is the platform board id:
 *   GREENHOUSE -> boards-api.greenhouse.io/v1/boards/<token>/jobs
 *   LEVER      -> api.lever.co/v0/postings/<token>
 *   ASHBY      -> api.ashbyhq.com/posting-api/job-board/<token>
 */
type Seed = { slug: string; name: string; platform: Platform; token: string };

const GREENHOUSE: Array<[string, string, string]> = [
  ["stripe", "Stripe", "stripe"],
  ["figma", "Figma", "figma"],
  ["discord", "Discord", "discord"],
  ["gusto", "Gusto", "gusto"],
  ["lyft", "Lyft", "lyft"],
  ["pinterest", "Pinterest", "pinterest"],
  ["fivetran", "Fivetran", "fivetran"],
  ["doordash", "DoorDash", "doordashusa"],
  ["coinbase", "Coinbase", "coinbase"],
  ["dropbox", "Dropbox", "dropbox"],
  ["reddit", "Reddit", "reddit"],
  ["robinhood", "Robinhood", "robinhood"],
  ["instacart", "Instacart", "instacart"],
  ["airbnb", "Airbnb", "airbnb"],
  ["asana", "Asana", "asana"],
  ["duolingo", "Duolingo", "duolingo"],
  ["roblox", "Roblox", "roblox"],
  ["brex", "Brex", "brex"],
  ["chime", "Chime", "chime"],
  ["samsara", "Samsara", "samsara"],
  // M4a expansion
  ["anthropic", "Anthropic", "anthropic"],
  ["cloudflare", "Cloudflare", "cloudflare"],
  ["affirm", "Affirm", "affirm"],
  ["twilio", "Twilio", "twilio"],
  ["mongodb", "MongoDB", "mongodb"],
  ["datadog", "Datadog", "datadog"],
  ["elastic", "Elastic", "elastic"],
  ["gitlab", "GitLab", "gitlab"],
  ["toast", "Toast", "toast"],
  ["block", "Block", "block"],
  ["airtable", "Airtable", "airtable"],
  ["squarespace", "Squarespace", "squarespace"],
  ["webflow", "Webflow", "webflow"],
  ["carta", "Carta", "carta"],
  ["mixpanel", "Mixpanel", "mixpanel"],
  ["nextdoor", "Nextdoor", "nextdoor"],
];

const LEVER: Array<[string, string, string]> = [
  ["spotify", "Spotify", "spotify"],
  ["palantir", "Palantir", "palantir"],
];

const ASHBY: Array<[string, string, string]> = [
  ["notion", "Notion", "notion"],
  ["ramp", "Ramp", "ramp"],
  ["linear", "Linear", "linear"],
  ["vanta", "Vanta", "vanta"],
  ["openai", "OpenAI", "openai"],
  ["replit", "Replit", "replit"],
  ["cursor", "Cursor", "cursor"],
  ["sierra", "Sierra", "sierra"],
  ["harvey", "Harvey", "harvey"],
  ["decagon", "Decagon", "decagon"],
  ["baseten", "Baseten", "baseten"],
  ["hex", "Hex", "hex"],
];

const SEED: Seed[] = [
  ...GREENHOUSE.map(([slug, name, token]) => ({
    slug,
    name,
    platform: Platform.GREENHOUSE,
    token,
  })),
  ...LEVER.map(([slug, name, token]) => ({
    slug,
    name,
    platform: Platform.LEVER,
    token,
  })),
  ...ASHBY.map(([slug, name, token]) => ({
    slug,
    name,
    platform: Platform.ASHBY,
    token,
  })),
];

const CAREERS_URL: Record<Platform, (t: string) => string> = {
  GREENHOUSE: (t) => `https://job-boards.greenhouse.io/${t}`,
  LEVER: (t) => `https://jobs.lever.co/${t}`,
  ASHBY: (t) => `https://jobs.ashbyhq.com/${t}`,
  WORKDAY: (t) => t,
  GENERIC: (t) => t,
};

async function main() {
  for (const c of SEED) {
    await prisma.company.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        name: c.name,
        platform: c.platform,
        platformId: c.token,
        careersUrl: CAREERS_URL[c.platform](c.token),
      },
      update: { name: c.name, platform: c.platform, platformId: c.token },
    });
    console.log(`[seed] ${c.platform.padEnd(10)} ${c.slug}`);
  }
  const total = await prisma.company.count();
  console.log(`[seed] done — ${SEED.length} in list, ${total} companies in the index`);
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
