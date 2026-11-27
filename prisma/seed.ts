/**
 * Demo data: launch categories, demo users and the 8 items the web app shows.
 * Safe to run again: everything is upserted by slug or email.
 * All names are fictional. Passwords come from SEED_PASSWORD, never from code.
 */
import bcrypt from "bcryptjs";
import type { UserRole } from "../src/generated/prisma/enums.ts";
import { prisma } from "../src/lib/db.ts";

function seedPassword(): string {
  const value = process.env["SEED_PASSWORD"];
  if (!value || value.length < 8) throw new Error("Set SEED_PASSWORD in .env (8+ characters) before seeding.");
  return value;
}

type SeedCategory = { slug: string; name: string; spec: string[]; rules?: string };
const groups: { slug: string; name: string; categories: SeedCategory[] }[] = [
  { slug: "electronics", name: "Electronics", categories: [
    { slug: "cameras", name: "Cameras", spec: ["sensor", "lens", "batteries"] },
    { slug: "gaming", name: "Gaming", spec: ["console", "controllers", "storage"] },
    { slug: "drones", name: "Drones", spec: ["camera", "flight_time", "batteries"] },
    { slug: "laptops", name: "Laptops", spec: ["processor", "ram", "storage"] },
    { slug: "phones", name: "Phones", spec: ["model", "storage"] },
    { slug: "audio", name: "Audio", spec: ["type", "battery_hours"] },
    { slug: "projectors", name: "Projectors", spec: ["resolution", "lumens"] },
  ] },
  { slug: "events", name: "Events & parties", categories: [
    { slug: "lights", name: "Lights", spec: ["type", "count"] },
    { slug: "sound-systems", name: "Sound systems", spec: ["watts", "speakers"] },
    { slug: "furniture", name: "Chairs & tables", spec: ["pieces"] },
  ] },
  { slug: "outdoor", name: "Travel & outdoor", categories: [
    { slug: "tents", name: "Tents", spec: ["people", "season"] },
    { slug: "trekking", name: "Trekking gear", spec: ["size"] },
  ] },
  { slug: "tools", name: "Tools & home", categories: [
    { slug: "power-tools", name: "Power tools", spec: ["watts", "battery"], rules: "Use with the safety gear listed. Return cleaned." },
    { slug: "cleaning", name: "Cleaning machines", spec: ["type"] },
  ] },
];

// Approximate centres of Ahmedabad neighbourhoods.
const areas = {
  Satellite: [23.0258, 72.5244], Bodakdev: [23.0396, 72.5066], "Prahlad Nagar": [23.0120, 72.5108],
  Navrangpura: [23.0365, 72.5611], Vastrapur: [23.0365, 72.5293], Thaltej: [23.0500, 72.5090],
  Maninagar: [22.9962, 72.6030], Bopal: [23.0335, 72.4637],
} satisfies Record<string, [number, number]>;
type Area = keyof typeof areas;

type OwnerKey = "aarav" | "neha" | "vikram" | "priya";
type SeedUser = { key: OwnerKey | "admin" | "kavya"; email: string; name: string; phone: string; role?: "admin"; area?: Area; replyHours?: number };

const users: SeedUser[] = [
  { key: "admin", email: "admin@rentxplay.test", name: "RentXPlay Admin", phone: "+919000000001", role: "admin" },
  { key: "aarav", email: "aarav@rentxplay.test", name: "Aarav S.", phone: "+919000000002", area: "Satellite", replyHours: 1 },
  { key: "neha", email: "neha@rentxplay.test", name: "Neha D.", phone: "+919000000003", area: "Bodakdev", replyHours: 2 },
  { key: "vikram", email: "vikram@rentxplay.test", name: "Vikram J.", phone: "+919000000004", area: "Prahlad Nagar", replyHours: 4 },
  { key: "priya", email: "priya@rentxplay.test", name: "Priya K.", phone: "+919000000005", area: "Navrangpura", replyHours: 1 },
  { key: "kavya", email: "kavya@rentxplay.test", name: "Kavya M.", phone: "+919000000006", area: "Vastrapur" },
];

