import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";

interface DemoScenario {
  id: string;
  title: string;
  category: string;
  surface: string;
  tileName: string;
  description: string;
  originalDescription: string;
  transformedDescription: string;
  keyHighlights: string[];
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "washroom-wall",
    title: "Residential Washroom Wall Retiling",
    category: "Bathroom",
    surface: "Vertical Wall Tiles",
    tileName: "Calacatta Gold 600x1200mm Polished Slab",
    description: "Real-life tested transformation of an Indian apartment bathroom. The existing outdated square beige wall tiles are digitally replaced with luxury continuous marble slabs.",
    originalDescription: "Outdated beige ceramic tiles with worn grout lines, standard wash basin, and wall plumbing.",
    transformedDescription: "Seamless floor-to-ceiling Calacatta marble look with true window light refraction.",
    keyHighlights: [
      "100% fixed camera angle and room geometry",
      "Exact plumbing, toilet, basin, and mirror preserved",
      "True-to-scale tile aspect ratio (600x1200mm)",
      "Realistic specular glare from bathroom window",
    ],
  },
  {
    id: "kitchen-backsplash",
    title: "Modular Kitchen Backsplash",
    category: "Kitchen",
    surface: "Backsplash & Counter Wall",
    tileName: "Emerald Herringbone Glazed Ceramic",
    description: "Testing glazed green herringbone subway tiles against white quartz countertops and oak cabinets.",
    originalDescription: "Unfinished plastered wall behind gas stove and chimney.",
    transformedDescription: "Glossy emerald herringbone pattern with subtle under-cabinet LED light reflection.",
    keyHighlights: [
      "Chimney, hob, and cabinetry outlines preserved",
      "Accurate 45-degree herringbone interlocking",
      "Moisture-resistant glazed finish appearance",
      "Natural shadows beneath overhead shelves",
    ],
  },
  {
    id: "puja-mandir",
    title: "Puja Mandir Sanctum Wall",
    category: "Puja Room",
    surface: "Accent Sanctum Wall",
    tileName: "Traditional Brass Inlay Sandstone",
    description: "Visualizing traditional warm stone tiles with gold-embossed spiritual motifs for home prayer sanctums.",
    originalDescription: "Plain white painted alcove wall with brass idol shelf.",
    transformedDescription: "Textured sandstone tiles with warm recessed light reflection.",
    keyHighlights: [
      "Idol placement and shelf dimensions unchanged",
      "Authentic matte-sandstone texture depth",
      "Warm ambient brass tone fidelity",
      "Spiritual sacred ambience without guesswork",
    ],
  },
  {
    id: "exterior-compound",
    title: "Villa Exterior & Compound Wall",
    category: "Exterior",
    surface: "Compound Wall Cladding",
    tileName: "Charcoal Slate Interlocking Cladding",
    description: "Testing heavy textured slate elevation tiles against harsh exterior sunlight and landscape surroundings.",
    originalDescription: "Dull plastered concrete boundary wall with iron gate.",
    transformedDescription: "Chiseled natural slate elevation cladding with 3D shadow relief.",
    keyHighlights: [
      "Gate, driveway, and outdoor foliage preserved",
      "Realistic rough-hewn stone elevation shadows",
      "Outdoor direct sunlight calibration",
      "Weather-resistant visual representation",
    ],
  },
];

