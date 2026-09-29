import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssetScreen } from "@/components/asset/asset-screen";
import { INSTRUMENT_BY_SYMBOL, INSTRUMENTS } from "@/lib/market/universe";

/**
 * The universe is fixed and known at build time, so every asset page is
 * prerendered and an unknown symbol 404s on the server rather than rendering a
 * shell that fetches, fails and apologises.
 */
export function generateStaticParams() {
  return INSTRUMENTS.map((instrument) => ({ symbol: instrument.symbol }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const instrument = INSTRUMENT_BY_SYMBOL.get(symbol.toUpperCase());

  if (!instrument) return { title: "Not found" };

  return {
    // The root layout appends " · ember" via its title template.
    title: `${instrument.symbol} · ${instrument.name}`,
    description: `Price, ember's current read, and the figures its rules read for ${instrument.name}.`,
  };
}

export default async function AssetPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const instrument = INSTRUMENT_BY_SYMBOL.get(symbol.toUpperCase());

  if (!instrument) notFound();

  return <AssetScreen symbol={instrument.symbol} />;
}
