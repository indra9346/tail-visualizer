import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { TilePattern } from "@/components/ui/TilePattern";

const steps = [
  { title: "Upload your room", desc: "Snap a clear photo of the unfinished space." },
  { title: "Analyze the space", desc: "AI identifies the room type, surfaces and condition." },
  { title: "Explore suitable tiles", desc: "Browse real tiles matched to your room." },
  { title: "Choose a real tile", desc: "Pick an actual catalog product, never a mockup." },
  { title: "Visualize the result", desc: "See a photorealistic preview of your finished room." },
];

const features = [
  { icon: "◧", title: "Your real room", desc: "Every render starts from your own photo, keeping its layout, doors, windows and light." },
  { icon: "▦", title: "A real tile catalog", desc: "Every tile shown is a genuine product. Nothing is invented by the AI." },
  { icon: "✦", title: "Smart recommendations", desc: "Suggestions grounded in your room and the actual catalog." },
  { icon: "⇄", title: "Try as many as you like", desc: "Swap tiles on the same room without re-analyzing it." },
  { icon: "▣", title: "Compare before / after", desc: "Drag a slider to see exactly what changes." },
  { icon: "☰", title: "Saved projects", desc: "Come back anytime to continue or revisit a visualization." },
];

export function LandingPage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-b from-clay-50 via-stone-50 to-stone-50">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-clay-200/50 blur-3xl" />
        <div className="container-page relative grid gap-12 pb-20 pt-14 sm:pt-20 lg:grid-cols-2 lg:items-center lg:gap-16">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-clay-200 bg-white px-3.5 py-1.5 text-xs font-medium text-clay-800">
              <span className="h-1.5 w-1.5 rounded-full bg-clay-500" /> AI-powered photorealistic visualization
            </span>
            <h1 className="mt-6 font-display text-4xl leading-[1.1] text-stone-900 sm:text-5xl lg:text-6xl">
              Visualize Your Space <span className="text-clay-600">Before You Build</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-stone-600">
              Upload a photo of your unfinished room, explore a real tile catalog, and see your chosen tile applied in your actual space.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/upload">
                <Button size="lg" className="shadow-lg shadow-stone-900/20">
                  Visualize My Room →
                </Button>
              </Link>
              <Link to="/tiles">
                <Button size="lg" variant="outline">
                  Explore Tiles
                </Button>
              </Link>
            </div>
            <dl className="mt-10 flex gap-8 text-sm">
              {[
                ["Real", "catalog tiles only"],
                ["Your", "own room photo"],
                ["Free", "to try"],
              ].map(([big, small]) => (
                <div key={big}>
                  <dt className="font-display text-2xl text-stone-900">{big}</dt>
                  <dd className="text-stone-500">{small}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative"
          >
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-clay-200 to-clay-100 opacity-70 blur-xl" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white bg-white shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-b from-stone-100 to-clay-100" />
              <div className="absolute left-[8%] top-[10%] h-[45%] w-[22%] rounded-md bg-white/80 shadow-inner" />
              <div className="absolute right-[10%] top-[8%] h-[30%] w-[26%] rounded-md bg-white/70 shadow-inner" />
              <TilePattern className="absolute bottom-0 left-0 h-[42%] w-full [transform:perspective(500px)_rotateX(35deg)] [transform-origin:bottom]" />
              <span className="absolute bottom-4 left-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-stone-700 shadow">
                Before → After in one click
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="container-page py-20">
        <div className="max-w-xl">
          <h2 className="font-display text-3xl text-stone-900 sm:text-4xl">How it works</h2>
          <p className="mt-3 text-stone-600">From a phone photo to a finished-room preview in five simple steps.</p>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, i) => (
            <li key={step.title} className="group relative rounded-2xl border border-stone-200 bg-white p-5 shadow-soft transition hover:-translate-y-1 hover:shadow-lg">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-clay-100 font-display text-lg text-clay-700 transition group-hover:bg-clay-500 group-hover:text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 text-base font-semibold text-stone-900">{step.title}</h3>
              <p className="mt-1 text-sm text-stone-500">{step.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-stone-900 py-20 text-white">
        <div className="container-page">
          <h2 className="max-w-xl font-display text-3xl sm:text-4xl">Built on real data, not guesswork</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:bg-white/10">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-clay-500/20 text-xl text-clay-300">{f.icon}</span>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-stone-300">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-clay-600 to-clay-800 px-8 py-14 text-center text-white sm:px-16">
          <TilePattern className="absolute inset-0 h-full w-full opacity-10" />
          <div className="relative">
            <h2 className="font-display text-3xl sm:text-4xl">Ready to see your room finished?</h2>
            <p className="mx-auto mt-3 max-w-md text-clay-100">Create a free account and try your first visualization in minutes.</p>
            <Link to="/upload" className="mt-8 inline-block">
              <Button size="lg" variant="secondary">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
