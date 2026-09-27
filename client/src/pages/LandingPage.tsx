import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TilePattern } from "@/components/ui/TilePattern";

interface SpaceCategory {
  id: string;
  name: string;
  icon: string;
  surfaces: string[];
  recommendedTiles: string;
  benefit: string;
}

const SPACE_CATEGORIES: SpaceCategory[] = [
  {
    id: "bathrooms",
    name: "Bathrooms",
    icon: "🚿",
    surfaces: ["Floor", "Wall", "Shower Wall", "Feature Vanity Wall"],
    recommendedTiles: "Matte Anti-skid Porcelain, 600x1200mm Large Slabs, Glossy Accent Mosaics",
    benefit: "Verify how tiles look against your existing sanitaryware, chrome fittings, and natural bathroom window light.",
  },
  {
    id: "kitchens",
    name: "Kitchens",
    icon: "🍳",
    surfaces: ["Floor", "Wall", "Backsplash", "Counter-area Surroundings"],
    recommendedTiles: "Glazed Herringbone, Ceramic Subway Tiles, Stain-Resistant Vitrified Floor",
    benefit: "Check color harmony with your countertop quartz and cabinet laminate before fixing backsplash tiles.",
  },
  {
    id: "mandir",
    name: "Puja Mandirs",
    icon: "🪔",
    surfaces: ["Back Wall", "Side Walls", "Floor", "Decorative Inlays"],
    recommendedTiles: "Sandstone Carvings, Traditional Brass Inlays, Warm Marble Accents",
    benefit: "Create a serene, spiritually uplifting sanctuary without guessing how sacred motifs scale on the wall.",
  },
  {
    id: "interior-walls",
    name: "Interior Walls",
    icon: "🛋️",
    surfaces: ["Living Room Accent", "Bedroom TV Wall", "Hallway", "Foyer Entrance"],
    recommendedTiles: "Textured Travertine, 3D Fluted Ceramic, Large Format Bookmatched Marble",
    benefit: "Preview bold accent walls without the anxiety of committing to expensive wall cladding blindly.",
  },
  {
    id: "exterior",
    name: "Exterior & Outdoor",
    icon: "🏡",
    surfaces: ["Compound Walls", "Exterior Elevation", "Balcony Walls", "Outdoor Flooring"],
    recommendedTiles: "Natural Stone Cladding, Weatherproof Vitrified Tiles, Rustic Slate Slabs",
    benefit: "Understand how outdoor sunlight and landscape foliage interact with rough-hewn stone elevation tiles.",
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    number: "01",
    title: "Capture Your Space",
    desc: "Take or upload a photo of your actual bathroom, kitchen, wall, puja mandir, compound, or floor.",
  },
  {
    number: "02",
    title: "Choose Your Tile",
    desc: "Select a genuine, real product from the showroom catalog — never a fake AI-hallucinated texture.",
  },
  {
    number: "03",
    title: "Choose Where It Goes",
    desc: "Select the exact surface to retile: floor, wall, backsplash, shower wall, or feature area.",
  },
  {
    number: "04",
    title: "Try It Virtually",
    desc: "Our engine maps the tile realistically to your room's exact perspective, scale, and lighting.",
  },
  {
    number: "05",
    title: "Compare Options",
    desc: "Try 3 or more candidate tiles in the same space to see which one elevates your home the best.",
  },
  {
    number: "06",
    title: "Decide With Confidence",
    desc: "Make your purchase with total certainty before the first box of tiles is delivered or installed.",
  },
];

const COMPARISON_TILES = [
  {
    id: "calacatta",
    name: "Calacatta Gold Slabs",
    size: "600 × 1200 mm",
    finish: "Polished Glazed Vitrified",
    vibe: "Opulent, seamless, luminous",
    accentColor: "from-amber-100 to-stone-100",
    description: "Expansive white Italian marble veining that reflects window light and magnifies spatial depth.",
  },
  {
    id: "moroccan",
    name: "Zellige Terracotta Ochre",
    size: "100 × 100 mm",
    finish: "Handcrafted Satin Glaze",
    vibe: "Warm, artisanal, grounded",
    accentColor: "from-amber-200 to-orange-100",
    description: "Rich handcrafted earthy tones offering artisanal charm and cozy tactile warmth.",
  },
  {
    id: "slate",
    name: "Nero Marquina Matte",
    size: "600 × 600 mm",
    finish: "Honed Micro-Texture",
    vibe: "Modern, dramatic, high-contrast",
    accentColor: "from-stone-800 to-stone-900 text-white",
    description: "Bold dark charcoal background with delicate white lightning streaks for contemporary minimalism.",
  },
];