type SeedItem = {
  slug: string; owner: OwnerKey; category: string; title: string; area: Area; description: string; inTheBox: string[];
  condition: "like_new" | "good" | "fair";
  /** Rupees per day for 1, 3+ and 7+ days. */
  prices: [number, number, number];
  deposit: number;
  /** [fee in rupees, radius in km], or null for pickup only. */
  delivery: [number, number] | null;
  days: [number, number];
  popular: boolean;
  blocks: [string, string][];
};

const rupees = (r: number) => r * 100;

const items: SeedItem[] = [
  { slug: "ps5-2-controllers", owner: "aarav", category: "gaming", title: "PS5 + 2 controllers", area: "Satellite",
    description: "PS5 disc edition with two DualSense controllers. Games not included.",
    inTheBox: ["PS5 console", "2 DualSense controllers", "HDMI cable", "Power cable"], condition: "like_new",
    prices: [500, 400, 300], deposit: 5000, delivery: [100, 8], days: [1, 30], popular: true,
    blocks: [["2026-12-05", "2026-12-07"], ["2026-12-20", "2026-12-24"]] },
  { slug: "sony-a7-iii-kit", owner: "neha", category: "cameras", title: "Sony A7 III camera kit", area: "Bodakdev",
    description: "Full-frame mirrorless body with a 28-70mm lens, two batteries and a 128 GB card.",
    inTheBox: ["Sony A7 III body", "28-70mm lens", "2 batteries + charger", "128 GB SD card", "Camera bag"], condition: "good",
    prices: [900, 800, 700], deposit: 15000, delivery: null, days: [1, 14], popular: true, blocks: [["2026-12-12", "2026-12-15"]] },
  { slug: "dji-mini-3", owner: "vikram", category: "drones", title: "DJI Mini 3 drone", area: "Prahlad Nagar",
    description: "Under 249 g drone with 4K video and 3 batteries. Check local flying rules before use.",
    inTheBox: ["DJI Mini 3", "RC controller", "3 batteries", "Charging hub", "Spare propellers"], condition: "like_new",
    prices: [600, 520, 450], deposit: 10000, delivery: [150, 10], days: [1, 10], popular: false, blocks: [] },
  { slug: "gopro-hero-12", owner: "priya", category: "cameras", title: "GoPro Hero 12 Black", area: "Navrangpura",
    description: "Waterproof action camera with chest and helmet mounts.",
    inTheBox: ["GoPro Hero 12", "2 batteries", "Chest mount", "Helmet mount", "64 GB card"], condition: "good",
    prices: [450, 380, 300], deposit: 6000, delivery: [80, 6], days: [1, 21], popular: true, blocks: [["2026-12-01", "2026-12-03"]] },
  { slug: "macbook-air-m3", owner: "aarav", category: "laptops", title: "MacBook Air M3, 16 GB", area: "Vastrapur",
    description: "13-inch MacBook Air with 16 GB RAM and 512 GB storage. Reset for every renter.",
    inTheBox: ["MacBook Air", "USB-C charger", "Sleeve"], condition: "like_new",
    prices: [1200, 1000, 800], deposit: 25000, delivery: [120, 12], days: [2, 30], popular: false, blocks: [] },
  { slug: "iphone-15-pro", owner: "neha", category: "phones", title: "iPhone 15 Pro, 256 GB", area: "Thaltej",
    description: "Unlocked iPhone 15 Pro for shoots or a backup phone. Wiped after each rental.",
    inTheBox: ["iPhone 15 Pro", "USB-C cable", "Case"], condition: "good",
    prices: [700, 600, 500], deposit: 20000, delivery: null, days: [1, 14], popular: false, blocks: [] },
  { slug: "jbl-partybox-310", owner: "vikram", category: "audio", title: "JBL PartyBox 310 speaker", area: "Maninagar",
    description: "Portable party speaker with lights, 18 hours of battery and a wired mic.",
    inTheBox: ["JBL PartyBox 310", "Wired microphone", "Power cable"], condition: "good",
    prices: [650, 550, 450], deposit: 7000, delivery: [150, 15], days: [1, 7], popular: true, blocks: [["2026-12-24", "2026-12-26"]] },
  { slug: "epson-projector-screen", owner: "priya", category: "projectors", title: "Epson projector + 100\" screen", area: "Bopal",
    description: "Full HD projector with a 100-inch tripod screen.",
    inTheBox: ["Epson projector", "100\" tripod screen", "HDMI cable", "Remote"], condition: "good",
    prices: [800, 650, 500], deposit: 8000, delivery: [200, 15], days: [1, 10], popular: false, blocks: [] },
];

