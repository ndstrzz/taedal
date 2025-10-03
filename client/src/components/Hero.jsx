import Ballpit from './Ballpit';

export default function Hero() {
  return (
    <section className="relative w-full min-h-[70vh] overflow-hidden">
      {/* background */}
      <div className="absolute inset-0">
        <Ballpit
          // good defaults; tweak later
          count={160}
          gravity={0.08}
          friction={0.9975}
          wallBounce={0.95}
          followCursor={true}
          colors={[0xffffff, 0x5a55ff, 0x111111]}  // white/purple/dark
          className="w-full h-full"
        />
      </div>

      {/* foreground content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16 text-center">
        {/* put your Taedal logo + text here */}
        <h1 className="text-4xl md:text-6xl font-bold text-white drop-shadow">
          Your headline here
        </h1>
        <p className="mt-4 text-white/80">Subtext / CTA</p>
      </div>

      {/* gentle fades to keep text readable */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
    </section>
  );
}
