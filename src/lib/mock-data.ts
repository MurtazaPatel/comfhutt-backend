export interface Property {
  id: string;
  title: string;
  city: string;
  state: string;
  locality: string;
  price_inr: number;
  min_token_price_inr: number;
  tokens_total: number;
  tokens_sold: number;
  area_sqm: number;
  bedrooms: number;
  type: "Residential" | "Commercial";
  possession_status: "Ready" | "Under Construction";
  credibility_score: number;
  projected_yield_percent: number;
  rera: string | null;
  photos: string[];
  spv_backed: boolean;
  last_rescored_at: string;
  short_description: string;
  source: string;
}

const REGIONS = [
  { city: "Ahmedabad", state: "Gujarat", localities: ["Bopal", "Satellite", "Gota"] },
  { city: "Mumbai", state: "Maharashtra", localities: ["Bandra West", "Andheri East", "Powai"] },
  { city: "Pune", state: "Maharashtra", localities: ["Koregaon Park", "Viman Nagar", "Hinjewadi"] },
  { city: "Bangalore", state: "Karnataka", localities: ["Indiranagar", "Koramangala", "Whitefield"] },
  { city: "Hyderabad", state: "Telangana", localities: ["Gachibowli", "Jubilee Hills", "HITEC City"] },
  { city: "Chennai", state: "Tamil Nadu", localities: ["Adyar", "Anna Nagar", "Velachery"] },
];

const PROPERTY_TITLES = [
  "Skyline Residency", "Green Valley Apartments", "Tech Park View", "Urban Heights", "Lakeside Villas",
  "Metro City Plaza", "Gardenia Estates", "Palm Grove", "Elite Towers", "Riverside Condos",
  "Sunshine Enclave", "Harmony Homes", "Prestige Point", "Sapphire Heights", "Emerald Greens"
];

const PHOTOS_POOL = [
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?q=80&w=800&auto=format&fit=crop", // Apartment
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=800&auto=format&fit=crop", // Modern building
  "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800&auto=format&fit=crop", // Office
  "https://images.unsplash.com/photo-1600596542815-2250657d2fc5?q=80&w=800&auto=format&fit=crop", // House
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=800&auto=format&fit=crop", // Villa
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?q=80&w=800&auto=format&fit=crop", // House 2
  "https://images.unsplash.com/photo-1582407947304-fd86f028f716?q=80&w=800&auto=format&fit=crop", // Interior
  "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?q=80&w=800&auto=format&fit=crop", // Modern home
];

// Seeded random for consistency
const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

export function generateProperties(count: number = 20): Property[] {
  const properties: Property[] = [];

  // Ensure at least one from each required state/region
  const requiredRegions = [
    { city: "Ahmedabad", state: "Gujarat" },
    { city: "Mumbai", state: "Maharashtra" }, // Covers Maharashtra
    { city: "Bangalore", state: "Karnataka" },
    { city: "Hyderabad", state: "Telangana" },
    { city: "Chennai", state: "Tamil Nadu" },
  ];

  for (let i = 0; i < count; i++) {
    const isRequired = i < requiredRegions.length;
    let region;
    
    if (isRequired) {
      region = REGIONS.find(r => r.city === requiredRegions[i].city)!;
    } else {
      region = REGIONS[Math.floor(seededRandom(i) * REGIONS.length)];
    }

    const locality = region.localities[Math.floor(seededRandom(i + 1) * region.localities.length)];
    const priceBase = 5000000 + Math.floor(seededRandom(i + 2) * 45000000); // 50L to 5Cr
    const tokensTotal = 10000;
    const minTokenPrice = Math.round((priceBase / tokensTotal) / 100) * 100; // Round to nearest 100
    
    // Randomize sold tokens (some low, some high for "Hot" status)
    const tokensSold = Math.floor(seededRandom(i + 3) * tokensTotal); 
    
    const photos = [
      PHOTOS_POOL[Math.floor(seededRandom(i + 4) * PHOTOS_POOL.length)],
      PHOTOS_POOL[Math.floor(seededRandom(i + 5) * PHOTOS_POOL.length)],
      PHOTOS_POOL[Math.floor(seededRandom(i + 6) * PHOTOS_POOL.length)],
    ];

    properties.push({
      id: `prop-${i + 1}`,
      title: `${PROPERTY_TITLES[i % PROPERTY_TITLES.length]}`,
      city: region.city,
      state: region.state,
      locality: locality,
      price_inr: priceBase,
      min_token_price_inr: minTokenPrice,
      tokens_total: tokensTotal,
      tokens_sold: tokensSold,
      area_sqm: 60 + Math.floor(seededRandom(i + 7) * 150),
      bedrooms: 1 + Math.floor(seededRandom(i + 8) * 3),
      type: seededRandom(i + 9) > 0.8 ? "Commercial" : "Residential",
      possession_status: seededRandom(i + 10) > 0.3 ? "Ready" : "Under Construction",
      credibility_score: 60 + Math.floor(seededRandom(i + 11) * 35), // 60-95
      projected_yield_percent: 2.5 + parseFloat((seededRandom(i + 12) * 4).toFixed(1)), // 2.5 - 6.5%
      rera: seededRandom(i + 13) > 0.2 ? `PR/${region.state.slice(0,2).toUpperCase()}/${Math.floor(seededRandom(i)*10000)}` : null,
      photos: Array.from(new Set(photos)), // Unique photos
      spv_backed: true,
      last_rescored_at: new Date(Date.now() - Math.floor(seededRandom(i + 14) * 1000000000)).toISOString(),
      short_description: `Premium ${locality} property with high rental yield potential. Secure SPV structure.`,
      source: "fabricated MVP heuristic"
    });
  }

  return properties;
}

export function getPropertyById(id: string): Property | undefined {
  const allProperties = generateProperties(50); // Generate enough to likely cover the id
  return allProperties.find(p => p.id === id);
}