async function main() {
  const passwordHash = await bcrypt.hash(seedPassword(), 12);

  for (const [g, group] of groups.entries()) {
    const saved = await prisma.categoryGroup.upsert({
      where: { slug: group.slug },
      update: { name: group.name, position: g },
      create: { slug: group.slug, name: group.name, position: g },
    });
    for (const [c, cat] of group.categories.entries()) {
      const specSchema = cat.spec.map((key) => ({ key, label: key.replace(/_/g, " "), type: "text" }));
      const data = { name: cat.name, groupId: saved.id, position: c, specSchema, rulesNote: cat.rules ?? null };
      await prisma.category.upsert({ where: { slug: cat.slug }, update: data, create: { slug: cat.slug, ...data } });
    }
  }

  const userIds = new Map<SeedUser["key"], string>();
  for (const u of users) {
    const role: UserRole = u.role ?? "user";
    const data = { name: u.name, phone: u.phone, role, area: u.area, replyHours: u.replyHours,
      phoneVerifiedAt: new Date(), kycStatus: "verified" as const };
    const saved = await prisma.user.upsert({
      where: { email: u.email },
      update: data,
      create: { email: u.email, passwordHash, ...data },
    });
    userIds.set(u.key, saved.id);
  }

  for (const it of items) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: it.category } });
    const ownerId = userIds.get(it.owner);
    if (!ownerId) throw new Error(`Seed item ${it.slug} has an unknown owner "${it.owner}".`);
    const [lat, lng] = areas[it.area];
    const [oneDay, threePlus, sevenPlus] = it.prices;
    const [minDays, maxDays] = it.days;
    const data = {
      ownerId, categoryId: category.id, title: it.title, description: it.description,
      inTheBox: it.inTheBox, condition: it.condition, area: it.area, lat, lng, popular: it.popular,
      price1dPaise: rupees(oneDay), price3dPaise: rupees(threePlus), price7dPaise: rupees(sevenPlus),
      depositPaise: rupees(it.deposit),
      deliveryFeePaise: it.delivery ? rupees(it.delivery[0]) : null, deliveryRadiusKm: it.delivery ? it.delivery[1] : null,
      minDays, maxDays, status: "live" as const,
    };
    const saved = await prisma.item.upsert({ where: { slug: it.slug }, update: data, create: { slug: it.slug, ...data } });

    await prisma.itemPhoto.deleteMany({ where: { itemId: saved.id } });
    await prisma.itemPhoto.create({ data: { itemId: saved.id, s3Key: `demo/items/${it.slug}.svg`, position: 0 } });

    await prisma.itemBlock.deleteMany({ where: { itemId: saved.id } });
    for (const [from, to] of it.blocks) {
      await prisma.itemBlock.create({
        data: { itemId: saved.id, fromDate: new Date(`${from}T00:00:00Z`), toDate: new Date(`${to}T00:00:00Z`), reason: "Demo booking" },
      });
    }
  }

  const counts = await Promise.all([prisma.categoryGroup.count(), prisma.category.count(), prisma.user.count(), prisma.item.count()]);
  console.log(`Seeded ${counts[0]} groups, ${counts[1]} categories, ${counts[2]} users, ${counts[3]} items.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