export function DemosPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedScenario, setSelectedScenario] = useState<string>("washroom-wall");
  const [videoTime, setVideoTime] = useState(0);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleSpeedChange = (speed: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  const jumpToTime = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = seconds;
    videoRef.current.play();
    setIsPlaying(true);
  };

  const currentScenario = DEMO_SCENARIOS.find((s) => s.id === selectedScenario) || DEMO_SCENARIOS[0];

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      {/* Top Banner */}
      <section className="border-b border-stone-200 bg-white py-12">
        <div className="container-page">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 border border-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Tested Proof
                </span>
                <span className="text-xs text-stone-400">|</span>
                <span className="text-xs font-medium text-stone-500">In-Situ Washroom Wall Test</span>
              </div>
              <h1 className="mt-3 font-display text-3xl font-semibold text-stone-900 sm:text-4xl lg:text-5xl">
                The Virtual Trial Room <span className="text-clay-600">in Action</span>
              </h1>
              <p className="mt-3 max-w-2xl text-base text-stone-600 sm:text-lg">
                Watch how a real washroom with dated beige tiles is transformed into a modern luxury marble finish — without touching a single pipe, basin, or camera coordinate.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/upload">
                <Button size="lg" className="shadow-lg shadow-stone-900/15">
                  Try Your Own Space →
                </Button>
              </Link>
              <Link to="/tiles">
                <Button size="lg" variant="outline">
                  Browse Catalog
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Video Showcase */}
      <section className="container-page mt-10">
        <div className="overflow-hidden rounded-3xl border border-stone-800 bg-stone-950 shadow-2xl">
          {/* Video Player Header Bar */}
          <div className="flex flex-wrap items-center justify-between border-b border-stone-800 bg-stone-900/80 px-5 py-3 text-xs text-stone-400">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="font-semibold text-stone-200">LIVE DEMO:</span>
              <span>Washroom Wall Tile Transformation</span>
            </div>
            <div className="flex items-center gap-4 text-stone-400">
              <span>Resolution: 1080p Cinematic</span>
              <span>•</span>
              <span>Camera: Fixed Tripod</span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">100% Geometry Preserved</span>
            </div>
          </div>

          {/* Video Frame */}
          <div className="relative aspect-video w-full overflow-hidden bg-black group">
            <video
              ref={videoRef}
              src="/videos/washroom_tile_trial_demo.mp4"
              className="h-full w-full object-contain"
              autoPlay
              loop
              muted={isMuted}
              playsInline
              onTimeUpdate={() => {
                if (videoRef.current) {
                  setVideoTime(videoRef.current.currentTime);
                }
              }}
            />

            {/* In-Video Badges / Overlays */}
            <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
              <span className="rounded-lg bg-stone-950/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-clay-300 backdrop-blur border border-white/10 shadow-lg">
                ◀ LEFT: Virtual Trial Room (Calacatta Slabs)
              </span>
            </div>
            <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-2">
              <span className="rounded-lg bg-stone-950/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-stone-300 backdrop-blur border border-white/10 shadow-lg">
                RIGHT: Original Space (Dated Beige) ▶
              </span>
            </div>

            {/* Center Laser Mapping Indicator */}
            <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-stone-950/80 px-4 py-1.5 text-xs font-medium text-stone-200 backdrop-blur border border-clay-500/40 shadow-lg">
              ✨ Real-time Surface Perspective & Specular Light Mapping
            </div>

            {/* Video Controls Bar Overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950 via-stone-950/80 to-transparent p-4 transition-opacity duration-300">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-stone-900 transition hover:bg-clay-300 shadow"
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </svg>
                    )}
                  </button>

                  <span className="text-xs font-mono text-stone-300">
                    {Math.floor(videoTime)}s / 10s
                  </span>
                </div>

                {/* Timeline quick jump markers */}
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-stone-400">
                  <span className="mr-1">Jump to:</span>
                  <button
                    onClick={() => jumpToTime(0)}
                    className="rounded bg-white/10 px-2 py-1 text-stone-300 hover:bg-white/20 transition"
                  >
                    00:00 Original
                  </button>
                  <button
                    onClick={() => jumpToTime(3)}
                    className="rounded bg-white/10 px-2 py-1 text-stone-300 hover:bg-white/20 transition"
                  >
                    00:03 Surface Scan
                  </button>
                  <button
                    onClick={() => jumpToTime(6)}
                    className="rounded bg-white/10 px-2 py-1 text-stone-300 hover:bg-white/20 transition"
                  >
                    00:06 Marble Slab Trial
                  </button>
                  <button
                    onClick={() => jumpToTime(9)}
                    className="rounded bg-white/10 px-2 py-1 text-stone-300 hover:bg-white/20 transition"
                  >
                    00:09 Side-by-Side
                  </button>
                </div>

                {/* Playback speed */}
                <div className="flex items-center gap-1">
                  {[0.75, 1, 1.25].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => handleSpeedChange(speed)}
                      className={`rounded px-2 py-1 text-xs font-medium transition ${
                        playbackSpeed === speed
                          ? "bg-clay-500 text-white"
                          : "bg-white/10 text-stone-300 hover:bg-white/20"
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Pillars of Verification */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Fixed Architecture",
              icon: "🏛️",
              desc: "Toilet, washbasin, chrome shower, window, and mirror remain in the exact pixel coordinates.",
            },
            {
              title: "True Perspective & Scale",
              icon: "📐",
              desc: "Tile dimensions conform to wall height and camera vanishing lines, not a flat photoshop stretch.",
            },
            {
              title: "Specular Lighting",
              icon: "✨",
              desc: "Window light and indoor bathroom fixtures reflect off tile glaze with physically accurate highlights.",
            },
            {
              title: "Precise Grout Simulation",
              icon: "▦",
              desc: "Realistic grout thickness and alignment previewed before the mason cuts the first piece.",
            },
          ].map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft transition hover:shadow-md"
            >
              <span className="text-2xl">{pillar.icon}</span>
              <h3 className="mt-3 font-semibold text-stone-900">{pillar.title}</h3>
              <p className="mt-1 text-xs text-stone-500 leading-relaxed">{pillar.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Scenario Breakdown / Multi-Space Showcase */}
      <section className="container-page mt-20">
        <div className="text-center max-w-2xl mx-auto">
          <Badge tone="clay">Surface Versatility</Badge>
          <h2 className="mt-3 font-display text-3xl font-semibold text-stone-900 sm:text-4xl">
            A Trial Room For Every Surface in Your Home
          </h2>
          <p className="mt-3 text-stone-600">
            From compact bathroom renovations to full villa exterior cladding, see how TileTry handles diverse surfaces with pinpoint accuracy.
          </p>
        </div>

        {/* Scenario Selector Tabs */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {DEMO_SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => setSelectedScenario(scenario.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                selectedScenario === scenario.id
                  ? "bg-stone-900 text-white shadow-md"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-100"
              }`}
            >
              {scenario.title}
            </button>
          ))}
        </div>

        {/* Active Scenario Detail Card */}
        <div className="mt-8">
          <Card className="overflow-hidden border-stone-200 shadow-lg">
            <CardBody className="p-8">
              <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-clay-100 px-2.5 py-1 text-xs font-semibold text-clay-800">
                      {currentScenario.category}
                    </span>
                    <span className="text-xs text-stone-400">Target Surface:</span>
                    <span className="text-xs font-medium text-stone-700">{currentScenario.surface}</span>
                  </div>

                  <h3 className="mt-4 font-display text-2xl font-semibold text-stone-900">
                    {currentScenario.title}
                  </h3>
                  <p className="mt-2 text-sm font-medium text-clay-700">
                    Selected Product: {currentScenario.tileName}
                  </p>
                  <p className="mt-3 text-sm text-stone-600 leading-relaxed">
                    {currentScenario.description}
                  </p>

                  <div className="mt-6 border-t border-stone-100 pt-5">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                      Verification Checklist
                    </h4>
                    <ul className="mt-3 space-y-2">
                      {currentScenario.keyHighlights.map((hl, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-stone-700">
                          <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{hl}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-8">
                    <Link to="/upload">
                      <Button size="lg" className="w-full sm:w-auto">
                        Test This Tile in My Room →
                      </Button>
                    </Link>
                  </div>
                </div>

                <div className="lg:col-span-7">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                      <div className="flex items-center justify-between text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                        <span>Current Space</span>
                        <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px]">Before</span>
                      </div>
                      <div className="aspect-[4/3] rounded-xl bg-stone-200 overflow-hidden relative border border-stone-300 flex items-center justify-center text-stone-400 text-xs p-4 text-center">
                        <p>{currentScenario.originalDescription}</p>
                      </div>
                      <p className="mt-3 text-xs text-stone-500">
                        High risk of mismatch if ordered without visual trial.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-clay-200 bg-clay-50/50 p-4">
                      <div className="flex items-center justify-between text-xs font-semibold text-clay-800 uppercase tracking-wider mb-2">
                        <span>Virtual Preview</span>
                        <span className="rounded bg-clay-200 px-1.5 py-0.5 text-[10px] text-clay-900 font-bold">TileTry</span>
                      </div>
                      <div className="aspect-[4/3] rounded-xl bg-white overflow-hidden relative border border-clay-300 flex items-center justify-center text-stone-700 text-xs p-4 text-center shadow-inner">
                        <p className="font-medium text-stone-800">{currentScenario.transformedDescription}</p>
                      </div>
                      <p className="mt-3 text-xs text-clay-800 font-medium">
                        Instant confidence before laying down mortar and buying boxes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Comparison: Traditional vs TileTry */}
      <section className="container-page mt-24">
        <div className="overflow-hidden rounded-3xl bg-stone-900 p-8 sm:p-12 text-white">
          <div className="max-w-2xl">
            <span className="rounded-full bg-clay-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-clay-300">
              The Fundamental Difference
            </span>
            <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
              Why Traditional Tile Buying Leads to Costly Regrets
            </h2>
            <p className="mt-3 text-stone-300">
              A 4-inch tile sample under harsh fluorescent showroom lamps looks completely different when installed across 200 square feet of your bathroom.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-6">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                <span>✕</span> Traditional Guesswork
              </div>
              <ul className="mt-4 space-y-3 text-xs sm:text-sm text-stone-300">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 shrink-0">•</span>
                  <span>Small isolated tile piece viewed under showroom spotlights</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 shrink-0">•</span>
                  <span>Blind imagination of how it interacts with your existing fixtures</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 shrink-0">•</span>
                  <span>Shock after installation when the color tone clashes with the vanity</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 shrink-0">•</span>
                  <span>Extremely expensive tile removal, wall repair, and re-purchase</span>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-6">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <span>✓</span> TileTry Virtual Trial Room
              </div>
              <ul className="mt-4 space-y-3 text-xs sm:text-sm text-stone-200">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 shrink-0">•</span>
                  <span>Actual photo of YOUR real room with your real lighting and fixtures</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 shrink-0">•</span>
                  <span>Photorealistic preview rendered with correct scale and perspective</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 shrink-0">•</span>
                  <span>Compare 3 different tiles side-by-side in the same room</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 shrink-0">•</span>
                  <span>Total decision confidence before physical work begins</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer Section */}
      <section className="container-page mt-20">
        <div className="rounded-3xl border border-stone-200 bg-white p-8 sm:p-12 text-center shadow-lg">
          <h2 className="font-display text-3xl font-semibold text-stone-900 sm:text-4xl">
            Don't Buy Tiles Blindly. Try Them in Your Space First.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-stone-600">
            Take 30 seconds to snap your bathroom, kitchen, or wall photo. Try real showroom tiles virtually and build with complete peace of mind.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/upload">
              <Button size="lg" className="shadow-lg shadow-stone-900/15">
                Start Your Virtual Trial →
              </Button>
            </Link>
            <Link to="/tiles">
              <Button size="lg" variant="outline">
                Explore Tile Catalog
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