export function LandingPage() {
  const [activeSpaceTab, setActiveSpaceTab] = useState<string>("bathrooms");
  const [selectedComparisonTile, setSelectedComparisonTile] = useState<string>("calacatta");

  const currentSpace = SPACE_CATEGORIES.find((s) => s.id === activeSpaceTab) || SPACE_CATEGORIES[0];
  const activeTile = COMPARISON_TILES.find((t) => t.id === selectedComparisonTile) || COMPARISON_TILES[0];

  return (
    <div className="bg-stone-50 text-stone-900 selection:bg-clay-300">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-clay-100/60 via-stone-50 to-stone-50 pt-10 pb-20 sm:pt-16 sm:pb-28">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[32rem] w-[32rem] rounded-full bg-clay-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -left-32 top-1/2 h-[28rem] w-[28rem] rounded-full bg-clay-300/30 blur-3xl" />

        <div className="container-page relative grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-14">
          {/* Hero Left Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="lg:col-span-6"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-clay-300/70 bg-white/90 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-clay-900 shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-clay-500 animate-pulse" />
              The Virtual Trial Room for Your Home
            </div>

            <h1 className="mt-6 font-display text-4xl leading-[1.08] font-bold text-stone-950 sm:text-5xl lg:text-6xl">
              Your Home. <br />
              Your Tile. <br />
              <span className="text-clay-700">Your Trial Room.</span>
            </h1>

            <p className="mt-4 font-display text-xl font-medium text-stone-800 sm:text-2xl">
              Try Tiles in Your Real Space Before You Buy.
            </p>

            <p className="mt-4 max-w-lg text-base leading-relaxed text-stone-600 sm:text-lg">
              Upload a photo of your bathroom, kitchen, puja mandir, wall, floor or compound. Choose a real tile from the catalog and see a realistic preview before the first tile is installed.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/upload">
                <Button size="lg" className="shadow-lg shadow-stone-900/20 text-base">
                  Try a Tile →
                </Button>
              </Link>
              <Link to="/demos">
                <Button size="lg" variant="secondary" className="border border-clay-300 text-base">
                  See Live Demos
                </Button>
              </Link>
              <Link to="/tiles">
                <Button size="lg" variant="outline" className="text-base">
                  Explore Tile Catalog
                </Button>
              </Link>
            </div>

            {/* Trust Points */}
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-stone-200/80 pt-6 text-left">
              <div>
                <dt className="font-display text-2xl font-bold text-stone-900">100%</dt>
                <dd className="text-xs text-stone-500 leading-snug">Real Room Photo Preserved</dd>
              </div>
              <div>
                <dt className="font-display text-2xl font-bold text-stone-900">Real</dt>
                <dd className="text-xs text-stone-500 leading-snug">Showroom Catalog Products</dd>
              </div>
              <div>
                <dt className="font-display text-2xl font-bold text-stone-900">Zero</dt>
                <dd className="text-xs text-stone-500 leading-snug">Installation Guesswork</dd>
              </div>
            </dl>
          </motion.div>

          {/* Hero Right Visual: Live Tested Video Preview Frame */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.1 }}
            className="lg:col-span-6"
          >
            <div className="relative mx-auto max-w-lg lg:max-w-none">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-clay-300/40 via-stone-400/20 to-clay-200/40 blur-2xl" />

              <div className="relative overflow-hidden rounded-3xl border border-stone-800 bg-stone-950 shadow-2xl">
                {/* Header bar of video player */}
                <div className="flex items-center justify-between border-b border-stone-800 bg-stone-900 px-4 py-2.5 text-xs text-stone-300">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="font-semibold text-stone-100">REAL IN-SITU TEST:</span>
                    <span className="text-stone-400">Washroom Wall Retiling</span>
                  </div>
                  <span className="rounded bg-stone-800 px-2 py-0.5 text-[11px] font-mono text-clay-300">
                    Live Demo
                  </span>
                </div>

                {/* Video Container */}
                <div className="relative aspect-video w-full bg-black">
                  <video
                    src="/videos/washroom_tile_trial_demo.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />

                  {/* Overlaid Badges on Video */}
                  <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-stone-950/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-clay-300 backdrop-blur border border-white/10">
                    ◀ Virtual Trial: Marble
                  </div>
                  <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-stone-950/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-stone-300 backdrop-blur border border-white/10">
                    Current: Beige ▶
                  </div>

                  <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl bg-stone-950/85 px-3 py-1.5 text-xs text-stone-300 backdrop-blur border border-white/10">
                    <span className="font-medium text-white flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Fixed Camera • Exact Fixtures Preserved
                    </span>
                    <Link
                      to="/demos"
                      className="pointer-events-auto font-semibold text-clay-300 hover:text-white transition underline"
                    >
                      Watch Full Demo →
                    </Link>
                  </div>
                </div>

                {/* Trial Room Tagline Banner below video */}
                <div className="border-t border-stone-800/80 bg-stone-900/90 px-4 py-3 text-center text-xs text-stone-300">
                  <span className="font-medium text-clay-400">The room doesn't change.</span>{" "}
                  Your tile choice does.
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* The Core Formula Section */}
      <section className="border-y border-stone-200 bg-white py-16">
        <div className="container-page">
          <div className="text-center max-w-2xl mx-auto">
            <span className="rounded-full bg-clay-100 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-clay-800">
              The Virtual Trial Room Equation
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold text-stone-950 sm:text-4xl">
              Try. Compare. Visualize. Decide. Then Build.
            </h2>
            <p className="mt-3 text-stone-600">
              Don't imagine how a tile will look after installation. Combine your actual room with genuine catalog products for an honest, realistic preview.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-4 items-center">
            {/* Step 1 */}
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center shadow-soft">
              <span className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-clay-200/80 text-xl font-display font-bold text-clay-900">
                01
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-stone-900">REAL SPACE</h3>
              <p className="mt-2 text-xs text-stone-500 leading-relaxed">
                Your photograph, existing lighting, doors, windows, and permanent plumbing fixtures remain untouched.
              </p>
            </div>

            {/* Operator + */}
            <div className="hidden md:flex justify-center text-3xl font-bold text-stone-400">+</div>

            {/* Step 2 */}
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center shadow-soft">
              <span className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-clay-200/80 text-xl font-display font-bold text-clay-900">
                02
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-stone-900">REAL TILE</h3>
              <p className="mt-2 text-xs text-stone-500 leading-relaxed">
                Genuine showroom products with verified dimensions, manufacturer finishes, textures, and patterns.
              </p>
            </div>

            {/* Operator = */}
            <div className="hidden md:flex justify-center text-3xl font-bold text-stone-400">=</div>

            {/* Result */}
            <div className="rounded-2xl border border-clay-400 bg-gradient-to-br from-clay-500 to-clay-700 p-6 text-center text-white shadow-lg md:col-span-4 lg:col-span-1">
              <span className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-white/20 text-xl font-display font-bold text-white">
                ✓
              </span>
              <h3 className="mt-4 font-display text-lg font-bold">CONFIDENT DECISION</h3>
              <p className="mt-2 text-xs text-clay-100 leading-relaxed">
                Order tiles knowing precisely how they blend with your space. No regrets, no returns, no wasted materials.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Broader Product Vision: Multi-Surface Trial Room */}
      <section className="container-page py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <span className="rounded-full bg-clay-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-clay-800">
              Not Just Bathrooms
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold text-stone-950 sm:text-4xl">
              A Virtual Trial Room for Every Surface
            </h2>
            <p className="mt-3 text-stone-600">
              Whether you are renovating a single kitchen backsplash or cladding an entire exterior villa elevation, try products virtually before physical installation.
            </p>
          </div>
          <Link to="/upload">
            <Button size="lg" className="shadow-md">
              Start Trial in Your Space →
            </Button>
          </Link>
        </div>

        {/* Space Category Tabs */}
        <div className="mt-10 flex flex-wrap gap-2 border-b border-stone-200 pb-4">
          {SPACE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveSpaceTab(cat.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                activeSpaceTab === cat.id
                  ? "bg-stone-900 text-white shadow"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-100"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {/* Active Space Details */}
        <div className="mt-8 rounded-3xl border border-stone-200 bg-white p-8 shadow-soft">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{currentSpace.icon}</span>
                <h3 className="font-display text-2xl font-bold text-stone-900">{currentSpace.name} Applications</h3>
              </div>

              <p className="mt-4 text-sm text-stone-600 leading-relaxed">
                {currentSpace.benefit}
              </p>

              <div className="mt-6">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Supported Trial Surfaces:
                </h4>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {currentSpace.surfaces.map((s) => (
                    <span
                      key={s}
                      className="rounded-lg bg-clay-50 px-3 py-1.5 text-xs font-medium text-clay-900 border border-clay-200"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Recommended Catalog Finishes:
                </h4>
                <p className="mt-1 text-xs text-stone-700 font-medium">{currentSpace.recommendedTiles}</p>
              </div>

              <div className="mt-8">
                <Link to="/upload">
                  <Button size="lg" variant="outline">
                    Try {currentSpace.name} Tiles Now →
                  </Button>
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative aspect-[4/3] rounded-2xl bg-gradient-to-br from-stone-100 via-clay-50 to-stone-200 p-6 flex flex-col justify-between border border-stone-200 shadow-inner">
                <TilePattern className="absolute inset-0 h-full w-full opacity-15" />
                <div className="relative flex justify-between items-start">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-stone-800 shadow-sm">
                    In-Situ Surface Mapping
                  </span>
                  <span className="rounded-full bg-clay-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    Trial Room Mode
                  </span>
                </div>
                <div className="relative rounded-xl bg-white/95 p-4 shadow-lg backdrop-blur">
                  <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold">Real-Time Simulation</p>
                  <p className="mt-1 font-display text-base font-bold text-stone-900">
                    {currentSpace.name}: Perspective-matched tile scaling
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Preserves original lighting vectors, shadows, fixtures, and room perimeter.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Experience: Try 3 Tiles, Choose 1 With Confidence */}
      <section className="bg-stone-900 py-20 text-white">
        <div className="container-page">
          <div className="text-center max-w-2xl mx-auto">
            <span className="rounded-full bg-clay-500/20 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-clay-300">
              Interactive Decision Making
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
              Try 3 Tiles. Choose 1 With Confidence.
            </h2>
            <p className="mt-3 text-stone-300">
              The camera position, lighting, and room architecture stay identical. Toggle between different tiles below to see how the room mood transforms.
            </p>
          </div>

          {/* Interactive Tile Toggle Switcher */}
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {COMPARISON_TILES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedComparisonTile(t.id)}
                className={`flex items-center gap-2.5 rounded-2xl border px-5 py-3 text-sm font-semibold transition ${
                  selectedComparisonTile === t.id
                    ? "border-clay-400 bg-clay-500 text-white shadow-lg"
                    : "border-white/10 bg-white/5 text-stone-300 hover:bg-white/10"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-white" />
                <span>{t.name}</span>
              </button>
            ))}
          </div>

          {/* Active Comparison Tile Detail Card */}
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-5">
                <span className="rounded-md bg-clay-500/20 px-2.5 py-1 text-xs font-semibold text-clay-300">
                  Option Under Trial
                </span>
                <h3 className="mt-3 font-display text-3xl font-bold text-white">{activeTile.name}</h3>
                <p className="mt-1 text-sm text-clay-200">Aesthetic: {activeTile.vibe}</p>
                <p className="mt-4 text-sm text-stone-300 leading-relaxed">{activeTile.description}</p>

                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-xs">
                  <div>
                    <span className="text-stone-400">Dimensions:</span>
                    <p className="font-semibold text-stone-200">{activeTile.size}</p>
                  </div>
                  <div>
                    <span className="text-stone-400">Surface Finish:</span>
                    <p className="font-semibold text-stone-200">{activeTile.finish}</p>
                  </div>
                </div>

                <div className="mt-8 flex gap-3">
                  <Link to="/upload">
                    <Button size="lg" className="bg-white text-stone-950 hover:bg-clay-200">
                      Try This In My Space →
                    </Button>
                  </Link>
                  <Link to="/tiles">
                    <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                      View Catalog
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-7">
                <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 bg-stone-950 p-6 flex flex-col justify-between shadow-2xl">
                  <div className="flex justify-between items-center text-xs">
                    <span className="rounded bg-black/60 px-2.5 py-1 text-stone-300 backdrop-blur">
                      Simulated Room: Master Washroom Wall
                    </span>
                    <span className="rounded bg-emerald-500/20 px-2.5 py-1 text-emerald-300 border border-emerald-500/40">
                      Active Preview
                    </span>
                  </div>

                  <div className="text-center my-auto py-6">
                    <p className="text-xs uppercase tracking-widest text-clay-400 font-mono">Tile Preview Active</p>
                    <p className="mt-2 font-display text-2xl font-bold text-white">{activeTile.name}</p>
                    <p className="mt-1 text-xs text-stone-400">
                      Scale: 1:1 photorealistic perspective mapped to wall plane.
                    </p>
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-stone-400 border-t border-white/10 pt-3">
                    <span>Identical room fixtures maintained</span>
                    <Link to="/demos" className="text-clay-300 hover:underline">
                      See Real Video Demonstration →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works (6 Steps per Section 8) */}
      <section className="container-page py-24">
        <div className="text-center max-w-2xl mx-auto">
          <Badge tone="neutral">Simple & Transparent</Badge>
          <h2 className="mt-3 font-display text-3xl font-bold text-stone-900 sm:text-4xl">
            How The Virtual Trial Room Works
          </h2>
          <p className="mt-3 text-stone-600">
            From a quick photo on your mobile phone to complete purchasing confidence in six intuitive steps.
          </p>
        </div>

        <motion.div
          className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
        >
          {HOW_IT_WORKS_STEPS.map((step) => (
            <motion.div
              key={step.number}
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
              whileHover={{ y: -4 }}
              className="group relative rounded-2xl border border-stone-200 bg-white p-6 shadow-soft transition-all hover:shadow-lg hover:border-clay-300"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-clay-100 font-display text-base font-bold text-clay-800 transition group-hover:bg-clay-600 group-hover:text-white">
                  {step.number}
                </span>
                <span className="text-xs font-mono text-stone-400">Step {step.number}</span>
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-stone-900">{step.title}</h3>
              <p className="mt-2 text-sm text-stone-500 leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Transparency & Accuracy Requirement Section (Section 1 & 19) */}
      <section className="border-t border-stone-200 bg-white py-16">
        <div className="container-page">
          <div className="rounded-3xl border border-stone-200 bg-stone-50 p-8 sm:p-12">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-7">
                <span className="rounded-full bg-clay-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-clay-800">
                  Honest & Trustworthy
                </span>
                <h3 className="mt-3 font-display text-2xl font-bold text-stone-900 sm:text-3xl">
                  Photorealistic Previews Grounded in Reality
                </h3>
                <p className="mt-3 text-sm text-stone-600 leading-relaxed">
                  We built TileTry to provide the strongest practical visualization possible. We strictly preserve your room geometry, doors, windows, and fixtures rather than generating fantasy 3D renders.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-4 text-xs text-stone-700">
                  <div className="rounded-xl border border-stone-200 bg-white p-4">
                    <span className="font-semibold text-stone-900 block mb-1">✓ What We Guarantee:</span>
                    <span>Accurate scale, true perspective vanishing points, genuine catalog products, and camera preservation.</span>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white p-4">
                    <span className="font-semibold text-stone-900 block mb-1">ℹ️ Physical Variables:</span>
                    <span>Lighting, tile batch variation, physical grout thickness, and mason installation quality affect real outcomes.</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 text-center lg:text-right">
                <Link to="/demos">
                  <Button size="lg" variant="secondary" className="shadow-sm">
                    View Live Tested Demo Video →
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final Hero Banner (Section 20) */}
      <section className="container-page py-20">
        <motion.div
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-950 to-stone-900 px-8 py-16 text-center text-white sm:px-16 shadow-2xl"
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <TilePattern className="absolute inset-0 h-full w-full opacity-10" />
          <div className="relative max-w-2xl mx-auto">
            <span className="rounded-full bg-clay-500/20 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-clay-300">
              Open Your Trial Room
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-5xl">
              Don't Buy Tiles Blindly. <br />
              <span className="text-clay-400">Try Them in Your Space First.</span>
            </h2>
            <p className="mt-4 text-base text-stone-300 sm:text-lg">
              Your home has a trial room now. Upload your space, pick from our showroom catalog, and visualize before the first tile is fixed.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link to="/upload">
                <Button size="lg" className="bg-clay-500 hover:bg-clay-400 text-stone-950 font-semibold px-8 py-3.5 text-base shadow-lg">
                  Launch Your Trial Room →
                </Button>
              </Link>
              <Link to="/demos">
                <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 text-base">
                  Watch Live Demo
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
