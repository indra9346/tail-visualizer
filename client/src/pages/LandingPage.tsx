import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

const steps = [
  { title: "Upload Your Room", desc: "Take or upload a clear photo of the unfinished space." },
  { title: "Analyze the Space", desc: "Our AI identifies the room type, surfaces, and construction state." },
  { title: "Explore Suitable Tiles", desc: "Browse real, in-catalog tiles matched to your room." },
  { title: "Choose a Real Tile", desc: "Pick an actual product — not a mockup or placeholder." },
  { title: "Visualize Your Finished Room", desc: "See a photorealistic render of your space with that tile applied." },
];

const features = [
  { title: "Real room visualization", desc: "Every render starts from your actual uploaded photo — geometry, light, and layout preserved." },
  { title: "Actual tile catalog", desc: "Every tile you see is a real, purchasable product from our catalog. Nothing is invented." },
  { title: "AI-assisted recommendations", desc: "Get suggestions grounded in your room's construction state and the real catalog." },
  { title: "Try different tiles", desc: "Compare as many real tiles as you like on the same room without repeating analysis." },
  { title: "Save your projects", desc: "Come back anytime to continue a room or revisit a past visualization." },
];

export function LandingPage() {
  return (
    <div>
      <section className="container-page pt-14 sm:pt-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h1 className="font-display text-4xl leading-tight text-stone-900 sm:text-5xl lg:text-6xl">
              Visualize Your Space Before You Build
            </h1>
            <p className="mt-5 max-w-lg text-lg text-stone-600">
              Upload a photo of your unfinished room, explore a real tile catalog, and get an AI-powered photorealistic
              visualization of your selected tile in your actual space.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/upload">
                <Button size="lg">Visualize My Room</Button>
              </Link>
              <Link to="/tiles">
                <Button size="lg" variant="outline">
                  Explore Tiles
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-gradient-to-br from-stone-200 to-clay-100 shadow-soft"
          >
            <svg viewBox="0 0 400 300" className="h-full w-full" aria-hidden="true">
              <rect width="400" height="300" fill="#ede4d8" />
              <rect x="0" y="200" width="400" height="100" fill="#d4b892" opacity="0.5" />
              <rect x="40" y="60" width="90" height="120" fill="#fff" opacity="0.6" rx="4" />
              <rect x="270" y="40" width="90" height="90" fill="#fff" opacity="0.5" rx="4" />
              {Array.from({ length: 8 }).map((_, i) => (
                <line key={i} x1={i * 50} y1="200" x2={i * 50} y2="300" stroke="#a68a63" strokeWidth="1" opacity="0.4" />
              ))}
            </svg>
            <div className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-stone-700 shadow">
              AI-powered photorealistic visualization
            </div>
          </motion.div>
        </div>
      </section>

      <section className="container-page mt-24 sm:mt-32">
        <h2 className="font-display text-3xl text-stone-900">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, i) => (
            <Card key={step.title}>
              <CardBody>
                <span className="font-display text-2xl text-clay-500">{i + 1}</span>
                <h3 className="mt-2 text-base font-semibold text-stone-900">{step.title}</h3>
                <p className="mt-1 text-sm text-stone-500">{step.desc}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section className="container-page mt-24 mb-24 sm:mt-32 sm:mb-32">
        <h2 className="font-display text-3xl text-stone-900">Built on real data, not guesswork</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <CardBody>
                <h3 className="text-base font-semibold text-stone-900">{f.title}</h3>
                <p className="mt-1.5 text-sm text-stone-500">{f.desc}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
