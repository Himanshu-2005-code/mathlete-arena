import type { Metadata } from "next";

/** Tab title and link preview name the player, e.g. "himanshu · Mathlete Arena". */
export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const player = decodeURIComponent(name);
  return {
    title: player,
    description: `${player}'s rating, duel record, streak and best scores on Mathlete Arena.`,
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
